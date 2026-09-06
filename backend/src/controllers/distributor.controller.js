const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');

const SALT = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

// Linear PO status pipeline, mirroring order.controller's forward-move rule. A
// "forward move" is any status with a strictly higher rank; 'cancelled' is only
// valid from a non-dispatched state (placed/confirmed). delivered/cancelled are
// terminal. Anything else (backward, same, unknown) is a nonsense transition.
const PO_RANK = { placed: 0, confirmed: 1, dispatched: 2, delivered: 3 };
const PO_TERMINAL = new Set(['delivered', 'cancelled']);

function canTransition(from, to) {
  if (PO_TERMINAL.has(from)) return false;
  if (to === 'cancelled') return from === 'placed' || from === 'confirmed';
  return PO_RANK[to] > PO_RANK[from];
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email || null, shopId: null },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
  );
}

// Commission rate in basis points, from platform_settings key
// SUPPLY_COMMISSION_BPS (default 100 = 1.00%). Read inside the caller's tx so a
// rate change is honoured atomically; a missing/invalid value falls back to 100.
async function getCommissionBps(client) {
  const r = await client.query(
    "SELECT value FROM platform_settings WHERE key = 'SUPPLY_COMMISSION_BPS'"
  );
  const v = r.rowCount ? parseInt(r.rows[0].value, 10) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : 100;
}

// Resolve the caller's distributor row (by login user id). 404 if the login
// user has no distributor profile — keeps a distributor strictly scoped to its
// own row and never leaks the existence of others.
async function requireDistributor(req) {
  const r = await query(
    'SELECT * FROM distributors WHERE user_id = $1',
    [req.user.sub]
  );
  if (!r.rowCount) throw ApiError.notFound('Distributor profile not found');
  return r.rows[0];
}

function publicDistributor(d) {
  return {
    id: d.id,
    business_name: d.business_name,
    city: d.city,
    area: d.area,
    categories: d.categories,
    brands: d.brands,
    whatsapp: d.whatsapp,
    min_order_paise: Number(d.min_order_paise),
    is_active: d.is_active,
    created_at: d.created_at,
    updated_at: d.updated_at,
  };
}

// Idempotent delivery post: on a PO reaching 'delivered', insert (once) a
// 'supply' ledger row = subtotal and accrue a commission row. Guarded by the
// existence of a supply_ledger row for this po_id so it can never double-post,
// independent of the status pipeline.
async function postDeliveryIfNeeded(client, po) {
  const existing = await client.query(
    "SELECT 1 FROM supply_ledger WHERE po_id = $1 AND type = 'supply'",
    [po.id]
  );
  if (existing.rowCount) return; // already posted — never double-post

  const subtotal = Number(po.subtotal_paise);
  await client.query(
    `INSERT INTO supply_ledger (shop_id, distributor_id, type, amount_paise, po_id, note)
     VALUES ($1, $2, 'supply', $3, $4, $5)`,
    [po.shop_id, po.distributor_id, subtotal, po.id, 'PO delivered']
  );

  const bps = await getCommissionBps(client);
  const commission = Math.round((subtotal * bps) / 10000);
  await client.query(
    `INSERT INTO supply_commissions (po_id, distributor_id, shop_id, gmv_paise, rate_bps, amount_paise)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [po.id, po.distributor_id, po.shop_id, subtotal, bps, commission]
  );
}

// ---------------------------------------------------------------------------
// Distributor onboarding + self-service
// ---------------------------------------------------------------------------

/**
 * POST /api/distributors/register (public) — create a login user (role
 * 'distributor') + a distributors profile. Returns { token, distributor }.
 * Login thereafter uses the existing POST /api/auth/login (phone-or-email).
 */
exports.register = async (req, res) => {
  const {
    business_name, name, phone, password,
    city, area, categories, brands, whatsapp: wa,
  } = req.body;
  const email = req.body.email ? req.body.email.trim().toLowerCase() : null;
  const cleanPhone = phone.trim();

  const phoneClash = await query('SELECT 1 FROM users WHERE phone = $1', [cleanPhone]);
  if (phoneClash.rowCount) throw ApiError.conflict('Phone already in use');
  if (email) {
    const emailClash = await query('SELECT 1 FROM users WHERE LOWER(email) = $1', [email]);
    if (emailClash.rowCount) throw ApiError.conflict('Email already in use');
  }

  const hash = await bcrypt.hash(password, SALT);

  const result = await withTx(async (client) => {
    const userRes = await client.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,'distributor')
       RETURNING id, name, email, phone, role, created_at`,
      [name.trim(), email, cleanPhone, hash]
    );
    const user = userRes.rows[0];

    const distRes = await client.query(
      `INSERT INTO distributors
         (user_id, business_name, city, area, categories, brands, whatsapp)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        user.id, business_name.trim(), city || null, area || null,
        categories || [], brands || [], wa || null,
      ]
    );
    return { user, distributor: distRes.rows[0] };
  });

  const token = signToken(result.user);
  res.status(201).json({ token, distributor: publicDistributor(result.distributor) });
};

/** GET /api/distributor/me — the caller's own profile. */
exports.getMe = async (req, res) => {
  const d = await requireDistributor(req);
  res.json({ distributor: publicDistributor(d) });
};

/** PATCH /api/distributor/me — update the caller's own profile. */
exports.patchMe = async (req, res) => {
  const d = await requireDistributor(req);
  const b = req.body;
  const updated = await query(
    `UPDATE distributors SET
       business_name = COALESCE($2, business_name),
       city          = COALESCE($3, city),
       area          = COALESCE($4, area),
       categories    = COALESCE($5, categories),
       brands        = COALESCE($6, brands),
       whatsapp      = COALESCE($7, whatsapp),
       min_order_paise = COALESCE($8, min_order_paise),
       is_active     = COALESCE($9, is_active),
       updated_at    = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      d.id,
      b.business_name ?? null,
      b.city ?? null,
      b.area ?? null,
      b.categories ?? null,
      b.brands ?? null,
      b.whatsapp ?? null,
      b.min_order_paise ?? null,
      b.is_active ?? null,
    ]
  );
  res.json({ distributor: publicDistributor(updated.rows[0]) });
};

