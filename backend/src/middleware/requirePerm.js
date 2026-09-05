const { query } = require('../config/db');
const ApiError = require('../utils/ApiError');
const { hasPermission } = require('../config/permissions');

// Permission gate for admin routes. MUST run AFTER auth(['admin']) — that gate
// already guarantees req.user.role === 'admin'; this one enforces the admin
// SUB-role's permission set.
//
// The caller's admin_role is read fresh from the DB (not trusted from the JWT)
// so a role change or a role missing from an older token is always honoured, and
// so a token minted before this feature (no admin_role claim) still resolves to
// the migrated 'super'. The resolved role is cached on req.adminRole for the
// handler. A non-admin never reaches here (auth returns 403 first).
function requirePerm(perm) {
  return async (req, _res, next) => {
    try {
      if (!req.user || req.user.role !== 'admin') {
        return next(ApiError.forbidden('Role not allowed'));
      }
      let adminRole = req.adminRole;
      if (adminRole === undefined) {
        const r = await query('SELECT admin_role FROM users WHERE id = $1', [req.user.sub]);
        adminRole = r.rowCount ? r.rows[0].admin_role : null;
        req.adminRole = adminRole;
      }
      if (!hasPermission(adminRole, perm)) {
        return next(ApiError.forbidden('You do not have permission to perform this action'));
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = requirePerm;
