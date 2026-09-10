const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay.service');
const logger = require('../utils/logger');
const { spendCredits } = require('../utils/wallet');
// Imported as a namespace (not destructured) so the single R2 hook call site
// below dispatches through enrolmentUtil.onEnrolmentPaid at call time — the seam
// R2 (and the R1 tests) target.
const enrolmentUtil = require('../utils/enrolment');

// One-time shop enrolment fee (Batch R1). Owner-authed: the shop is taken from
// req.user.shopId (set by the owner auth middleware from the JWT payload — the
// same source subscription.controller uses). Money is integer paise.
//
// The whole feature is dormant behind enrolment_fee_enabled (default 'false'):
// config/mine always work so the frontend can read state, but order/confirm are
// hard-locked with 403 enrolment_disabled until an admin flips the flag.

// Guard used by order/confirm: block the flow entirely when the feature is off.
function assertEnabled(cfg) {
  if (!cfg.enabled) throw ApiError.forbidden('enrolment_disabled');
}

// Mark a pending enrolment paid atomically + idempotently, then fire the R2 hook.
// Returns the paid row. If the row was already paid (rowCount 0), returns the
// existing paid row WITHOUT re-firing the hook — a confirm can never double-process.
//
// CAPTURE-TIME DEBIT (Batch R5): the pending->paid UPDATE and the Khata Credits
// debit run inside ONE transaction, so the credit is debited exactly when — and
// only when — the payment actually confirms. An abandoned Razorpay checkout stays
// pending (credits_debited=false) and is never debited. The credits_debited guard
// makes the debit idempotent (a second confirm can never re-debit). The debit is
// clamped to the current balance so it can never throw `insufficient`.
// onEnrolmentPaid fires AFTER commit, unchanged, best-effort.
async function markPaid(enrolment, paymentId) {
  const result = await withTx(async (c) => {
    const upd = await c.query(
      `UPDATE enrolments
          SET status = 'paid', provider_payment_id = COALESCE($2, provider_payment_id), paid_at = NOW()
        WHERE id = $1 AND status = 'pending'
        RETURNING id, shop_id, tier, amount_paise, status, paid_at, wallet_applied_paise, credits_debited`,
      [enrolment.id, paymentId || null]
    );

    if (upd.rowCount !== 1) {
      // Already paid / raced: return the existing paid row, do NOT re-debit or re-fire.
      const existing = await c.query(
        `SELECT id, shop_id, tier, amount_paise, status, paid_at FROM enrolments WHERE id = $1`,
        [enrolment.id]
      );
      return { row: existing.rows[0], transitioned: false };
    }

    const row = upd.rows[0];
    const intended = Number(row.wallet_applied_paise) || 0;

    // Debit the applied credits ON the paid transition — but only for a row that
    // recorded credit intent and has NOT already been debited. The full-credit and
    // manual-mode paths debit at order time and set credits_debited=true, so they
    // are skipped here. Read the current balance and clamp: actual = min(intended,
    // balance) so the guarded debit can never trip `insufficient`; if the balance
    // is 0, skip the debit entirely but still mark the row debited.
    if (intended > 0 && row.credits_debited !== true) {
      const bal = await c.query(
        "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
        [row.shop_id]
      );
      const balance = bal.rowCount ? Number(bal.rows[0].balance_paise) : 0;
      const actual = Math.min(intended, balance);
      if (actual > 0) {
        await spendCredits(
          { shop: row.shop_id, amount_paise: actual, purpose: 'redeem_enrolment', ref_note: `enrolment ${row.id}`, created_by: null },
          c
        );
      }
      if (actual < intended) {
        // The shop spent credits elsewhere between order and confirm (practically
        // impossible mid-checkout). It simply gets the smaller credit it could
        // still afford — never a failed payment.
        logger.warn({ enrolmentId: row.id, intended, actual }, 'Enrolment capture debited less than intended (balance changed since order)');
      }
      // Persist the ACTUAL credit applied + close the guard (even when actual===0:
      // the balance was gone, and the debit must never be retried).
      await c.query(
        `UPDATE enrolments SET wallet_applied_paise = $2, credits_debited = true WHERE id = $1`,
        [row.id, actual]
      );
      row.wallet_applied_paise = actual;
      row.credits_debited = true;
    }
    return { row, transitioned: true };
  });

  if (result.transitioned) {
    const row = result.row;
    // --- R2 HOOK POINT ---------------------------------------------------
    // Right after the row transitions pending -> paid (and after the capture
    // debit commits), notify R2's zero-burn chain accrual. Wrapped best-effort
    // so an accrual error can NEVER throw into the response of a payment that
    // already succeeded.
    try {
      await enrolmentUtil.onEnrolmentPaid(row.shop_id, row.id);
    } catch (err) {
      logger.warn({ err: err.message, enrolmentId: row.id }, 'onEnrolmentPaid hook failed (ignored in R1)');
    }
    // ---------------------------------------------------------------------
  }
  return result.row;
}

