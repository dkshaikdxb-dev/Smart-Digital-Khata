const requestCounts = {};

const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip;

  if (!requestCounts[ip]) {
    requestCounts[ip] = 1;
  } else {
    requestCounts[ip] += 1;
  }

  if (requestCounts[ip] > 100) {
    return res.status(429).json({
      message: 'Too many requests'
    });
  }

  next();
};

module.exports = rateLimitMiddleware;
