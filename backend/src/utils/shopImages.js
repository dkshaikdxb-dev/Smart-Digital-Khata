// The ONE cap on storefront photos per shop.
//
// It used to be written down twice — once in shop.controller (the upload cap
// that 409s a 4th photo) and once in discovery.controller (the defensive LIMIT
// on the public read, whose comment said it "mirrors" the other). Two copies of
// a number that must agree is one copy too many, and the demo seeder now needs
// the same number a third time. So it lives here and every reader imports it.
//
// It is an APP-level cap, not a schema constraint: shop_images (migration 0062)
// deliberately has no CHECK on the row count, so an admin/operator can still fix
// a shop by hand without fighting the database.
const MAX_SHOP_IMAGES = 3;

module.exports = { MAX_SHOP_IMAGES };
