require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET,
  databaseUrl: process.env.DATABASE_URL,
  redisUrl: process.env.REDIS_URL,
  razorpayKey: process.env.RAZORPAY_KEY,
  razorpaySecret: process.env.RAZORPAY_SECRET
};
