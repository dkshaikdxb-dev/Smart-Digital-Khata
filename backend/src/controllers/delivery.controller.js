const crypto = require('crypto');
const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');

// Delivery Champions (batch DELIV1) — the last-mile layer on top of the existing
// shop-run home delivery. The owner registers champions (a delivery agent, like a
// Khata Mitra for last-mile) and ASSIGNS a delivery order to one; the champion
// then works the order picked_up -> delivered through a NO-LOGIN token link.
//
// The champion's access_token mirrors the customer khata share_token pattern
// exactly (crypto.randomBytes(16).toString('hex') → 32 lowercase hex chars,
// validated with /^[a-f0-9]{32}$/, looked up publicly): the unguessable token IS
// the credential, never a guessable id. The public /t/:token endpoints only ever
// expose and mutate THAT champion's own deliveries.

// 32-hex, same shape as the khata share token. Validate on the public path so a
// malformed token is a fast 404 (no DB hit, no existence leak).
const TOKEN_RE = /^[a-f0-9]{32}$/;
function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

// The base URL for the champion's share link. Mirrors customer.controller's khata
// link construction (ADMIN_URL || APP_URL || '').
function shareBase() {
  return process.env.ADMIN_URL || process.env.APP_URL || '';
}
function championLink(token) {
  return `${shareBase()}/d/${token}`;
}