// ---------------------------------------------------------------------------
// Owner / staff: supplier discovery, purchase orders, supplier ledger
// ---------------------------------------------------------------------------

/**
 * GET /api/suppliers?category=&brand= (owner/staff) — active distributors
 * serving THIS shop's city (case-insensitive), with optional category/brand
 * array-overlap filters. Minimal, non-PII fields only.
 */
exports.listSuppliers = async (req, res) => {
  const shop = await query('SELECT city FROM shops WHERE id = $1', [req.user.shopId]);
  const city = shop.rowCount ? shop.rows[0].city : null;
  if (!city) return res.json({ suppliers: [] });

  const params = [city];
  const where = ['d.is_active = true', 'lower(d.city) = lower($1)'];
  if (req.query.category) {
    params.push([req.query.category]);
    where.push(`d.categories && $${params.length}`);
  }
  if (req.query.brand) {
    params.push([req.query.brand]);
    where.push(`d.brands && $${params.length}`);
  }
  const r = await query(
    `SELECT d.id, d.business_name, d.city, d.area, d.categories, d.brands, d.min_order_paise
       FROM distributors d
      WHERE ${where.join(' AND ')}
      ORDER BY d.business_name ASC`,
    params
  );
  const suppliers = r.rows.map((row) => ({
    id: row.id,
    business_name: row.business_name,
    city: row.city,
    area: row.area,
    categories: row.categories,
    brands: row.brands,
    min_order_paise: Number(row.min_order_paise),
  }));
  res.json({ suppliers });
};

/**
 * POST /api/purchase-orders (owner/staff) — place a PO (status 'placed',
 * subtotal 0 until the distributor prices it). Snapshots the requested items.
 * Fire-and-forget WhatsApp to the distributor if configured.
 */
