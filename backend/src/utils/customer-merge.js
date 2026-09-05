// Money-exact, atomic re-linking of a consumer's shop ledger when their phone
// number changes. A shop's ledger for a person is a `customers` row keyed
// UNIQUE(shop_id, phone); a number change must move that row (and every
// transaction/order/payment hanging off it) onto the new phone WITHOUT losing a
// single paisa.
//
// All work MUST run inside a caller-supplied transaction client (config/db.js
// withTx) so a partial re-link can never be committed.

// Recompute a customer's balance as the EXACT integer-paise sum over ALL its
// transactions: Σ purchase − Σ (cash + upi). This is the single source of truth
// for balance (the same delta rule the transaction controller applies on write),
// so a merged row's balance is always the arithmetic sum of both sides — never a
// drifted or copied figure.
async function recomputeBalance(client, customerId) {
  const r = await client.query(
    `SELECT COALESCE(SUM(CASE WHEN type = 'purchase' THEN amount ELSE -amount END), 0) AS balance
     FROM transactions WHERE customer_id = $1`,
    [customerId]
  );
  // BIGINT sums come back as strings from pg; keep them as integers (paise).
  return BigInt(r.rows[0].balance);
}

/**
 * Re-link one shop's ledger from `fromPhone` to `toPhone`.
 *
 *  - No row at (shopId, fromPhone)            → nothing to do.
 *  - Row at fromPhone but NOT at toPhone      → plain rename (UPDATE phone).
 *  - Rows at BOTH (distinct)                  → MERGE: repoint every child row of
 *      the source onto the target, recompute the target balance as the exact
 *      integer-paise sum over all its (now combined) transactions, keep the
 *      higher credit_limit, keep the target's notes (falling back to the source's
 *      when the target has none), then delete the now-empty source row.
 *
 * Ordering is UNIQUE(shop_id, phone)-safe: in the merge case both rows already
 * exist under distinct phones, so we repoint-then-DELETE the source (never rename
 * it into an occupied slot); in the rename case the target slot is empty.
 *
 * @returns {Promise<{ merged: boolean, relinked: boolean, customerId: string|null }>}
 */
async function relinkCustomerPhone(client, { shopId, fromPhone, toPhone }) {
  if (fromPhone === toPhone) {
    // Defensive: a no-op change. Return the existing row id if any.
    const same = await client.query(
      'SELECT id FROM customers WHERE shop_id = $1 AND phone = $2',
      [shopId, toPhone]
    );
    return { merged: false, relinked: false, customerId: same.rowCount ? same.rows[0].id : null };
  }

  // Lock both candidate rows up front (FOR UPDATE) so a concurrent transaction
  // write cannot change balances/rows mid-merge.
  const src = await client.query(
    'SELECT id, credit_limit, notes FROM customers WHERE shop_id = $1 AND phone = $2 FOR UPDATE',
    [shopId, fromPhone]
  );
  if (!src.rowCount) {
    return { merged: false, relinked: false, customerId: null };
  }
  const source = src.rows[0];

  const tgt = await client.query(
    'SELECT id, credit_limit, notes FROM customers WHERE shop_id = $1 AND phone = $2 FOR UPDATE',
    [shopId, toPhone]
  );

  if (!tgt.rowCount) {
    // No collision — just rename the source row onto the new phone.
    await client.query(
      'UPDATE customers SET phone = $1, updated_at = NOW() WHERE id = $2',
      [toPhone, source.id]
    );
    return { merged: false, relinked: true, customerId: source.id };
  }

  const target = tgt.rows[0];
  if (target.id === source.id) {
    // Should be unreachable (distinct phones cannot share a row), but be safe.
    return { merged: false, relinked: false, customerId: target.id };
  }

  // --- MERGE source → target -------------------------------------------------
  // Repoint EVERY child of the source onto the target so nothing is lost when
  // the source row is deleted. transactions drive the balance; orders /
  // payment_orders / notification_logs are history we must not cascade-delete;
  // families.payer_customer_id keeps a family's designated payer intact.
  //
  // transactions carry UNIQUE(shop_id, client_request_id) (idempotency), but
  // both customers live in the SAME shop where that id is already unique, so a
  // repoint can never collide.
  await client.query('UPDATE transactions   SET customer_id = $1 WHERE customer_id = $2', [target.id, source.id]);
  await client.query('UPDATE orders          SET customer_id = $1 WHERE customer_id = $2', [target.id, source.id]);
  await client.query('UPDATE payment_orders  SET customer_id = $1 WHERE customer_id = $2', [target.id, source.id]);
  await client.query('UPDATE notification_logs SET customer_id = $1 WHERE customer_id = $2', [target.id, source.id]);
  await client.query('UPDATE families SET payer_customer_id = $1 WHERE payer_customer_id = $2', [target.id, source.id]);

  // Recompute the target balance from the combined transaction set — exact paise.
  const newBalance = await recomputeBalance(client, target.id);

  // Carry-over policy (documented): keep the HIGHER credit_limit of the two, and
  // keep the target's notes unless the target has none, in which case adopt the
  // source's. The target row (already on toPhone) survives.
  const higherLimit = BigInt(source.credit_limit) > BigInt(target.credit_limit)
    ? source.credit_limit
    : target.credit_limit;
  const mergedNotes = (target.notes && String(target.notes).trim())
    ? target.notes
    : (source.notes || null);

  await client.query(
    'UPDATE customers SET balance = $1, credit_limit = $2, notes = $3, updated_at = NOW() WHERE id = $4',
    [newBalance.toString(), higherLimit, mergedNotes, target.id]
  );

  // The source row now has no children — delete it (frees the fromPhone slot).
  await client.query('DELETE FROM customers WHERE id = $1', [source.id]);

  return { merged: true, relinked: true, customerId: target.id };
}

module.exports = { relinkCustomerPhone, recomputeBalance };
