const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

function auth(requiredRoles = []) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized('Missing token'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;
      if (roles.length && !roles.includes(payload.role)) {
        return next(ApiError.forbidden('Role not allowed'));
      }
      return next();
    } catch (_e) {
      return next(ApiError.unauthorized('Invalid or expired token'));
    }
  };
}

module.exports = auth;
