// The quick-browse category chips, in one place.
//
// They mirror the web consumer PWA's CATEGORIES (admin-dashboard/src/pages/c/shops.js)
// one-for-one: same five categories, same icons, same English search terms. They
// used to be declared inside ShopsScreen alone, which is why the product-search
// screen — the one place a shopper who does not know what to type most needs
// something to tap — had nothing but an empty prompt under the box. Now both
// screens read the same list, so the two surfaces cannot drift apart.
//
// The LABEL is localized through the `cat.*` keys; the TERM stays the English
// base word, because the endpoint matches against a search blob built from
// English names and romanized aliases — sending a translated term would match
// less, not more.
export const CATEGORIES = [
  { key: 'cat.attaRice', term: 'rice', icon: '🍚' },
  { key: 'cat.dairy', term: 'milk', icon: '🧈' },
  { key: 'cat.snacks', term: 'biscuit', icon: '🍪' },
  { key: 'cat.household', term: 'soap', icon: '🧼' },
  { key: 'cat.personalCare', term: 'shampoo', icon: '🧴' },
];
