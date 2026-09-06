const { query, withTx } = require('../config/db');
const ApiError = require('../utils/ApiError');
const whatsapp = require('../services/whatsapp.service');

// Pre-order / demand board (Batch F2). A shop owner posts an upcoming need; a
// nearby farmer/distributor claims it, which spawns a real purchase_order into
// the EXISTING PO pipeline (status 'placed', subtotal 0). Demand posts carry NO
// prices — `qty` is an integer count only. All money logic stays in the PO path.

// Resolve the caller's distributor row (by login user id). 404 if the login user
// has no distributor profile — mirrors distributor.controller.requireDistributor
// so a distributor stays strictly scoped to its own row.
async function requireDistributor(req) {
  const r = await query('SELECT * FROM distributors WHERE user_id = $1', [req.user.sub]);
  if (!r.rowCount) throw ApiError.notFound('Distributor profile not found');
  return r.rows[0];
}

// Public shape for a demand post + its items. `extra` may carry claim info
// (claimed_by_name) and/or shop info (shop_name, shop_area) depending on the
// surface. No prices, no shop PII beyond name/area.
function publicDemandPost(post, items, extra = {}) {
  const out = {
    id: post.id,
    shop_id: post.shop_id,
    needed_by: post.needed_by,
    note: post.note,
    status: post.status,
    created_at: post.created_at,
    updated_at: post.updated_at,
    po_id: post.po_id || null,
    claimed_at: post.claimed_at || null,
    items: (items || []).map((it) => ({
      id: it.id,
      name: it.name,
      brand: it.brand,
      pack: it.pack,
      unit: it.unit,
      qty: it.qty,
    })),
  };
  if (extra.claimed_by_name !== undefined) out.claimed_by_name = extra.claimed_by_name;
  if (extra.shop_name !== undefined) out.shop_name = extra.shop_name;
  if (extra.shop_area !== undefined) out.shop_area = extra.shop_area;
  return out;
}

async function loadItems(client, postId) {
  const r = await (client || { query }).query(
    'SELECT id, name, brand, pack, unit, qty FROM demand_post_items WHERE demand_post_id = $1 ORDER BY name ASC',
    [postId]
  );
  return r.rows;
}

// ---------------------------------------------------------------------------
// Owner / staff — post + manage a shop's demand board (scoped by req.user.shopId)
// ---------------------------------------------------------------------------

/**
 * POST /api/demand-posts (owner/staff) — create an OPEN demand post + snapshot
 * its items (qty > 0). No prices. Returns { demand_post } with items.
 */
