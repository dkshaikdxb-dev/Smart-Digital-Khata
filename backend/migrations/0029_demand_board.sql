-- Pre-order / demand board (Batch F2) — an ADDITIVE surface on top of the O1
-- distributor ecosystem (0027) and the F1 farmer flavour (0028). A shop OWNER
-- posts an upcoming produce need ("30 kg tomato, needed by Sat"); nearby farmers
-- see a board of open needs and CLAIM one. A claim spawns a real purchase_order
-- (status 'placed', subtotal 0) into the EXISTING PO pipeline — the farmer then
-- prices → confirms → delivers, and the unchanged ledger + commission logic runs.
--
-- A demand post is essentially a pared-down PO dated for the future and not yet
-- assigned to a supplier. There are NO PRICES on these tables — all pricing still
-- flows through the existing PO path, so this batch adds NO money logic. `qty` is
-- an integer count, never money. Nothing existing is touched.

CREATE TABLE IF NOT EXISTS demand_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  needed_by DATE,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','claimed','cancelled')),
  created_by UUID,
  claimed_by_distributor_id UUID REFERENCES distributors(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  po_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_demand_posts_shop ON demand_posts(shop_id, status);
CREATE INDEX IF NOT EXISTS idx_demand_posts_open ON demand_posts(status) WHERE status = 'open';

-- Demand line items — a snapshot of the requested item. NO prices; the farmer
-- sets prices later on the spawned PO's items.
CREATE TABLE IF NOT EXISTS demand_post_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_post_id UUID NOT NULL REFERENCES demand_posts(id) ON DELETE CASCADE,
  name TEXT NOT NULL, brand TEXT, pack TEXT, unit TEXT,
  qty INTEGER NOT NULL CHECK (qty > 0)
);
CREATE INDEX IF NOT EXISTS idx_demand_post_items_post ON demand_post_items(demand_post_id);
