// The quick-browse category chips for the consumer PWA, in one place.
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
// Cooking Fats 84 — 1,088 of the 1,615 SKUs between them. Dairy and Snacks both
// had chips before and are gone: milk mostly does not come from a kirana shop in
// these towns, and nobody needs help finding biscuits.
//
// THIS FILE IS A MIRROR, NOT A DECISION. The native app ships the same six in
// mobile-app/src/consumer/lib/categories.js, and a shopper who moves between the
// app and this site has to get the same shelves. Only the LABEL KEY differs,
// because this dictionary namespaces consumer strings under `c.` — the app's
// `cat.attaRice` is `c.catAttaRice` here. tests/consumer-shelves.test.js reads
// the app's file and the backend's allowlist off disk and fails if the three
// ever drift apart.
//
// `term` is NOT the label and is never shown: it is the old keyword, kept as the
// DEGRADATION PATH for a server that predates the shelf filter and answers 400
// to `category=` — see lib/consumerSearch.js, which retries with it rather than
// showing a shopper an error for a chip that used to work.
export const CATEGORIES = [
  { key: 'c.catAttaRice', category: 'atta-rice', term: 'rice', icon: '🍚' },
  { key: 'c.catDalPulses', category: 'dal-pulses', term: 'dal', icon: '🍲' },
  { key: 'c.catSpices', category: 'spices', term: 'masala', icon: '🌶️' },
  { key: 'c.catCookingOils', category: 'cooking-oils', term: 'oil', icon: '🛢️' },
  { key: 'c.catHousehold', category: 'household', term: 'soap', icon: '🧼' },
  { key: 'c.catPersonalCare', category: 'personal-care', term: 'shampoo', icon: '🧴' },
];

// Look a chip up by its shelf key — used when the screen is opened on a shelf
// (a ?category= deep link from the directory's chips) and has to render that
// shelf's own label. An unknown key answers null, which is also how a deep link
// carrying a shelf this build does not know is refused without a request.
export function categoryByKey(key) {
  const wanted = String(key || '');
  return CATEGORIES.find((c) => c.category === wanted) || null;
}
