const { query, withTx } = require('../config/db');

// Closed-loop referral wallet primitives (Batch R3) — the book-entry money core.
// User-facing this balance is "Khata Credits"; internally it is referral_wallets
// / referral_ledger. Everything here is integer paise, every balance mutation is
// transactional, and the balance can NEVER go negative (a guarded debit + the
// CHECK (balance_paise >= 0) in migration 0050).
//
// GUARDRAILS (enforced by construction, keep true): no cash-out to bank/UPI, no
// P2P transfer between arbitrary users, no spend at independent third-party shops,
// no interest. `code`-owned (influencer/other) balances stay earmarked until the
// deferred, KYC-gated external-payout phase.
//
// Every primitive takes an optional pg `client` so it can run inside a caller's
// transaction (accrual + settlement atomic); when omitted it owns a transaction.

// Run `fn` inside a transaction: reuse the caller's client when given, else open
// (and commit/rollback) a fresh one. Lets the same helper compose into a bigger
// atomic unit or stand alone.
function inTx(client, fn) {
  if (client && typeof client.query === 'function') return fn(client);
  return withTx(fn);
}

// A plain runner: the caller's client when given, else the pooled query.
function runner(client) {
  return client && typeof client.query === 'function'
    ? (text, params) => client.query(text, params)
    : query;
}

