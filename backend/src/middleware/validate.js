const ApiError = require('../utils/ApiError');

module.exports = (schema, property = 'body') => (req, _res, next) => {
  const { error, value } = schema.validate(req[property], { abortEarly: false, stripUnknown: true });
  if (error) {
    return next(ApiError.badRequest('Validation failed', error.details.map((d) => d.message)));
  }
  req[property] = value;
  return next();
};
