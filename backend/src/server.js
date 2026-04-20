require('dotenv').config();
const app = require('./app');
const logger = require('./utils/logger');
const { pool } = require('./config/db');
const { startWorkers } = require('./jobs');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await pool.query('SELECT 1');
    logger.info('Postgres connection OK');

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
