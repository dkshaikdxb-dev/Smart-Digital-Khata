// The quick-browse category chips, in one place.
//
// THEY USED TO LIE. Each chip carried a KEYWORD and ran a plain text search:
// "Dairy" searched `milk`, "Personal Care" searched `shampoo`, "Household"
// searched `soap`. Measured against the shipped base catalogue
// (backend/src/data/catalog-seed.json, 1,615 SKUs) that is what those chips
// actually reached:
//
//     Dairy         q=milk      ->  14 of  44 real Dairy SKUs
//     Personal Care q=shampoo   ->  12 of 170
//     Snacks        q=biscuit   ->  18 of  51
//     Household     q=soap      ->  20 of 294
//     Atta & Rice   q=rice      ->  74 of 205
//
// A shopper who taps "Household" and is shown a seventh of the aisle does not
// conclude the chip is bad. They conclude the shop has nothing, and they stop
// looking. So a chip now names a SHELF — a key from the closed allowlist the
// server owns (backend/src/utils/catalog-shelves.js), resolved there against
// the catalogue's own `category` / `subcategory` columns — and the search runs
// `GET /api/public/products/search?category=<shelf>` with no keyword at all.
//
// WHICH SIX, AND WHY. Shelf size crossed with what a low-income rural household
// actually buys every month. In SKUs: Spices 225, Dal & Pulses 110, the grain
// shelves together 205, Household 294, Personal Care 170, Cooking Oils with
// Cooking Fats 84. Those six reach 1,088 of the 1,615 SKUs. Dropped, with
// reasons, in the task report: Dairy and Snacks (both had chips before — milk
// mostly does not come from a kirana shop in these towns, and nobody needs help
// finding biscuits), Sauces & Condiments, Pickles, Breakfast, Fresh Food, and —
// the closest call — Tea & Coffee, which is universal but is 36 SKUs and is
// asked for by brand, which the mic answers faster than a chip would.
//
// The LABEL is localized through the `cat.*` keys. `term` is NOT the label and
// is not shown: it is the old keyword, kept as the DEGRADATION PATH for a
// backend that predates the shelf filter and answers 400 to `category=` — see
// consumerApi.searchProducts, which retries with it rather than showing a
// shopper an error for a chip that used to work.
export const CATEGORIES = [
  { key: 'cat.attaRice', category: 'atta-rice', term: 'rice', icon: '🍚' },
  { key: 'cat.dalPulses', category: 'dal-pulses', term: 'dal', icon: '🍲' },
  { key: 'cat.spices', category: 'spices', term: 'masala', icon: '🌶️' },
  { key: 'cat.cookingOils', category: 'cooking-oils', term: 'oil', icon: '🛢️' },
  { key: 'cat.household', category: 'household', term: 'soap', icon: '🧼' },
  { key: 'cat.personalCare', category: 'personal-care', term: 'shampoo', icon: '🧴' },
];

// Look a chip up by its shelf key — used when the screen is opened on a shelf
// (from the directory's chips) and has to render that shelf's own label.
export function categoryByKey(key) {
  const wanted = String(key || '');
  return CATEGORIES.find((c) => c.category === wanted) || null;
}
