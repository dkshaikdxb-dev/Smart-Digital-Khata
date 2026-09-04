const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');

function fmtRs(paise) {
  return (Number(paise) / 100).toFixed(2);
}

/** Ensure a family exists and belongs to this shop; returns the row or throws 404. */
async function requireFamily(client, id, shopId) {
  const r = await (client || { query }).query(
    'SELECT * FROM families WHERE id = $1 AND shop_id = $2',
    [id, shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Family not found');
  return r.rows[0];
}

exports.create = async (req, res) => {
  const {
    name,
    credit_limit = 0,
    payer_customer_id = null,
    member_ids = [],
  } = req.body;

  const result = await withTx(async (client) => {
    // Validate all referenced customers belong to this shop and are free to join.
    const ids = [...new Set([...member_ids, ...(payer_customer_id ? [payer_customer_id] : [])])];
    let owned = [];
    if (ids.length) {
      const c = await client.query(
        `SELECT id, family_id FROM customers WHERE id = ANY($1::uuid[]) AND shop_id = $2 FOR UPDATE`,
        [ids, req.user.shopId]
      );
      owned = c.rows;
      if (owned.length !== ids.length) {
        throw ApiError.badRequest('One or more customers do not belong to this shop');
      }
    }
    // The payer must actually be part of the family.
    if (payer_customer_id && !member_ids.includes(payer_customer_id)) {
      throw ApiError.badRequest('Payer must be one of the family members');
    }
    // No member may already belong to another family.
    const conflicted = owned.filter((c) => member_ids.includes(c.id) && c.family_id);
    if (conflicted.length) {
      throw ApiError.conflict('One or more customers already belong to a family');
    }

    const fam = await client.query(
      `INSERT INTO families (shop_id, name, credit_limit, payer_customer_id)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [req.user.shopId, name, credit_limit, payer_customer_id]
    );
    const family = fam.rows[0];

    if (member_ids.length) {
      await client.query(
        `UPDATE customers SET family_id = $1, updated_at = NOW()
         WHERE id = ANY($2::uuid[]) AND shop_id = $3`,
        [family.id, member_ids, req.user.shopId]
      );
    }

    return family;
  });

  res.status(201).json({ family: result });
};

exports.list = async (req, res) => {
  const r = await query(
    `SELECT f.*,
            COUNT(c.id)                     AS member_count,
            COALESCE(SUM(c.balance), 0)     AS combined_balance
     FROM families f
     LEFT JOIN customers c ON c.family_id = f.id
     WHERE f.shop_id = $1
     GROUP BY f.id
     ORDER BY f.created_at DESC`,
    [req.user.shopId]
  );
  res.json({ items: r.rows });
};

exports.get = async (req, res) => {
  const family = await requireFamily(null, req.params.id, req.user.shopId);

  const members = await query(
    `SELECT id, name, phone, balance, family_sub_limit AS sub_limit
     FROM customers
     WHERE family_id = $1 AND shop_id = $2
     ORDER BY created_at ASC`,
    [family.id, req.user.shopId]
  );

  let payer = null;
  if (family.payer_customer_id) {
    const p = members.rows.find((m) => m.id === family.payer_customer_id);
    payer = p || null;
  }

  const combined_balance = members.rows.reduce((sum, m) => sum + Number(m.balance), 0);

  res.json({
    family,
    members: members.rows,
    payer,
    combined_balance,
    combined_limit: Number(family.credit_limit),
  });
};

exports.update = async (req, res) => {
  const family = await requireFamily(null, req.params.id, req.user.shopId);

  // A new payer must be an existing member of this family.
  if (req.body.payer_customer_id) {
    const p = await query(
      'SELECT id FROM customers WHERE id = $1 AND family_id = $2 AND shop_id = $3',
      [req.body.payer_customer_id, family.id, req.user.shopId]
    );
    if (!p.rowCount) throw ApiError.badRequest('Payer must be a member of this family');
  }

  const allowed = ['name', 'credit_limit', 'payer_customer_id'];
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      fields.push(`${k} = $${i++}`);
      values.push(req.body[k]);
    }
  }
  if (!fields.length) return res.json({ family });
  values.push(family.id, req.user.shopId);
  const r = await query(
    `UPDATE families SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${i++} AND shop_id = $${i}
     RETURNING *`,
    values
  );
  res.json({ family: r.rows[0] });
};

exports.addMember = async (req, res) => {
  const { customer_id, sub_limit = null } = req.body;

  const result = await withTx(async (client) => {
    const family = await client.query(
      'SELECT id FROM families WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [req.params.id, req.user.shopId]
    );
    if (!family.rowCount) throw ApiError.notFound('Family not found');

    const c = await client.query(
      'SELECT id, family_id FROM customers WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [customer_id, req.user.shopId]
    );
    if (!c.rowCount) throw ApiError.notFound('Customer not found');
    const customer = c.rows[0];
    if (customer.family_id && customer.family_id !== req.params.id) {
      throw ApiError.conflict('Customer already belongs to another family');
    }

    const upd = await client.query(
      `UPDATE customers SET family_id = $1, family_sub_limit = $2, updated_at = NOW()
       WHERE id = $3 AND shop_id = $4
       RETURNING id, name, phone, balance, family_sub_limit AS sub_limit`,
      [req.params.id, sub_limit, customer_id, req.user.shopId]
    );
    return upd.rows[0];
  });

  res.status(201).json({ member: result });
};

exports.removeMember = async (req, res) => {
  const result = await withTx(async (client) => {
    const family = await client.query(
      'SELECT id, payer_customer_id FROM families WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [req.params.id, req.user.shopId]
    );
    if (!family.rowCount) throw ApiError.notFound('Family not found');

    const upd = await client.query(
      `UPDATE customers SET family_id = NULL, family_sub_limit = NULL, updated_at = NOW()
       WHERE id = $1 AND family_id = $2 AND shop_id = $3
       RETURNING id`,
      [req.params.customerId, req.params.id, req.user.shopId]
    );
    if (!upd.rowCount) throw ApiError.notFound('Member not found in this family');

    // If the removed member was the payer, clear the family's payer.
    if (family.rows[0].payer_customer_id === req.params.customerId) {
      await client.query(
        'UPDATE families SET payer_customer_id = NULL, updated_at = NOW() WHERE id = $1',
        [req.params.id]
      );
    }
    return true;
  });

  res.json({ ok: result });
};

exports.statement = async (req, res) => {
  await requireFamily(null, req.params.id, req.user.shopId);

  const tx = await query(
    `SELECT t.id, t.customer_id, c.name AS customer_name, t.type, t.amount,
            t.method, t.note, t.created_at
     FROM transactions t
     JOIN customers c ON c.id = t.customer_id
     WHERE c.family_id = $1 AND t.shop_id = $2
     ORDER BY t.created_at DESC
     LIMIT 200`,
    [req.params.id, req.user.shopId]
  );
  res.json({ transactions: tx.rows });
};

exports.remind = async (req, res) => {
  const family = await requireFamily(null, req.params.id, req.user.shopId);
  if (!family.payer_customer_id) {
    throw ApiError.unprocessable('No payer set for this family');
  }

  const payerRes = await query(
    'SELECT id, name, phone, notifications_enabled FROM customers WHERE id = $1 AND shop_id = $2',
    [family.payer_customer_id, req.user.shopId]
  );
  if (!payerRes.rowCount) throw ApiError.unprocessable('No payer set for this family');
  const payer = payerRes.rows[0];

  const agg = await query(
    'SELECT COALESCE(SUM(balance), 0) AS total FROM customers WHERE family_id = $1 AND shop_id = $2',
    [family.id, req.user.shopId]
  );
  const outstanding = agg.rows[0].total;

  const shopRes = await query('SELECT name FROM shops WHERE id = $1', [req.user.shopId]);
  const shopName = shopRes.rows[0]?.name || 'your shop';

  let sent = false;
  if (payer.notifications_enabled !== false) {
    const msg =
      `Hi ${payer.name}, friendly reminder from ${shopName}.\n` +
      `The combined outstanding for the ${family.name} family is ₹${fmtRs(outstanding)}.\n` +
      `Please pay at your convenience.`;
    await whatsapp
      .sendText(payer.phone, msg)
      .then(() => { sent = true; })
      .catch(() => {});
  }

  res.json({ ok: true, sent, combined_outstanding: Number(outstanding) });
};