// Default per-delivery incentive from platform_settings (seeded at 2000 = ₹20).
// Falls back to 0 if, somehow, the row is absent — never throws.
async function defaultFeePaise() {
  const r = await query(
    `SELECT value FROM platform_settings WHERE key = 'delivery_champion_fee_paise'`
  );
  if (!r.rowCount) return 0;
  const n = Number.parseInt(r.rows[0].value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function championView(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    area: row.area,
    is_active: row.is_active,
    access_token: row.access_token,
    link: championLink(row.access_token),
    created_at: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Owner endpoints (auth owner/staff, scoped to req.user.shopId)
// ---------------------------------------------------------------------------

/** GET /api/delivery/champions — this shop's champions (newest first). */
exports.listChampions = async (req, res) => {
  const r = await query(
    `SELECT c.*,
            COUNT(d.id) FILTER (WHERE d.status IN ('assigned','picked_up'))::int AS active_deliveries,
            COUNT(d.id) FILTER (WHERE d.status = 'delivered')::int AS delivered_count
       FROM delivery_champions c
       LEFT JOIN deliveries d ON d.champion_id = c.id
      WHERE c.shop_id = $1
      GROUP BY c.id
      ORDER BY c.created_at DESC`,
    [req.user.shopId]
  );
  res.json({
    items: r.rows.map((row) => ({
      ...championView(row),
      active_deliveries: row.active_deliveries,
      delivered_count: row.delivered_count,
    })),
  });
};

/** POST /api/delivery/champions { name, phone?, area? } — register a champion. */
exports.createChampion = async (req, res) => {
  const { name, phone = null, area = null } = req.body;
  // Retry once on the astronomically unlikely token collision (UNIQUE access_token).
  let row;
  for (let attempt = 0; attempt < 2 && !row; attempt += 1) {
    try {
      const r = await query(
        `INSERT INTO delivery_champions (shop_id, name, phone, area, access_token)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.user.shopId, name, phone, area, newToken()]
      );
      row = r.rows[0];
    } catch (err) {
      if (err.code === '23505' && attempt === 0) continue; // token collision → retry
      throw err;
    }
  }
  res.status(201).json({ champion: championView(row) });
};

/** PATCH /api/delivery/champions/:id { name?, phone?, area?, is_active? }. */
exports.updateChampion = async (req, res) => {
  const editable = ['name', 'phone', 'area', 'is_active'];
  const fields = [];
  const values = [];
  let i = 1;
  for (const k of editable) {
    if (Object.prototype.hasOwnProperty.call(req.body, k)) {
      fields.push(`${k} = $${i++}`);
      values.push(req.body[k]);
    }
  }
  if (!fields.length) {
    const cur = await query(
      'SELECT * FROM delivery_champions WHERE id = $1 AND shop_id = $2',
      [req.params.id, req.user.shopId]
    );
    if (!cur.rowCount) throw ApiError.notFound('Champion not found');
    return res.json({ champion: championView(cur.rows[0]) });
  }
  values.push(req.params.id, req.user.shopId);
  const r = await query(
    `UPDATE delivery_champions SET ${fields.join(', ')}
      WHERE id = $${i++} AND shop_id = $${i}
      RETURNING *`,
    values
  );
  if (!r.rowCount) throw ApiError.notFound('Champion not found');
  res.json({ champion: championView(r.rows[0]) });
};

/**
 * POST /api/delivery/assign { order_id, champion_id, fee_paise? } — assign a
 * delivery order to a champion. ONE transaction: create the deliveries row AND
 * flip the order to out_for_delivery. Rejects a pickup order, another shop's
 * order, a finished order, an inactive/other-shop champion, and a double-assign.
 */
exports.assign = async (req, res) => {
  const { order_id: orderId, champion_id: championId } = req.body;
  const feeOverride = Object.prototype.hasOwnProperty.call(req.body, 'fee_paise')
    ? req.body.fee_paise
    : null;
  const fallbackFee = await defaultFeePaise();

  const result = await withTx(async (client) => {
    // Lock the order and confirm it is THIS shop's, a delivery order, and not
    // already finished.
    const ord = await client.query(
      `SELECT id, shop_id, fulfillment_type, status
         FROM orders WHERE id = $1 AND shop_id = $2 FOR UPDATE`,
      [orderId, req.user.shopId]
    );
    if (!ord.rowCount) throw ApiError.notFound('Order not found');
    const order = ord.rows[0];
    if (order.fulfillment_type !== 'delivery') {
      throw ApiError.unprocessable('Only a delivery order can be assigned to a champion', {
        fulfillment_type: order.fulfillment_type,
      });
    }
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw ApiError.conflict('Cannot assign a completed or cancelled order');
    }

    // Champion must belong to this shop and be active.
    const champ = await client.query(
      'SELECT id, is_active FROM delivery_champions WHERE id = $1 AND shop_id = $2',
      [championId, req.user.shopId]
    );
    if (!champ.rowCount) throw ApiError.notFound('Champion not found');
    if (champ.rows[0].is_active !== true) {
      throw ApiError.unprocessable('Champion is inactive');
    }

    // Reject a double-assign (one deliveries row per order — also enforced by the
    // UNIQUE(order_id) constraint, caught below on a concurrent race).
    const existing = await client.query('SELECT id FROM deliveries WHERE order_id = $1', [orderId]);
    if (existing.rowCount) throw ApiError.conflict('Order is already assigned to a champion');

    const fee = feeOverride !== null ? feeOverride : fallbackFee;

    let delivery;
    try {
      const ins = await client.query(
        `INSERT INTO deliveries (order_id, champion_id, fee_paise)
         VALUES ($1,$2,$3) RETURNING *`,
        [orderId, championId, fee]
      );
      delivery = ins.rows[0];
    } catch (err) {
      // Concurrent assign of the same order → unique violation, not a 500.
      if (err.code === '23505') throw ApiError.conflict('Order is already assigned to a champion');
      throw err;
    }

    const upd = await client.query(
      `UPDATE orders SET status = 'out_for_delivery', updated_at = NOW()
        WHERE id = $1 RETURNING id, status`,
      [orderId]
    );

    return { delivery, order: upd.rows[0] };
  });

  res.status(201).json(result);
};

/**
 * GET /api/delivery/orders — this shop's delivery orders with their champion +
 * delivery status (null when unassigned), newest first.
 */
exports.listDeliveryOrders = async (req, res) => {
  const r = await query(
    `SELECT o.id AS order_id, o.status AS order_status,
            (o.subtotal + o.delivery_fee) AS total, o.address, o.created_at,
            cu.name AS customer_name, cu.phone AS customer_phone,
            d.id AS delivery_id, d.status AS delivery_status, d.fee_paise,
            d.assigned_at, d.picked_up_at, d.delivered_at,
            ch.id AS champion_id, ch.name AS champion_name
       FROM orders o
       JOIN customers cu ON cu.id = o.customer_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN delivery_champions ch ON ch.id = d.champion_id
      WHERE o.shop_id = $1 AND o.fulfillment_type = 'delivery'
      ORDER BY o.created_at DESC`,
    [req.user.shopId]
  );
  res.json({ items: r.rows });
};

// ---------------------------------------------------------------------------
// Champion token endpoints (PUBLIC, no auth — the token IS the credential)
// ---------------------------------------------------------------------------

// Look up an ACTIVE champion by its token. Mirrors publicKhata (which requires
// customers.status='active'): a deactivated champion's link stops working, and
// an unknown/malformed token is an indistinguishable 404 (no existence leak).
async function championByToken(token) {
  if (!TOKEN_RE.test(token)) return null;
  const r = await query(
    'SELECT id, shop_id, name, is_active FROM delivery_champions WHERE access_token = $1 AND is_active = true',
    [token]
  );
  return r.rowCount ? r.rows[0] : null;
}

/**
 * GET /api/delivery/t/:token — the champion's own ACTIVE deliveries (assigned /
 * picked_up), recent first, with the order address, items summary and customer
 * contact so the agent can deliver. 404 on unknown/inactive token.
 */
exports.tokenDeliveries = async (req, res) => {
  const champion = await championByToken(req.params.token);
  if (!champion) throw ApiError.notFound('Not found');

  const r = await query(
    `SELECT d.id AS delivery_id, d.status, d.fee_paise, d.assigned_at, d.picked_up_at,
            o.id AS order_id, o.address, o.note,
            (o.subtotal + o.delivery_fee) AS total,
            cu.name AS customer_name, cu.phone AS customer_phone,
            COALESCE(
              (SELECT string_agg(oi.quantity || 'x ' || oi.name, ', ' ORDER BY oi.name)
                 FROM order_items oi WHERE oi.order_id = o.id),
              ''
            ) AS items_summary
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
       JOIN customers cu ON cu.id = o.customer_id
      WHERE d.champion_id = $1
        AND d.status IN ('assigned','picked_up')
        AND d.assigned_at > NOW() - INTERVAL '7 days'
      ORDER BY d.assigned_at DESC
      LIMIT 100`,
    [champion.id]
  );

  res.json({
    champion: { name: champion.name },
    deliveries: r.rows,
  });
};

/**
 * POST /api/delivery/t/:token/:deliveryId/status { status: 'picked_up'|'delivered' }
 * — guarded, idempotent transition (assigned -> picked_up -> delivered). Stamps
 * picked_up_at/delivered_at; on 'delivered' also flips the order to 'completed'
 * (guarded so it never regresses a finished order). Only the champion who owns
 * the delivery (token match) can update. Never 500 on a normal race.
 */
exports.tokenUpdateStatus = async (req, res) => {
  const target = req.body.status; // 'picked_up' | 'delivered' (Joi-validated)
  const champion = await championByToken(req.params.token);
  if (!champion) throw ApiError.notFound('Not found');

  const result = await withTx(async (client) => {
    // Lock the delivery, scoped to THIS champion — another champion's delivery is
    // an indistinguishable 404.
    const dr = await client.query(
      `SELECT id, order_id, status FROM deliveries
        WHERE id = $1 AND champion_id = $2 FOR UPDATE`,
      [req.params.deliveryId, champion.id]
    );
    if (!dr.rowCount) throw ApiError.notFound('Not found');
    const delivery = dr.rows[0];

    // Idempotent: a repeat of the current state is a no-op success, not an error.
    if (delivery.status === target) {
      return { delivery, order_completed: false, noop: true };
    }

    // Guarded forward-only pipeline: assigned -> picked_up -> delivered.
    const allowed =
      (target === 'picked_up' && delivery.status === 'assigned') ||
      (target === 'delivered' && delivery.status === 'picked_up');
    if (!allowed) {
      throw ApiError.conflict('Invalid status transition', {
        from: delivery.status,
        to: target,
      });
    }

    const stampCol = target === 'picked_up' ? 'picked_up_at' : 'delivered_at';
    const upd = await client.query(
      `UPDATE deliveries SET status = $1, ${stampCol} = NOW()
        WHERE id = $2 RETURNING *`,
      [target, delivery.id]
    );

    // On delivery, complete the order — guarded so a race that already finished
    // (or cancelled) the order is left untouched rather than regressed.
    let orderCompleted = false;
    if (target === 'delivered') {
      const ou = await client.query(
        `UPDATE orders SET status = 'completed', updated_at = NOW()
          WHERE id = $1 AND status NOT IN ('completed','cancelled')
          RETURNING id`,
        [delivery.order_id]
      );
      orderCompleted = ou.rowCount > 0;
    }

    return { delivery: upd.rows[0], order_completed: orderCompleted, noop: false };
  });

  res.json(result);
};
