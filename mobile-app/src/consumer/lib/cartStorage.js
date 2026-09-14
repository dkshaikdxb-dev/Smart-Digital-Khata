import * as SecureStore from 'expo-secure-store';

// Per-shop cart persistence for the native consumer app, mirroring the web
// PWA's admin-dashboard/src/lib/customerCart.js: ONE cart per shop, each under
// its own key, plus an "active shop" pointer that says which cart the Cart tab
// is currently reviewing.
//
// Storage is expo-secure-store (already a dependency, and the same store the
// language choice and the data-saver flag use). Nothing here EVER throws: a
// blocked, full or corrupt store degrades to "no saved cart" rather than
// taking the app down, and a failed write is swallowed so adding an item is
// never blocked by storage.
//
// WHY IT IS CHUNKED
// Android backs SecureStore onto encrypted SharedPreferences and documents a
// 2048-byte ceiling per value. A product id is a 36-character UUID, so a
// month's kirana list — thirty or forty lines — passes that ceiling on the ids
// alone, no matter how tightly the rest is packed. The choices were to drop
// lines (silently losing items a shopper added, which is the exact bug this
// file exists to fix) or to split across keys. It splits.
//
// The header is written LAST and names the chunk count and the expected item
// count. A half-finished write therefore leaves no usable header, and a set of
// chunks that does not add up is rejected on read — so an interrupted save
// restores as "no saved cart", never as a cart missing three lines whose total
// a shopper might act on.
//
// SecureStore keys may only contain alphanumerics, '.', '-' and '_'. Shop ids
// are UUIDs, which qualify; anything else is sanitized before use.

const PREFIX = 'skhata_consumer_cart_';
const ACTIVE_KEY = 'skhata_consumer_cart_active';

// Stay comfortably inside Android's documented 2048-byte limit.
const MAX_VALUE_BYTES = 1800;
// A ceiling on how far this will go: ~250 lines. Past that something is wrong
// and we would rather store nothing than hammer the keystore.
const MAX_CHUNKS = 12;
// How far past the current chunk count to sweep for leftovers from a bigger
// earlier cart. Correctness does not depend on this — reads only ever look at
// the chunks the header names — it just stops dead keys accumulating.
const STALE_SWEEP = 4;

function keyFor(shopId) {
  const id = String(shopId || '').replace(/[^A-Za-z0-9._-]/g, '');
  return id ? `${PREFIX}${id}` : '';
}
const chunkKey = (base, i) => `${base}_p${i}`;

// ---- compact wire shape ---------------------------------------------------
// Every item is an ARRAY, not an object: the cart is rewritten on every tap,
// on a cheap phone, and repeating key names forty times is bytes spent on
// nothing. Positional, and the order never changes:
//
//   [ product_id, name, price(paise), quantity, weight_grams|0, unit, image_url ]
//
// Trailing empty fields are trimmed off. Price, quantity and weight are the
// three the shopper's money depends on, so they sit before anything droppable
// and are never shed.

const F_ID = 0, F_NAME = 1, F_PRICE = 2, F_QTY = 3, F_GRAMS = 4, F_UNIT = 5, F_IMG = 6;

function packItem(it, tier) {
  const row = [
    String(it.product_id),
    tier >= 2 ? truncate(String(it.name || ''), 18) : String(it.name || ''),
    Number(it.price || 0),
    it.sold_by_weight ? 1 : Number(it.quantity || 0),
    it.sold_by_weight ? Number(it.weight_grams || 0) : 0,
    tier >= 2 ? '' : String(it.unit || ''),
    tier >= 1 ? '' : String(it.image_url || ''),
  ];
  // Trim trailing empties — a unit item with no photo stops after the grams 0.
  let end = row.length;
  while (end > F_QTY + 1 && (row[end - 1] === '' || row[end - 1] === 0)) end -= 1;
  return row.slice(0, end);
}

function unpackItem(row) {
  if (!Array.isArray(row) || row.length < F_QTY + 1) return null;
  const id = row[F_ID];
  if (!id || typeof id !== 'string') return null;
  const price = Number(row[F_PRICE]);
  if (!Number.isFinite(price) || price < 0) return null;
  const grams = Number(row[F_GRAMS] || 0);
  const base = {
    product_id: id,
    name: String(row[F_NAME] == null ? '' : row[F_NAME]),
    unit: String(row[F_UNIT] == null ? '' : row[F_UNIT]),
    price,
    image_url: String(row[F_IMG] == null ? '' : row[F_IMG]),
  };
  if (Number.isFinite(grams) && grams > 0) {
    return { ...base, sold_by_weight: true, weight_grams: grams, quantity: 1 };
  }
  const qty = Number(row[F_QTY]);
  if (!Number.isFinite(qty) || qty <= 0) return null;
  return { ...base, quantity: qty };
}

// Keep whole characters — slicing code units can cut a surrogate pair in half
// and leave a replacement glyph in the middle of a product name.
function truncate(s, n) {
  const chars = Array.from(s);
  return chars.length <= n ? s : chars.slice(0, n).join('');
}

// UTF-8 byte length without Buffer (not available in the RN runtime).
function byteLength(s) {
  let n = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i += 1; }
    else n += 3;
  }
  return n;
}

