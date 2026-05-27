const staffRoles = require('../models/staff-role.model');

const authorize = (requiredPermission) => {
  return (req, res, next) => {
    const role = req.user.role || 'VIEWER';

    const permissions = staffRoles[role]?.permissions || [];

    if (!permissions.includes(requiredPermission)) {
      return res.status(403).json({
        message: 'Access denied'
      });
    }

    next();
  };
};

module.exports = authorize;
