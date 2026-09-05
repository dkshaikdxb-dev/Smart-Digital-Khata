require('dotenv').config();
const { validateEnv } = require('./config/env');
validateEnv();
const app = require('./app');
const logger = require('./utils/logger');
const { pool } = require('./config/db');
const settings = require('./config/settings');
const { startWorkers } = require('./jobs');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await pool.query('SELECT 1');
    logger.info('Postgres connection OK');

    await settings.load();

    // Make the demo-OTP affordance obvious in the logs whenever it is enabled,
    // so an operator can never leave it on unnoticed. Only the count is logged,
    // never the numbers or any code.
    const demoPhones = String(process.env.DEMO_OTP_PHONES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (demoPhones.length > 0) {
      logger.warn(
        { count: demoPhones.length },
        'DEMO_OTP_PHONES is set — OTP codes will be returned in the API response for these numbers (demo/testing affordance)'
      );
    }

    if (process.env.RUN_WORKERS !== 'false') {
      startWorkers();
      logger.info('Background workers started');
    }

    const server = app.listen(PORT, () => {
      logger.info(`Smart Digital Khata API listening on :${PORT}`);
    });

    const shutdown = (signal) => {
      logger.info(`${signal} received, shutting down...`);
      server.close(() => {
        pool.end().then(() => process.exit(0));
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

start();
