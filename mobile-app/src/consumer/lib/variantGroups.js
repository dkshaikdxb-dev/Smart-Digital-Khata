// Folding a shop's product rows into display units, and filtering them.
//
// The storefront endpoint (GET /api/public/shops/:id) already returns
// `base_product`, `brand` and `pack` on every catalog-linked row — the web PWA
// has grouped on them since it shipped. The native app did not, so a shop with
// four brands of rice in three pack sizes rendered TWELVE near-identical rows:
// "Daawat Sona Masuri Rice 1 kg", "bb Royal Sona Masuri Rice 10 kg", and so on.
// That is a worse shopping experience AND it makes a modest catalogue look
// padded, which is the opposite of what a kirana owner wants a customer to see.
//
// So this mirrors admin-dashboard/src/pages/c/shop/[shopId].js exactly: rows
// sharing a non-null base_product become ONE unit carrying its variants; a group
// that ends up with a single row collapses back to a plain product, because a
// "group" of one is indistinguishable from an ungrouped item and rendering brand
// chips for it would be noise.
//
// CRITICALLY, grouping is presentation only. Each (brand, pack) is still its own
// real product row with its own id and its own integer-paise price; the cart,
// the stepper and checkout all go on operating on a resolved concrete product,
// exactly as before. No money is combined, averaged or recomputed anywhere here.
//
// Pure functions, no React, no imports — so they can be reasoned about and
// exercised on their own.

/**
 * Fold products into display units, preserving first-seen order.
 * @param {Array} products rows from the storefront payload
 * @returns {Array} [{kind:'single', key, product} | {kind:'group', key, base, variants}]
 */
export function groupVariants(products) {
  const rows = Array.isArray(products) ? products : [];
  const groupIndex = new Map(); // base_product -> unit reference
  const list = [];
  for (const p of rows) {
    const bp = p && p.base_product;
    if (bp) {
      let u = groupIndex.get(bp);
      if (!u) {
        u = { kind: 'group', key: `g_${bp}`, base: bp, variants: [] };
        groupIndex.set(bp, u);
        list.push(u);
      }
      u.variants.push(p);
    } else if (p) {
      list.push({ kind: 'single', key: `s_${p.id}`, product: p });
    }
  }
  return list.map((u) =>
    u.kind === 'group' && u.variants.length === 1
      ? { kind: 'single', key: `s_${u.variants[0].id}`, product: u.variants[0] }
      : u
  );
}

// Does one product row match a lowercased search term? Matches the display name
// AND, for catalog-linked rows, the generic base name, the brand, and
// `search_text` — the normalized all-language blob the API sends, so a shopper
// typing "chawal" or "चावल" finds the row whose name is "Rice".
function matchesTerm(p, q) {
  if (!q) return true;
  return [p && p.name, p && p.base_product, p && p.brand, p && p.search_text].some((f) =>
    String(f || '').toLowerCase().includes(q)
  );
}

/**
 * Filter display units by a free-text search and a category.
 * A GROUP survives if ANY of its variants matches — hiding a group because the
 * shopper typed a brand that only one of its variants carries would hide the
 * item they were looking for.
 */
export function filterUnits(units, { search = '', category = '' } = {}) {
  const q = String(search || '').trim().toLowerCase();
  const cat = String(category || '');
  const list = Array.isArray(units) ? units : [];
  if (!q && !cat) return list;
  return list.filter((u) => {
    if (u.kind === 'single') {
      if (cat && u.product.category !== cat) return false;
      return matchesTerm(u.product, q);
    }
    if (cat && !u.variants.some((v) => v.category === cat)) return false;
    return u.variants.some((p) => matchesTerm(p, q));
  });
}

/** Distinct categories present in a product list, in first-seen order. */
export function categoriesOf(products) {
  const seen = [];
  for (const p of Array.isArray(products) ? products : []) {
    const c = p && p.category;
    if (c && !seen.includes(c)) seen.push(c);
  }
  return seen;
}

/**
 * The brand axis of a variant group, in first-seen order. A null/absent brand
 * collapses to '' so a group with one implicit brand shows no brand row at all.
 */
export function brandsOf(variants) {
  const seen = [];
  for (const v of Array.isArray(variants) ? variants : []) {
    const b = v && v.brand != null ? v.brand : '';
    if (!seen.includes(b)) seen.push(b);
  }
  return seen;
}

/** The pack/size axis available FOR one brand, in first-seen order. */
export function packsOf(variants, brand) {
  const seen = [];
  for (const v of Array.isArray(variants) ? variants : []) {
    if (!v) continue;
    if ((v.brand != null ? v.brand : '') !== brand) continue;
    const pk = v.pack != null ? v.pack : '';
    if (!seen.includes(pk)) seen.push(pk);
  }
  return seen;
}

/**
 * Resolve a (brand, pack) selection back to the concrete product row, falling
 * back to the first variant so this NEVER returns undefined — the caller prices
 * and adds to the cart from whatever comes back, and an undefined here would be
 * a crash on a storefront.
 */
export function resolveVariant(variants, brand, pack) {
  const list = Array.isArray(variants) ? variants : [];
  const hit = list.find(
    (v) => (v.brand != null ? v.brand : '') === brand && (v.pack != null ? v.pack : '') === pack
  );
  return hit || list[0] || null;
}

/**
 * Given the current (possibly stale) selection, return the valid one: a brand
 * that still exists, and a pack that brand actually carries. Product lists can
 * change under the UI when the language switches and the catalogue reloads.
 */
export function normalizeSelection(variants, brand, pack) {
  const brands = brandsOf(variants);
  const safeBrand = brands.includes(brand) ? brand : (brands.length ? brands[0] : '');
  const packs = packsOf(variants, safeBrand);
  const safePack = packs.includes(pack) ? pack : (packs.length ? packs[0] : '');
  return { brands, packs, brand: safeBrand, pack: safePack };
}