// Split packed rows into chunks that each serialize under the ceiling. A single
// row that cannot fit on its own would loop forever, so it gets its own chunk
// and we accept being over — losing the line would be worse than a warning.
function chunkRows(rows) {
  const chunks = [];
  let current = [];
  for (let i = 0; i < rows.length; i += 1) {
    const next = current.concat([rows[i]]);
    if (current.length > 0 && byteLength(JSON.stringify(next)) > MAX_VALUE_BYTES) {
      chunks.push(current);
      current = [rows[i]];
    } else {
      current = next;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// Pack a cart at the tightest tier that fits inside MAX_CHUNKS.
//   tier 0 — everything
//   tier 1 — drop photo URLs (the thumbnail falls back to its category emoji,
//            which is what data saver shows anyway)
//   tier 2 — also drop units and truncate names
// Money is never shed at any tier.
function packCart(cart) {
  const items = Object.values((cart && cart.items) || {});
  if (!cart || !cart.shop_id || items.length === 0) return null;
  let chunks = null;
  for (let tier = 0; tier <= 2; tier += 1) {
    chunks = chunkRows(items.map((it) => packItem(it, tier)));
    if (chunks.length <= MAX_CHUNKS) break;
  }
  if (!chunks || chunks.length > MAX_CHUNKS) return null; // absurdly large: store nothing
  return {
    header: { s: cart.shop_id, n: cart.shop_name || '', k: chunks.length, t: items.length },
    chunks,
  };
}

// ---- public API -----------------------------------------------------------

// The shop whose cart the app was last working on, or null.
export async function getActiveShopId() {
  try {
    const v = await SecureStore.getItemAsync(ACTIVE_KEY);
    return v || null;
  } catch (e) {
    return null;
  }
}

// Read one shop's saved cart. Missing, unreadable, corrupt or incomplete ->
// null (start empty), never a throw and never a partial basket.
export async function loadCart(shopId) {
  const key = keyFor(shopId);
  if (!key) return null;
  try {
    const raw = await SecureStore.getItemAsync(key);
    if (!raw) return null;

    const header = JSON.parse(raw);
    if (!header || typeof header !== 'object' || !header.s) return null;
    const count = Number(header.k);
    const expected = Number(header.t);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;

    const items = {};
    let seen = 0;
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      if (!part) return null; // a chunk is missing: the save never finished
      const rows = JSON.parse(part);
      if (!Array.isArray(rows)) return null;
      for (let j = 0; j < rows.length; j += 1) {
        seen += 1;
        const it = unpackItem(rows[j]);
        if (it) items[it.product_id] = it;
      }
    }
    // Every line the header promised must be accounted for. A basket that is
    // quietly three items short is worse than no basket: the shopper would
    // check out against a total that is not theirs.
    if (Number.isInteger(expected) && seen !== expected) return null;
    if (Object.keys(items).length === 0) return null;

    return { shop_id: String(header.s), shop_name: String(header.n || ''), items };
  } catch (e) {
    // Corrupt or unreadable: drop it so it cannot fail again on every launch.
    await forget(key).catch(() => {});
    return null;
  }
}

// Restore whatever cart the app should open with. Returns null when there is
// none. Any failure along the way is an empty cart, not an error.
export async function restoreCart() {
  const shopId = await getActiveShopId();
  if (!shopId) return null;
  return loadCart(shopId);
}

// Persist a cart and point "active" at it. An empty cart removes its keys and
// clears the pointer, exactly like the web's saveCart. Resolves either way —
// callers treat persistence as best effort and never await it before updating
// the UI.
export async function saveCart(cart) {
  if (!cart || !cart.shop_id) return false;
  const key = keyFor(cart.shop_id);
  if (!key) return false;

  const packed = packCart(cart);
  try {
    if (!packed) {
      await forget(key);
      const active = await SecureStore.getItemAsync(ACTIVE_KEY);
      if (active === String(cart.shop_id)) await SecureStore.deleteItemAsync(ACTIVE_KEY);
      return true;
    }
    // Header LAST. Until it lands there is nothing claiming these chunks are a
    // cart, so an interrupted write reads back as "no saved cart" rather than
    // as a cart with lines missing.
    for (let i = 0; i < packed.chunks.length; i += 1) {
      await SecureStore.setItemAsync(chunkKey(key, i), JSON.stringify(packed.chunks[i]));
    }
    await SecureStore.setItemAsync(key, JSON.stringify(packed.header));
    await SecureStore.setItemAsync(ACTIVE_KEY, String(cart.shop_id));
    // Leftovers from a previously larger cart. Reads never look at these, so a
    // failure here is cosmetic.
    for (let i = packed.chunks.length; i < packed.chunks.length + STALE_SWEEP; i += 1) {
      await SecureStore.deleteItemAsync(chunkKey(key, i)).catch(() => {});
    }
    return true;
  } catch (e) {
    // Storage unavailable or full. The in-memory cart is untouched and the
    // shopper's next tap still works — they only lose it if the app dies.
    return false;
  }
}

// Forget one shop's cart (and the pointer, if it pointed here).
export async function clearCart(shopId) {
  const key = keyFor(shopId);
  if (!key) return;
  try {
    await forget(key);
    const active = await SecureStore.getItemAsync(ACTIVE_KEY);
    if (active === String(shopId)) await SecureStore.deleteItemAsync(ACTIVE_KEY);
  } catch (e) { /* ignore */ }
}

// Delete a cart's header and every chunk it could own.
async function forget(key) {
  await SecureStore.deleteItemAsync(key);
  for (let i = 0; i < MAX_CHUNKS + STALE_SWEEP; i += 1) {
    await SecureStore.deleteItemAsync(chunkKey(key, i));
  }
}
