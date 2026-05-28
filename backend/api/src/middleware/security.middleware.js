const helmet = require('helmet');
const cors = require('cors');

const securityMiddleware = [
  helmet(),
  cors({
    origin: '*',
    credentials: true
  })
];

module.exports = securityMiddleware;
