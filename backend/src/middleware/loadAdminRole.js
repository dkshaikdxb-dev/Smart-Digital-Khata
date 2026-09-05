const { query } = require('../config/db');

// Resolve the caller's admin sub-role once per request and cache it on
// req.adminRole, so requirePerm() and the admin controllers can check
// permissions without each issuing their own lookup. MUST run after
// auth(['admin']). A token minted before this feature carries no adminRole
// claim; the DB value (migrated to 'super' for existing admins) is authoritative.
async function loadAdminRole(req, _res, next) {
  if (req.adminRole !== undefined) return next();
  if (!req.user || !req.user.sub) { req.adminRole = null; return next(); }
  try {
    const r = await query('SELECT admin_role FROM users WHERE id = $1', [req.user.sub]);
    req.adminRole = r.rowCount ? r.rows[0].admin_role : null;
  } catch (_err) {
    // This blanket middleware also runs for requests whose path belongs to a
    // sibling router mounted deeper under /admin (e.g. /admin/i18n,
    // /admin/languages) which re-authenticate on their own and never read
    // req.adminRole. A lookup failure there (e.g. a non-UUID sub in a token
    // that never reaches this router's own permission-gated routes) must not
    // become a 500. Resolve to no role — fail-closed, so any genuinely
    // permission-gated route then returns 403 rather than leaking access.
    req.adminRole = null;
  }
  return next();
}

module.exports = loadAdminRole;