// GET /api/enrolment/config — always available (even when disabled), so the
// frontend can decide whether to show the flow. Never leaks the key secret.
exports.getConfig = async (req, res) => {
  const cfg = await enrolmentUtil.getEnrolmentConfig();
  res.json({
    enabled: cfg.enabled,
    tiers: [
      { tier: 'basic', amount_paise: cfg.basic_paise },
      { tier: 'premium', amount_paise: cfg.premium_paise },
    ],
    key_id: razorpay.isConfigured() ? razorpay.keyId() : null,
    split: cfg.split,
  });
};

// GET /api/enrolment/mine — this shop's latest enrolment, or { status:'none' }.
exports.getMine = async (req, res) => {
  const r = await query(
    `SELECT id, tier, amount_paise, status, provider, paid_at, created_at
       FROM enrolments
      WHERE shop_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [req.user.shopId]
  );
  if (!r.rowCount) return res.json({ status: 'none' });
  const row = r.rows[0];
  res.json({
    status: row.status,
    tier: row.tier,
    amount_paise: Number(row.amount_paise),
    provider: row.provider,
    paid_at: row.paid_at,
    created_at: row.created_at,
  });
};

// The shop's redeemable Khata Credits balance (paise), 0 when it has no wallet.
async function shopCreditBalance(shopId) {
  const r = await query(
    "SELECT balance_paise FROM referral_wallets WHERE owner_type = 'shop' AND owner_id = $1",
    [shopId]
  );
  return r.rowCount ? Number(r.rows[0].balance_paise) : 0;
}

// POST /api/enrolment/order — start an enrolment. Only when the flag is on.
// use_wallet (redemption method A): the shop redeems its Khata Credits against the
// fee first. applied = min(balance, fee); the remainder is charged via Razorpay
// (or, in manual/dev mode, instant-paid). The credit debit and the enrolment row
// are written in ONE transaction so a debit can never happen without the order.
exports.createOrder = async (req, res) => {
  const cfg = await enrolmentUtil.getEnrolmentConfig();
  assertEnabled(cfg);

  const { tier } = req.body;
  const useWallet = req.body.use_wallet === true || req.body.use_credits === true;
  const amount = enrolmentUtil.amountForTier(tier, cfg);
  if (amount === null || !Number.isFinite(amount)) throw ApiError.badRequest('bad_tier');

  const shopId = req.user.shopId;
  const createdBy = req.user.sub || null;

  // A shop enrols once: block a second order when a paid enrolment exists.
  const paid = await query(
    `SELECT id FROM enrolments WHERE shop_id = $1 AND status = 'paid' LIMIT 1`,
    [shopId]
  );
  if (paid.rowCount) throw ApiError.conflict('already_enrolled');

  const { infra_pct, l1_pct, l2_pct } = cfg.split;

  // How much credit to apply (capped at the fee). 0 unless use_wallet + a balance.
  const balance = useWallet ? await shopCreditBalance(shopId) : 0;
  const applied = Math.min(balance, amount);
  const remaining = amount - applied;

  // Case 1 — credits fully cover the fee (remaining 0): no external charge. Insert
  // the enrolment + debit the credits atomically, then mark it paid (manual-style)
  // and fire the R2/R3 accrual hook. amount_paise stays the FULL fee so the chain
  // pool is unchanged (the credit is how the shop paid, a pure book-entry offset).
  if (remaining === 0 && applied > 0) {
    const enrolRow = await withTx(async (c) => {
      // Straight to paid → debit at order time and mark the row credits_debited=true
      // so markPaid's capture-time debit skips it (never a double-debit).
      const ins = await c.query(
        `INSERT INTO enrolments
           (shop_id, tier, amount_paise, status, provider,
            split_infra_pct, split_l1_pct, split_l2_pct, wallet_applied_paise, credits_debited)
         VALUES ($1,$2,$3,'pending','manual',$4,$5,$6,$7,true)
         RETURNING id, shop_id, tier, amount_paise, status`,
        [shopId, tier, amount, infra_pct, l1_pct, l2_pct, applied]
      );
      await spendCredits(
        { shop: shopId, amount_paise: applied, purpose: 'redeem_enrolment', ref_note: `enrolment ${ins.rows[0].id}`, created_by: createdBy },
        c
      );
      return ins.rows[0];
    });
    const paidRow = await markPaid(enrolRow, null);
    logger.info({ shopId, enrolmentId: paidRow.id, applied }, 'Enrolment paid fully by Khata Credits');
    return res.json({ manual: true, status: paidRow.status, wallet_applied_paise: applied, amount_paise: amount, charge_paise: 0 });
  }

  if (razorpay.isConfigured()) {
    // Razorpay one-time order paid TO the platform → use the platform client. The
    // order charges only the REMAINING amount after any credit applied.
    const order = await razorpay.createOrder({
      amount: remaining,
      receipt: `enrol_${String(shopId).slice(0, 18)}`,
      notes: { shop_id: shopId, tier },
    });
    // Record the credit INTENT only (wallet_applied_paise = applied,
    // credits_debited = false). The actual debit happens at CAPTURE, in markPaid,
    // when the Razorpay payment confirms — so an abandoned checkout leaves this row
    // pending with the credit un-spent and the balance fully intact.
    const enrolId = await query(
      `INSERT INTO enrolments
         (shop_id, tier, amount_paise, status, provider, provider_order_id,
          split_infra_pct, split_l1_pct, split_l2_pct, wallet_applied_paise, credits_debited)
       VALUES ($1,$2,$3,'pending','razorpay',$4,$5,$6,$7,$8,false)
       RETURNING id`,
      [shopId, tier, amount, order.id, infra_pct, l1_pct, l2_pct, applied || null]
    ).then((r) => r.rows[0].id);
    logger.info({ shopId, enrolmentId: enrolId, order: order.id, applied, remaining }, 'Enrolment order created (razorpay, pending)');
    return res.json({
      order_id: order.id,
      amount_paise: remaining,
      wallet_applied_paise: applied,
      currency: 'INR',
      key_id: razorpay.keyId(),
    });
  }

  // Manual / dev mode (Razorpay unconfigured): create pending, confirm-paid now.
  // Any applied credit is debited atomically with the order row.
  const enrolRow = await withTx(async (c) => {
    // Manual mode goes straight to paid → debit at order time (when credit is
    // applied) and mark credits_debited=true so markPaid never re-debits.
    const debited = applied > 0;
    const ins = await c.query(
      `INSERT INTO enrolments
         (shop_id, tier, amount_paise, status, provider,
          split_infra_pct, split_l1_pct, split_l2_pct, wallet_applied_paise, credits_debited)
       VALUES ($1,$2,$3,'pending','manual',$4,$5,$6,$7,$8)
       RETURNING id, shop_id, tier, amount_paise, status`,
      [shopId, tier, amount, infra_pct, l1_pct, l2_pct, applied || null, debited]
    );
    if (applied > 0) {
      await spendCredits(
        { shop: shopId, amount_paise: applied, purpose: 'redeem_enrolment', ref_note: `enrolment ${ins.rows[0].id}`, created_by: createdBy },
        c
      );
    }
    return ins.rows[0];
  });
  const paidRow = await markPaid(enrolRow, null);
  logger.info({ shopId, enrolmentId: paidRow.id, applied }, 'Enrolment order created + paid (manual mode)');
  // Keep the plain (no-credit) response shape unchanged; surface the credit
  // fields only when credits were actually applied.
  const body = { manual: true, status: paidRow.status };
  if (applied > 0) {
    body.wallet_applied_paise = applied;
    body.amount_paise = amount;
  }
  return res.json(body);
};

// POST /api/enrolment/confirm — verify + mark paid. Only when the flag is on.
// Razorpay body { order_id, payment_id, signature }; manual body { enrolment_id }.
exports.confirm = async (req, res) => {
  const cfg = await enrolmentUtil.getEnrolmentConfig();
  assertEnabled(cfg);

  const shopId = req.user.shopId;
  const { order_id, payment_id, signature, enrolment_id } = req.body;

  // Look up the pending enrolment for THIS shop by order_id (razorpay) or id (manual).
  let lookup;
  if (order_id) {
    lookup = await query(
      `SELECT id, shop_id, tier, amount_paise, status, provider
         FROM enrolments
        WHERE provider_order_id = $1 AND shop_id = $2
        ORDER BY created_at DESC LIMIT 1`,
      [order_id, shopId]
    );
  } else if (enrolment_id) {
    lookup = await query(
      `SELECT id, shop_id, tier, amount_paise, status, provider
         FROM enrolments
        WHERE id = $1 AND shop_id = $2
        LIMIT 1`,
      [enrolment_id, shopId]
    );
  } else {
    throw ApiError.badRequest('order_id_or_enrolment_id_required');
  }

  if (!lookup.rowCount) throw ApiError.notFound('enrolment_not_found');
  const enrolment = lookup.rows[0];

  // Razorpay path: the signature must verify before we ever mark paid.
  if (enrolment.provider === 'razorpay') {
    const ok = razorpay.verifyPaymentSignature({
      orderId: order_id,
      paymentId: payment_id,
      signature,
    });
    if (!ok) throw ApiError.badRequest('bad_signature');
  }

  const row = await markPaid(enrolment, payment_id || null);
  res.json({
    status: row.status,
    tier: row.tier,
    amount_paise: Number(row.amount_paise),
  });
};