exports.createPO = async (req, res) => {
  const { distributor_id, items, note } = req.body;

  const result = await withTx(async (client) => {
    const d = await client.query(
      'SELECT id, business_name, whatsapp, is_active FROM distributors WHERE id = $1',
      [distributor_id]
    );
    if (!d.rowCount || d.rows[0].is_active === false) {
      throw ApiError.notFound('Distributor not found');
    }

    const poRes = await client.query(
      `INSERT INTO purchase_orders (shop_id, distributor_id, status, note, subtotal_paise, placed_by)
       VALUES ($1,$2,'placed',$3,0,$4)
       RETURNING *`,
      [req.user.shopId, distributor_id, note || null, req.user.sub]
    );
    const po = poRes.rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO purchase_order_items (po_id, catalog_item_id, name, brand, pack, unit, qty)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [po.id, it.catalog_item_id || null, it.name, it.brand || null, it.pack || null, it.unit || null, it.qty]
      );
    }

    const lines = await client.query(
      'SELECT id, name, brand, pack, unit, qty, unit_price_paise, line_total_paise FROM purchase_order_items WHERE po_id = $1 ORDER BY name ASC',
      [po.id]
    );
    return { po, items: lines.rows, distributor: d.rows[0] };
  });

  // Fire-and-forget WhatsApp to the distributor (skipped when unconfigured).
  if (result.distributor.whatsapp && whatsapp.isConfigured()) {
    const itemList = result.items.map((i) => `- ${i.qty} x ${i.name}`).join('\n');
    whatsapp
      .sendText(
        result.distributor.whatsapp,
        `New purchase order received.\n${itemList}${result.po.note ? `\nNote: ${result.po.note}` : ''}`
      )
      .catch(() => {});
  }

  res.status(201).json({ purchase_order: { ...result.po, items: result.items } });
};

/** GET /api/purchase-orders?status= (owner/staff) — this shop's POs. */
exports.listPOs = async (req, res) => {
  const params = [req.user.shopId];
  let where = 'po.shop_id = $1';
  if (req.query.status) {
    params.push(req.query.status);
    where += ` AND po.status = $${params.length}`;
  }
  const r = await query(
    `SELECT po.*, d.business_name AS distributor_name,
            COUNT(poi.id)::int AS item_count
       FROM purchase_orders po
       JOIN distributors d ON d.id = po.distributor_id
       LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE ${where}
      GROUP BY po.id, d.business_name
      ORDER BY po.created_at DESC`,
    params
  );
  res.json({ purchase_orders: r.rows });
};

