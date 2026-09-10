const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay.service');
const logger = require('../utils/logger');
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
async function markPaid(enrolment, paymentId) {
  const upd = await query(
    `UPDATE enrolments
        SET status = 'paid', provider_payment_id = COALESCE($2, provider_payment_id), paid_at = NOW()
      WHERE id = $1 AND status = 'pending'
      RETURNING id, shop_id, tier, amount_paise, status, paid_at`,
    [enrolment.id, paymentId || null]
  );

  if (upd.rowCount === 1) {
    const row = upd.rows[0];
    // --- R2 HOOK POINT ---------------------------------------------------
    // Right after the row transitions pending -> paid, notify R2's zero-burn
    // chain accrual. onEnrolmentPaid is a documented NO-OP in R1. Wrapped
    // best-effort so a future accrual error can NEVER throw into the response
    // of a payment that already succeeded.
    try {
      await enrolmentUtil.onEnrolmentPaid(row.shop_id, row.id);
    } catch (err) {
      logger.warn({ err: err.message, enrolmentId: row.id }, 'onEnrolmentPaid hook failed (ignored in R1)');
    }
    // ---------------------------------------------------------------------
    return row;
  }

  // Already paid / raced: return the existing paid row, do NOT double-process.
  const existing = await query(
    `SELECT id, shop_id, tier, amount_paise, status, paid_at FROM enrolments WHERE id = $1`,
    [enrolment.id]
  );
  return existing.rows[0];
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

// POST /api/enrolment/order — start an enrolment. Only when the flag is on.
exports.createOrder = async (req, res) => {
  const cfg = await enrolmentUtil.getEnrolmentConfig();
  assertEnabled(cfg);

  const { tier } = req.body;
  const amount = enrolmentUtil.amountForTier(tier, cfg);
  if (amount === null || !Number.isFinite(amount)) throw ApiError.badRequest('bad_tier');

  const shopId = req.user.shopId;

  // A shop enrols once: block a second order when a paid enrolment exists.
  const paid = await query(
    `SELECT id FROM enrolments WHERE shop_id = $1 AND status = 'paid' LIMIT 1`,
    [shopId]
  );
  if (paid.rowCount) throw ApiError.conflict('already_enrolled');

  const { infra_pct, l1_pct, l2_pct } = cfg.split;

  if (razorpay.isConfigured()) {
    // Razorpay one-time order paid TO the platform → use the platform client.
    const order = await razorpay.createOrder({
      amount,
      receipt: `enrol_${String(shopId).slice(0, 18)}`,
      notes: { shop_id: shopId, tier },
    });
    const ins = await query(
      `INSERT INTO enrolments
         (shop_id, tier, amount_paise, status, provider, provider_order_id,
          split_infra_pct, split_l1_pct, split_l2_pct)
       VALUES ($1,$2,$3,'pending','razorpay',$4,$5,$6,$7)
       RETURNING id`,
      [shopId, tier, amount, order.id, infra_pct, l1_pct, l2_pct]
    );
    logger.info({ shopId, enrolmentId: ins.rows[0].id, order: order.id }, 'Enrolment order created (razorpay, pending)');
    return res.json({
      order_id: order.id,
      amount_paise: amount,
      currency: 'INR',
      key_id: razorpay.keyId(),
    });
  }

  // Manual / dev mode (Razorpay unconfigured): create pending, confirm-paid now.
  const ins = await query(
    `INSERT INTO enrolments
       (shop_id, tier, amount_paise, status, provider,
        split_infra_pct, split_l1_pct, split_l2_pct)
     VALUES ($1,$2,$3,'pending','manual',$4,$5,$6)
     RETURNING id, shop_id, tier, amount_paise, status`,
    [shopId, tier, amount, infra_pct, l1_pct, l2_pct]
  );
  const paidRow = await markPaid(ins.rows[0], null);
  logger.info({ shopId, enrolmentId: paidRow.id }, 'Enrolment order created + paid (manual mode)');
  return res.json({ manual: true, status: paidRow.status });
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
