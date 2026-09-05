// Admin RBAC permission model (Phase C). Maps an admin sub-role (users.admin_role,
// only meaningful when users.role='admin') to the set of permission strings it
// grants. Every admin moderation route is gated by one of these permissions via
// middleware/requirePerm.js.
//
// Permissions (verbs on a resource):
//   shops:view        see shops / shop detail
//   shops:moderate    suspend / reinstate a shop
//   users:view        see login users (owners/staff/admins)
//   users:moderate    block / unblock an owner or staff login
//   admin:manage      set another user's admin_role (super only in practice)
//   customers:view    see consumer accounts
//   customers:moderate block / unblock a consumer account
//   audit:view        read the moderation audit log
//   revenue:view      see revenue / billing figures
//   settings:manage   change platform settings / a shop's plan (billing)

const ALL = Object.freeze([
  'shops:view',
  'shops:moderate',
  'users:view',
  'users:moderate',
  'admin:manage',
  'customers:view',
  'customers:moderate',
  'audit:view',
  'revenue:view',
  'settings:manage',
]);

// Role → permission list. Kept as plain arrays for readability; wrapped in Sets
// at lookup time. A role that is unknown/null grants nothing.
const ROLE_PERMS = Object.freeze({
  // Super admin can do everything (the role existing admins are migrated to).
  super: ALL,

  // Moderation: the trust-and-safety role — can view and moderate shops, login
  // users and consumers, and read the audit log. No billing/settings, no
  // admin-role management.
  moderation: [
    'shops:view',
    'shops:moderate',
    'users:view',
    'users:moderate',
    'customers:view',
    'customers:moderate',
    'audit:view',
  ],

  // Support: read-only across shops, users and consumers plus the audit log.
  // Can moderate nothing and manage nothing.
  support: [
    'shops:view',
    'users:view',
    'customers:view',
    'audit:view',
  ],

  // Finance: billing/plan and platform settings, revenue visibility, shop view
  // and the audit log. Cannot moderate shops/users/consumers.
  finance: [
    'shops:view',
    'revenue:view',
    'settings:manage',
    'audit:view',
  ],
});

// Cached Sets per role so repeated hasPermission() checks avoid rebuilding.
const ROLE_SETS = Object.freeze(
  Object.fromEntries(Object.entries(ROLE_PERMS).map(([role, perms]) => [role, new Set(perms)]))
);

// permissionsFor(adminRole) → sorted array of permission strings for the role.
// Unknown/null role → empty array.
function permissionsFor(adminRole) {
  const set = ROLE_SETS[adminRole];
  return set ? [...set].sort() : [];
}

// hasPermission(adminRole, perm) → boolean.
function hasPermission(adminRole, perm) {
  const set = ROLE_SETS[adminRole];
  return set ? set.has(perm) : false;
}

module.exports = {
  ALL_PERMISSIONS: ALL,
  ADMIN_ROLES: Object.freeze(['super', 'support', 'finance', 'moderation']),
  permissionsFor,
  hasPermission,
};