/** GET /api/purchase-orders/:id (owner/staff) — full PO with items. */
exports.getPO = async (req, res) => {
  const r = await query(
    `SELECT po.*, d.business_name AS distributor_name
       FROM purchase_orders po
       JOIN distributors d ON d.id = po.distributor_id
      WHERE po.id = $1 AND po.shop_id = $2`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Purchase order not found');
  const items = await query(
    `SELECT id, catalog_item_id, name, brand, pack, unit, qty, unit_price_paise, line_total_paise
       FROM purchase_order_items WHERE po_id = $1 ORDER BY name ASC`,
    [req.params.id]
  );
  res.json({ purchase_order: { ...r.rows[0], items: items.rows } });
};

/**
 * POST /api/purchase-orders/:id/cancel (owner/staff) — cancel a PO while it is
 * still in placed/confirmed. Shop-scoped.
 */
exports.cancelPO = async (req, res) => {
  const po = await withTx(async (client) => {
    const r = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [req.params.id, req.user.shopId]
    );
    if (!r.rowCount) throw ApiError.notFound('Purchase order not found');
    if (!canTransition(r.rows[0].status, 'cancelled')) {
      throw ApiError.unprocessable('Cannot cancel this order', { from: r.rows[0].status });
    }
    const upd = await client.query(
      "UPDATE purchase_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    return upd.rows[0];
  });
  res.json({ purchase_order: po });
};

/**
 * GET /api/suppliers/ledger (owner/staff) — per-distributor balance this shop
 * owes. With ?distributor_id=, returns that pair's dated ledger entries too.
 * balance = Σ supply − Σ payment (exact integer paise).
 */
exports.suppliersLedger = async (req, res) => {
  const { distributor_id } = req.query;

  const balances = await query(
    `SELECT sl.distributor_id, d.business_name,
            SUM(CASE WHEN sl.type = 'supply' THEN sl.amount_paise ELSE -sl.amount_paise END)::bigint AS balance_paise
       FROM supply_ledger sl
       JOIN distributors d ON d.id = sl.distributor_id
      WHERE sl.shop_id = $1
      GROUP BY sl.distributor_id, d.business_name
      ORDER BY d.business_name ASC`,
    [req.user.shopId]
  );
  const suppliers = balances.rows.map((row) => ({
    distributor_id: row.distributor_id,
    business_name: row.business_name,
    balance_paise: Number(row.balance_paise),
  }));

  const out = { suppliers };
  if (distributor_id) {
    const entries = await query(
      `SELECT id, type, amount_paise, po_id, method, note, created_at
         FROM supply_ledger
        WHERE shop_id = $1 AND distributor_id = $2
        ORDER BY created_at DESC`,
      [req.user.shopId, distributor_id]
    );
    out.entries = entries.rows.map((e) => ({ ...e, amount_paise: Number(e.amount_paise) }));
  }
  res.json(out);
};

// ---------------------------------------------------------------------------
// Distributor: incoming orders, pricing/fulfilment, shop ledgers, payments
// ---------------------------------------------------------------------------

/** GET /api/distributor/orders?status= — incoming POs (with shop name). */
exports.listOrders = async (req, res) => {
  const d = await requireDistributor(req);
  const params = [d.id];
  let where = 'po.distributor_id = $1';
  if (req.query.status) {
    params.push(req.query.status);
    where += ` AND po.status = $${params.length}`;
  }
  const r = await query(
    `SELECT po.*, s.name AS shop_name, COUNT(poi.id)::int AS item_count
       FROM purchase_orders po
       JOIN shops s ON s.id = po.shop_id
       LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE ${where}
      GROUP BY po.id, s.name
      ORDER BY po.created_at DESC`,
    params
  );
  res.json({ orders: r.rows });
};

/** GET /api/distributor/orders/:id — a single incoming PO with items. */
exports.getOrder = async (req, res) => {
  const d = await requireDistributor(req);
  const r = await query(
    `SELECT po.*, s.name AS shop_name
       FROM purchase_orders po
       JOIN shops s ON s.id = po.shop_id
      WHERE po.id = $1 AND po.distributor_id = $2`,
    [req.params.id, d.id]
  );
  if (!r.rowCount) throw ApiError.notFound('Order not found');
  const items = await query(
    `SELECT id, catalog_item_id, name, brand, pack, unit, qty, unit_price_paise, line_total_paise
       FROM purchase_order_items WHERE po_id = $1 ORDER BY name ASC`,
    [req.params.id]
  );
  res.json({ order: { ...r.rows[0], items: items.rows } });
};

/**
 * PATCH /api/distributor/orders/:id { status?, items? } — price items
 * (recomputes line_total + subtotal) and/or advance status forward only.
 * Reaching 'delivered' posts the ledger + commission (idempotent).
 */
exports.patchOrder = async (req, res) => {
  const d = await requireDistributor(req);
  const { status: next, items } = req.body;

  const po = await withTx(async (client) => {
    const r = await client.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND distributor_id = $2 FOR UPDATE',
      [req.params.id, d.id]
    );
    if (!r.rowCount) throw ApiError.notFound('Order not found');
    let current = r.rows[0];

    // 1) Apply item prices first, so a subsequent 'delivered' posts the right
    // subtotal. Pricing is only allowed before the order is terminal.
    if (items && items.length) {
      if (PO_TERMINAL.has(current.status)) {
        throw ApiError.conflict('Cannot reprice a delivered or cancelled order');
      }
      for (const it of items) {
        await client.query(
          `UPDATE purchase_order_items
              SET unit_price_paise = $3::bigint,
                  line_total_paise = $3::bigint * qty
            WHERE id = $1 AND po_id = $2`,
          [it.id, current.id, it.unit_price_paise]
        );
      }
      const sum = await client.query(
        'SELECT COALESCE(SUM(line_total_paise),0)::bigint AS subtotal FROM purchase_order_items WHERE po_id = $1',
        [current.id]
      );
      const upd = await client.query(
        'UPDATE purchase_orders SET subtotal_paise = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
        [current.id, sum.rows[0].subtotal]
      );
      current = upd.rows[0];
    }

    // 2) Advance status (forward-move only; cancel from placed/confirmed).
    if (next && next !== current.status) {
      if (!canTransition(current.status, next)) {
        throw ApiError.unprocessable('Invalid status transition', {
          from: current.status,
          to: next,
        });
      }
      const upd = await client.query(
        'UPDATE purchase_orders SET status = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
        [current.id, next]
      );
      current = upd.rows[0];

      if (next === 'delivered') {
        await postDeliveryIfNeeded(client, current);
      }
    }

    return current;
  });

  const items2 = await query(
    `SELECT id, catalog_item_id, name, brand, pack, unit, qty, unit_price_paise, line_total_paise
       FROM purchase_order_items WHERE po_id = $1 ORDER BY name ASC`,
    [po.id]
  );
  res.json({ order: { ...po, items: items2.rows } });
};

