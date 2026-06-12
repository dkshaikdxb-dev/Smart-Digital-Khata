const { Queue, Worker, QueueEvents } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const { query } = require('../config/db');
const notifier = require('../services/notification.service');

const QUEUES = {
  reminders: new Queue('reminders', { connection }),
  summaries: new Queue('summaries', { connection }),
};

async function enqueueDailyReminders() {
  // For every "active" shop, send a reminder to each customer with a positive balance.
  const shopRes = await query(
    `SELECT id FROM shops WHERE notification_mode = 'active'`
  );
  let queued = 0;
  for (const shop of shopRes.rows) {
    const custRes = await query(
      `SELECT id FROM customers WHERE shop_id = $1 AND balance > 0 AND status='active'`,
      [shop.id]
    );
    for (const c of custRes.rows) {
      await QUEUES.reminders.add('send', { shopId: shop.id, customerId: c.id }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      });
      queued += 1;
    }
  }
  logger.info({ queued }, 'Daily reminders enqueued');
}

function startWorkers() {
  new Worker(
    'reminders',
    async (job) => {
      // The repeatable "daily-reminders" tick runs in this same worker.
      if (job.name === 'daily-reminders') return enqueueDailyReminders();

      const { shopId, customerId } = job.data;
      const r = await query('SELECT * FROM customers WHERE id=$1 AND shop_id=$2', [customerId, shopId]);
      if (r.rowCount) await notifier.sendReminder(shopId, r.rows[0]);
    },
    { connection, concurrency: 5 }
  );

  new Worker(
    'summaries',
    async (job) => {
      const { shopId } = job.data;
      logger.info({ shopId }, 'Computing daily summary');
      // TODO: persist summary + notify shop owner
    },
    { connection }
  );

  scheduleRecurring().catch((e) => logger.error({ err: e.message }, 'scheduleRecurring failed'));
}

async function scheduleRecurring() {
  await QUEUES.reminders.add(
    'daily-reminders',
    {},
    {
      repeat: { pattern: '0 9 * * *', tz: process.env.TZ || 'Asia/Kolkata' }, // 9am IST
      jobId: 'daily-reminders',
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
  // Touch QueueEvents so BullMQ wires up event streams
  new QueueEvents('reminders', { connection });
}

module.exports = { startWorkers, QUEUES };
