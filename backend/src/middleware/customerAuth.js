const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

// Gate for customer-facing endpoints: verify the Bearer JWT and require the
// 'customer' role. Customer tokens carry no shopId, so they can never satisfy
// the owner/staff/admin gate in middleware/auth.js.
module.exports = function customerAuth() {
  return (req, _res, next) => {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return next(ApiError.unauthorized('Missing token'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.role !== 'customer') {
        return next(ApiError.unauthorized('Invalid or expired token'));
      }
      req.customerUser = { id: payload.sub, phone: payload.phone };
      return next();
    } catch (_e) {
      return next(ApiError.unauthorized('Invalid or expired token'));
    }
  };
};