// A positive integer amount in paise, or null. Rejects NaN, floats, <= 0.
function toPosPaise(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// Map a referral code to the wallet that should hold its earnings.
//   - peer owner/staff code -> the owner's SHOP wallet ('shop', shop_id). A peer
//     code is owned by a users.id; the shop is shops.owner_id = that user (owner)
//     or, failing that, users.shop_id (staff). This is the redeem-vs-dues balance.
//   - customer code -> ('customer', owner_customer_id).
//   - influencer / other code (no system account) -> ('code', code.id), earmarked.
// Returns { owner_type, owner_id } or null when it cannot resolve (e.g. an owner
// code whose shop was deleted) — the caller must treat null as "cannot settle".
async function resolveWalletOwner(codeRow, client) {
  if (!codeRow) return null;
  const run = runner(client);
  const type = codeRow.owner_type;

  if (type === 'owner' || type === 'staff') {
    if (!codeRow.owner_user_id) return null;
    // Owner: the shop they own.
    const own = await run(
      'SELECT id FROM shops WHERE owner_id = $1 ORDER BY created_at ASC LIMIT 1',
      [codeRow.owner_user_id]
    );
    if (own.rowCount) return { owner_type: 'shop', owner_id: own.rows[0].id };
    // Staff (or an owner with no owned shop row): the shop they belong to.
    const u = await run('SELECT shop_id FROM users WHERE id = $1', [codeRow.owner_user_id]);
    if (u.rowCount && u.rows[0].shop_id) return { owner_type: 'shop', owner_id: u.rows[0].shop_id };
    return null;
  }

  if (type === 'customer') {
    if (!codeRow.owner_customer_id) return null;
    return { owner_type: 'customer', owner_id: codeRow.owner_customer_id };
  }

  // influencer / other (and any future no-account owner_type): earmarked code wallet.
  return { owner_type: 'code', owner_id: codeRow.id };
}

// Get (or create) the wallet row for an owner. UPSERT on the unique
// (owner_type, owner_id) key so a concurrent create can never make two wallets.
async function getOrCreateWallet(owner_type, owner_id, client) {
  const run = runner(client);
  const r = await run(
    `INSERT INTO referral_wallets (owner_type, owner_id)
     VALUES ($1, $2)
     ON CONFLICT (owner_type, owner_id)
       DO UPDATE SET updated_at = referral_wallets.updated_at
     RETURNING id, owner_type, owner_id, balance_paise, currency`,
    [owner_type, owner_id]
  );
  return r.rows[0];
}

// Credit a wallet: balance += amount, plus one immutable 'credit' ledger row
// carrying the running balance_after. amount must be a positive integer paise.
// Runs in a transaction (the caller's, if given) so the balance move and the
// ledger row are always written together. Returns the new balance (Number).
async function creditWallet({ wallet, amount_paise, kind, ref_reward_id = null, ref_note = null, created_by = null }, client) {
  const amt = toPosPaise(amount_paise);
  if (amt === null) throw new Error('creditWallet: amount_paise must be a positive integer');
  if (!wallet || !wallet.id) throw new Error('creditWallet: wallet required');

  return inTx(client, async (c) => {
    const upd = await c.query(
      `UPDATE referral_wallets
          SET balance_paise = balance_paise + $2, updated_at = NOW()
        WHERE id = $1
        RETURNING balance_paise`,
      [wallet.id, amt]
    );
    if (!upd.rowCount) throw new Error('creditWallet: wallet not found');
    const balanceAfter = Number(upd.rows[0].balance_paise);
    await c.query(
      `INSERT INTO referral_ledger
         (wallet_id, direction, amount_paise, kind, ref_reward_id, ref_note, balance_after_paise, created_by)
       VALUES ($1,'credit',$2,$3,$4,$5,$6,$7)`,
      [wallet.id, amt, kind, ref_reward_id, ref_note, balanceAfter, created_by]
    );
    return balanceAfter;
  });
}

// Guarded debit: balance -= amount ONLY when balance >= amount, so the balance
// can never go negative. When the guard fails (insufficient credit) it throws an
// Error tagged { code:'insufficient' } and writes NOTHING. On success it writes
// one immutable 'debit' ledger row and returns the new balance (Number).
async function debitWallet({ wallet, amount_paise, kind, ref_reward_id = null, ref_note = null, created_by = null }, client) {
  const amt = toPosPaise(amount_paise);
  if (amt === null) throw new Error('debitWallet: amount_paise must be a positive integer');
  if (!wallet || !wallet.id) throw new Error('debitWallet: wallet required');

  return inTx(client, async (c) => {
    // The WHERE ... AND balance_paise >= $amt is the whole non-negativity guarantee:
    // if the balance is too low the UPDATE matches no row (rowCount 0) and we bail
    // out before writing any ledger row.
    const upd = await c.query(
      `UPDATE referral_wallets
          SET balance_paise = balance_paise - $2, updated_at = NOW()
        WHERE id = $1 AND balance_paise >= $2
        RETURNING balance_paise`,
      [wallet.id, amt]
    );
    if (!upd.rowCount) {
      const err = new Error('insufficient_credit');
      err.code = 'insufficient';
      throw err;
    }
    const balanceAfter = Number(upd.rows[0].balance_paise);
    await c.query(
      `INSERT INTO referral_ledger
         (wallet_id, direction, amount_paise, kind, ref_reward_id, ref_note, balance_after_paise, created_by)
       VALUES ($1,'debit',$2,$3,$4,$5,$6,$7)`,
      [wallet.id, amt, kind, ref_reward_id, ref_note, balanceAfter, created_by]
    );
    return balanceAfter;
  });
}

// ---------------------------------------------------------------------------
// spendCredits — the ONE redemption primitive (Batch R3, decision 4b).
//
// A shop redeems its Khata Credits against a PLATFORM service it is buying. This
// is the spend side of the closed-loop circulation: the `kind` names the service
// (redeem_enrolment | redeem_subscription | redeem_promo | redeem_whatsapp |
// redeem_premium | sponsor_shop). It is NEVER a cash-out and NEVER a transfer to
// an arbitrary user — the only sink is a platform charge.
//
// It is a guarded debit on the SHOP's wallet. `amount_paise` is what the caller
// wants to apply; the caller is responsible for capping it at the actual charge
// (applied = min(balance, charge)) BEFORE calling, or catching { code:'insufficient' }.
// Runs in the caller's transaction when given so the debit and the thing it paid
// for commit together (e.g. the enrolment order). Returns the new balance (Number).
//
// Redemption points wired TODAY: enrolment dues (use_wallet on the order). Promo
// placement, subscription, WhatsApp/SMS, premium and sponsor-a-shop reuse this
// exact primitive and get wired as each of those paid flows lands — see the TODO
// seams at those call sites. Nothing here spends at a third-party shop.
const SPEND_KINDS = new Set([
  'redeem_enrolment',
  'redeem_subscription',
  'redeem_promo',
  'redeem_whatsapp',
  'redeem_premium',
  'sponsor_shop',
]);

async function spendCredits({ shop, amount_paise, purpose, ref_note = null, created_by = null }, client) {
  if (!shop) throw new Error('spendCredits: shop (shop id) required');
  if (!SPEND_KINDS.has(purpose)) throw new Error(`spendCredits: unknown purpose '${purpose}'`);
  const amt = toPosPaise(amount_paise);
  if (amt === null) throw new Error('spendCredits: amount_paise must be a positive integer');

  return inTx(client, async (c) => {
    const wallet = await getOrCreateWallet('shop', shop, c);
    const balanceAfter = await debitWallet(
      { wallet, amount_paise: amt, kind: purpose, ref_note, created_by },
      c
    );
    return { applied_paise: amt, balance_after_paise: balanceAfter, wallet_id: wallet.id };
  });
}

module.exports = {
  inTx,
  toPosPaise,
  resolveWalletOwner,
  getOrCreateWallet,
  creditWallet,
  debitWallet,
  spendCredits,
  SPEND_KINDS,
};
