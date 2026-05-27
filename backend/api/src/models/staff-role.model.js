const staffRoles = {
  ADMIN: {
    permissions: [
      'manage_customers',
      'manage_ledger',
      'view_reports',
      'manage_staff',
      'manage_subscriptions'
    ]
  },
  MANAGER: {
    permissions: [
      'manage_customers',
      'manage_ledger',
      'view_reports'
    ]
  },
  CASHIER: {
    permissions: [
      'manage_ledger'
    ]
  },
  VIEWER: {
    permissions: [
      'view_reports'
    ]
  }
};

module.exports = staffRoles;
