// The quick-browse SHELVES: the closed allowlist behind
// `GET /api/public/products/search?category=`.
//
// WHY THIS FILE EXISTS. The consumer apps' category chips used to be keywords:
// "Dairy" ran a plain text search for `milk`, "Household" for `soap`. Measured
// against the shipped base catalogue (src/data/catalog-seed.json, 1,615 SKUs)
// those chips were simply lying to the shopper — `milk` reached 14 of the 44
// real Dairy SKUs, `shampoo` 12 of the 170 Personal Care ones, `soap` 20. A chip
// that shows a seventh of a shelf and calls it the shelf is worse than no chip,
// because the shopper concludes the shop does not stock the thing.
//
// catalog_items already carries the real `category` and `subcategory` the
// catalogue was authored with, and products link to it through
// products.catalog_item_id. A shelf is therefore a NAMED SET OF REAL CATALOGUE
// VALUES, listed here and nowhere else, and the endpoint accepts only these
// keys — never free text, so no query a client sends can widen a shelf into an
// arbitrary catalogue scan.
//
// A shelf may be defined by top-level `categories`, by `subcategories`, or by
// both; the two are OR-ed. Defining by the top-level category (Household,
// Personal Care) means a subcategory added to the catalogue later is on the
// shelf the day it lands, which is right for a department. Defining by
// subcategory (Spices, Dal & Pulses, …) keeps a food shelf from swallowing the
// whole Food department, which is 1,044 of the 1,615 SKUs.
//
// The SKU counts in the comments below are from the shipped seed and are there
// to be re-measured, not trusted: they are the evidence for which six shelves
// these are. A shop's own range is whatever that shopkeeper stocks.

const SHELVES = [
  // Wheat & Flour 76 + Rice 59 + Grains 44 + Millets 26 = 205 SKUs.
  // One shelf, not four, because "anaj" is one thing to the shopper buying it:
  // the sack of atta and the sack of rice are the same monthly errand, and the
  // millets (bajra, jowar, ragi) belong beside them rather than in a shelf of
  // their own that only a few households would ever open.
  { key: 'atta-rice', subcategories: ['Wheat & Flour', 'Rice', 'Grains', 'Millets'] },

  // Dal & Pulses 110 SKUs. The protein of the basket; bought by the kilo every
  // month in every household this app is for.
  { key: 'dal-pulses', subcategories: ['Dal & Pulses'] },

  // Spices 225 SKUs — the largest shelf in the catalogue by some way, and the
  // hardest one to type: haldi, dhaniya, jeera, garam masala, and a hundred
  // brand-and-pack combinations of each.
  { key: 'spices', subcategories: ['Spices'] },

  // Cooking Oils 63 + Cooking Fats 21 = 84 SKUs. Ghee and vanaspati sit with
  // the oil because a shopper deciding what to cook in compares them.
  { key: 'cooking-oils', subcategories: ['Cooking Oils', 'Cooking Fats'] },

  // The whole Household department: Kitchen Consumables 73, Cleaning 58,
  // Cleaning Tools 52, Laundry 40, Dishwashing 34, Pest Control 33,
  // Paper Products 4 = 294 SKUs. Detergent, dishwash, jhaadu, matchboxes and
  // mosquito coils are one aisle in a kirana shop and one chip here.
  { key: 'household', categories: ['Household'] },

  // The whole Personal Care department: Oral Care 34, Hand Hygiene 28,
  // Hair Care 27, Skin Care 22, Bath & Body 20, Shaving 18, Deodorant 12,
  // Feminine Hygiene 9 = 170 SKUs. Soap and toothpaste are a monthly buy.
  { key: 'personal-care', categories: ['Personal Care'] },
];

// Lookup by key, and the flat list Joi validates against. Frozen so a caller
// cannot mutate the allowlist out from under the validator.
const SHELF_BY_KEY = new Map(SHELVES.map((s) => [s.key, s]));
const SHELF_KEYS = SHELVES.map((s) => s.key);

function isShelfKey(key) {
  return SHELF_BY_KEY.has(String(key || ''));
}

// The catalogue values a shelf covers: { categories: [], subcategories: [] }.
// An unknown key yields empty arrays rather than throwing — the Joi allowlist
// is the gate, and a second thrower behind it would only turn a 400 into a 500.
function shelfScope(key) {
  const shelf = SHELF_BY_KEY.get(String(key || ''));
  if (!shelf) return { categories: [], subcategories: [] };
  return {
    categories: shelf.categories ? shelf.categories.slice() : [],
    subcategories: shelf.subcategories ? shelf.subcategories.slice() : [],
  };
}

module.exports = { SHELVES, SHELF_KEYS, isShelfKey, shelfScope };