exports.createPost = async (req, res) => {
  const { needed_by, items, note } = req.body;

  const result = await withTx(async (client) => {
    const postRes = await client.query(
      `INSERT INTO demand_posts (shop_id, needed_by, note, status, created_by)
       VALUES ($1, $2, $3, 'open', $4)
       RETURNING *`,
      [req.user.shopId, needed_by || null, note || null, req.user.sub]
    );
    const post = postRes.rows[0];

    for (const it of items) {
      await client.query(
        `INSERT INTO demand_post_items (demand_post_id, name, brand, pack, unit, qty)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [post.id, it.name, it.brand || null, it.pack || null, it.unit || null, it.qty]
      );
    }
    const lines = await loadItems(client, post.id);
    return { post, items: lines };
  });

  res.status(201).json({ demand_post: publicDemandPost(result.post, result.items) });
};

/**
 * GET /api/demand-posts?status= (owner/staff) — this shop's posts, newest first,
 * each with items and (when claimed) the claimer's business_name + po_id.
 */
exports.listPosts = async (req, res) => {
  const params = [req.user.shopId];
  let where = 'dp.shop_id = $1';
  if (req.query.status) {
    params.push(req.query.status);
    where += ` AND dp.status = $${params.length}`;
  }
  const r = await query(
    `SELECT dp.*, d.business_name AS claimed_by_name
       FROM demand_posts dp
       LEFT JOIN distributors d ON d.id = dp.claimed_by_distributor_id
      WHERE ${where}
      ORDER BY dp.created_at DESC`,
    params
  );
  const posts = [];
  for (const row of r.rows) {
    const items = await loadItems(null, row.id);
    posts.push(publicDemandPost(row, items, { claimed_by_name: row.claimed_by_name || null }));
  }
  res.json({ demand_posts: posts });
};

/** GET /api/demand-posts/:id (owner/staff) — one shop-scoped post with items. */
exports.getPost = async (req, res) => {
  const r = await query(
    `SELECT dp.*, d.business_name AS claimed_by_name
       FROM demand_posts dp
       LEFT JOIN distributors d ON d.id = dp.claimed_by_distributor_id
      WHERE dp.id = $1 AND dp.shop_id = $2`,
    [req.params.id, req.user.shopId]
  );
  if (!r.rowCount) throw ApiError.notFound('Demand post not found');
  const items = await loadItems(null, req.params.id);
  res.json({
    demand_post: publicDemandPost(r.rows[0], items, {
      claimed_by_name: r.rows[0].claimed_by_name || null,
    }),
  });
};

/**
 * POST /api/demand-posts/:id/cancel (owner/staff) — cancel a post while it is
 * still 'open'. Shop-scoped; cancelling a claimed/cancelled post → 409.
 */
exports.cancelPost = async (req, res) => {
  const post = await withTx(async (client) => {
    const r = await client.query(
      'SELECT * FROM demand_posts WHERE id = $1 AND shop_id = $2 FOR UPDATE',
      [req.params.id, req.user.shopId]
    );
    if (!r.rowCount) throw ApiError.notFound('Demand post not found');
    if (r.rows[0].status !== 'open') {
      throw ApiError.conflict('Only an open demand post can be cancelled', {
        status: r.rows[0].status,
      });
    }
    const upd = await client.query(
      "UPDATE demand_posts SET status = 'cancelled', updated_at = NOW() WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    return upd.rows[0];
  });
  const items = await loadItems(null, post.id);
  res.json({ demand_post: publicDemandPost(post, items) });
};

// ---------------------------------------------------------------------------
// Distributor — the demand board + claim (scoped to the caller's distributor row)
// ---------------------------------------------------------------------------

/**
 * GET /api/demand-board (distributor) — OPEN posts from shops in the caller's
 * city (case-insensitive), newest first, each with items + shop name/area +
 * needed_by. No shop PII beyond name/area. No city → empty list.
 */
exports.listBoard = async (req, res) => {
  const d = await requireDistributor(req);
  if (!d.city) return res.json({ demand_posts: [] });

  const r = await query(
    `SELECT dp.*, s.name AS shop_name, s.area AS shop_area
       FROM demand_posts dp
       JOIN shops s ON s.id = dp.shop_id
      WHERE dp.status = 'open' AND lower(s.city) = lower($1)
      ORDER BY dp.created_at DESC`,
    [d.city]
  );
  const posts = [];
  for (const row of r.rows) {
    const items = await loadItems(null, row.id);
    posts.push(
      publicDemandPost(row, items, { shop_name: row.shop_name, shop_area: row.shop_area })
    );
  }
  res.json({ demand_posts: posts });
};

/**
 * POST /api/demand-board/:id/claim (distributor) — in ONE tx: SELECT ... FOR
 * UPDATE the post, re-check status = 'open' (else 409), create a purchase_order
 * (status 'placed', subtotal 0, distributor_id = caller's, shop_id = post's),
 * copy the demand items → purchase_order_items (NO prices), and mark the post
 * 'claimed' + link the po_id. The FOR UPDATE + status re-check makes a
 * double-claim impossible: a second claim on a now-'claimed' post → 409.
 */
exports.claim = async (req, res) => {
  const d = await requireDistributor(req);

  const result = await withTx(async (client) => {
    const r = await client.query(
      'SELECT * FROM demand_posts WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!r.rowCount) throw ApiError.notFound('Demand post not found');
    const post = r.rows[0];
    if (post.status !== 'open') {
      throw ApiError.conflict('This demand post is no longer open', { status: post.status });
    }

    // Copy the demand items (snapshotted, no prices).
    const itemsRes = await client.query(
      'SELECT name, brand, pack, unit, qty FROM demand_post_items WHERE demand_post_id = $1 ORDER BY name ASC',
      [post.id]
    );

    // Spawn the PO into the existing pipeline. placed_by = null (no shop user
    // placed it — the claim originated from the farmer side).
    const poNote = post.note
      ? `From demand board — ${post.note}`
      : 'From demand board';
    const poRes = await client.query(
      `INSERT INTO purchase_orders (shop_id, distributor_id, status, note, subtotal_paise, placed_by)
       VALUES ($1, $2, 'placed', $3, 0, NULL)
       RETURNING *`,
      [post.shop_id, d.id, poNote]
    );
    const po = poRes.rows[0];

    for (const it of itemsRes.rows) {
      await client.query(
        `INSERT INTO purchase_order_items (po_id, name, brand, pack, unit, qty)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [po.id, it.name, it.brand || null, it.pack || null, it.unit || null, it.qty]
      );
    }

    const updRes = await client.query(
      `UPDATE demand_posts
          SET status = 'claimed', claimed_by_distributor_id = $2, claimed_at = NOW(),
              po_id = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [post.id, d.id, po.id]
    );

    const poItems = await client.query(
      'SELECT id, catalog_item_id, name, brand, pack, unit, qty, unit_price_paise, line_total_paise FROM purchase_order_items WHERE po_id = $1 ORDER BY name ASC',
      [po.id]
    );
    return { post: updRes.rows[0], po, poItems: poItems.rows };
  });

  // Fire-and-forget claim notification to the shop owner (skipped when the
  // WhatsApp service is unconfigured). Never blocks the claim.
  if (whatsapp.isConfigured()) {
    query('SELECT u.phone FROM shops s JOIN users u ON u.id = s.owner_id WHERE s.id = $1', [
      result.post.shop_id,
    ])
      .then((rr) => {
        const phone = rr.rowCount ? rr.rows[0].phone : null;
        if (phone) {
          whatsapp
            .sendText(phone, 'A supplier has claimed your demand post and created an order.')
            .catch(() => {});
        }
      })
      .catch(() => {});
  }

  const items = await loadItems(null, result.post.id);
  res.status(201).json({
    purchase_order: { ...result.po, items: result.poItems },
    demand_post: publicDemandPost(result.post, items),
  });
};
