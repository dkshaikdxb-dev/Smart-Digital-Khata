const { Queue, Worker, QueueEvents } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const { query } = require('../config/db');
const notifier = require('../services/notification.service');
const weekly = require('../services/weekly-summary.service');

const QUEUES = {
  reminders: new Queue('reminders', { connection }),
  summaries: new Queue('summaries', { connection }),
  weekly: new Queue('weekly', { connection }),
};

async function enqueueDailyReminders() {
  // For every "active" shop, send a reminder to each opted-in customer with dues.
  const shopRes = await query(
    `SELECT id FROM shops WHERE notification_mode = 'active'`
  );
  let queued = 0;
  for (const shop of shopRes.rows) {
    const custRes = await query(
      `SELECT id FROM customers
       WHERE shop_id = $1 AND balance > 0 AND status='active' AND notifications_enabled = true`,
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
      // Nightly tick fans out one digest job per shop; per-shop jobs send it.
      if (job.name === 'daily-digest') return enqueueOwnerDigests();
      const { shopId } = job.data;
      await notifier.sendOwnerDigest(shopId);
    },
    { connection, concurrency: 5 }
  );

  new Worker(
    'weekly',
    async (job) => {
      // The repeatable "weekly-summary" tick runs the whole per-shop iteration in
      // this worker. The iteration + composition live in the service so they are
      // unit-testable WITHOUT Redis (the queue is only the scheduler here).
      if (job.name === 'weekly-summary') return weekly.runWeeklySummaries();
    },
    { connection, concurrency: 1 }
  );

  scheduleRecurring().catch((e) => logger.error({ err: e.message }, 'scheduleRecurring failed'));
}

async function enqueueOwnerDigests() {
  const shops = await query(`SELECT id FROM shops WHERE daily_digest = true`);
  for (const s of shops.rows) {
    await QUEUES.summaries.add('send-digest', { shopId: s.id }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    });
  }
  logger.info({ shops: shops.rowCount }, 'Owner digests enqueued');
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
  await QUEUES.summaries.add(
    'daily-digest',
    {},
    {
      repeat: { pattern: '0 21 * * *', tz: process.env.TZ || 'Asia/Kolkata' }, // 9pm IST — closing time
      jobId: 'daily-digest',
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
  // Weekly WhatsApp summary to owners: Sunday 9am IST. One repeatable tick fans
  // out to runWeeklySummaries(), which itself guards opt-in (weekly_summary), the
  // >6-day last-sent window, and skips when WhatsApp isn't configured.
  await QUEUES.weekly.add(
    'weekly-summary',
    {},
    {
      repeat: { pattern: '0 9 * * 0', tz: process.env.TZ || 'Asia/Kolkata' }, // Sun 9am IST
      jobId: 'weekly-summary',
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
  // Touch QueueEvents so BullMQ wires up event streams
  new QueueEvents('reminders', { connection });
}

module.exports = { startWorkers, QUEUES };