/**
 * GET /api/distributor/shops — shops that trade with this distributor and what
 * each owes: { shop_id, shop_name, balance_paise }. Same exact-paise balance as
 * the owner's supplier ledger.
 */
exports.listDistShops = async (req, res) => {
  const d = await requireDistributor(req);
  const r = await query(
    `SELECT sl.shop_id, s.name AS shop_name,
            SUM(CASE WHEN sl.type = 'supply' THEN sl.amount_paise ELSE -sl.amount_paise END)::bigint AS balance_paise
       FROM supply_ledger sl
       JOIN shops s ON s.id = sl.shop_id
      WHERE sl.distributor_id = $1
      GROUP BY sl.shop_id, s.name
      ORDER BY s.name ASC`,
    [d.id]
  );
  const shops = r.rows.map((row) => ({
    shop_id: row.shop_id,
    shop_name: row.shop_name,
    balance_paise: Number(row.balance_paise),
  }));
  res.json({ shops });
};

/**
 * POST /api/distributor/shops/:shopId/payment { amount_paise, method?, note? }
 * — record a payment RECEIVED from a shop (inserts a 'payment' ledger row).
 * Validates the shop actually trades with this distributor.
 */
exports.recordPayment = async (req, res) => {
  const d = await requireDistributor(req);
  const { shopId } = req.params;
  const { amount_paise, method, note } = req.body;

  const entry = await withTx(async (client) => {
    // The shop must have at least one PO with this distributor to trade.
    const trades = await client.query(
      'SELECT 1 FROM purchase_orders WHERE shop_id = $1 AND distributor_id = $2 LIMIT 1',
      [shopId, d.id]
    );
    if (!trades.rowCount) {
      throw ApiError.notFound('Shop does not trade with this distributor');
    }
    const ins = await client.query(
      `INSERT INTO supply_ledger (shop_id, distributor_id, type, amount_paise, method, note)
       VALUES ($1,$2,'payment',$3,$4,$5)
       RETURNING *`,
      [shopId, d.id, amount_paise, method || null, note || null]
    );
    return ins.rows[0];
  });
  res.status(201).json({ entry: { ...entry, amount_paise: Number(entry.amount_paise) } });
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** GET /api/admin/distributors (admin, shops:view) — list + supply counts. */
exports.adminListDistributors = async (_req, res) => {
  const r = await query(
    `SELECT d.id, d.business_name, d.city, d.area, d.categories, d.brands,
            d.min_order_paise, d.is_active, d.created_at,
            (SELECT COUNT(*)::int FROM purchase_orders po WHERE po.distributor_id = d.id) AS po_count,
            (SELECT COUNT(*)::int FROM purchase_orders po WHERE po.distributor_id = d.id AND po.status = 'delivered') AS delivered_count,
            COALESCE((SELECT SUM(sc.gmv_paise) FROM supply_commissions sc WHERE sc.distributor_id = d.id AND sc.status = 'accrued'), 0)::bigint AS gmv_paise,
            COALESCE((SELECT SUM(sc.amount_paise) FROM supply_commissions sc WHERE sc.distributor_id = d.id AND sc.status = 'accrued'), 0)::bigint AS commission_paise
       FROM distributors d
      ORDER BY d.created_at DESC`
  );
  const distributors = r.rows.map((row) => ({
    ...row,
    min_order_paise: Number(row.min_order_paise),
    gmv_paise: Number(row.gmv_paise),
    commission_paise: Number(row.commission_paise),
  }));
  res.json({ distributors });
};
