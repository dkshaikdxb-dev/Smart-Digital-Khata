const { Queue, Worker, QueueEvents } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const { query } = require('../config/db');
const notifier = require('../services/notification.service');
const weekly = require('../services/weekly-summary.service');
const publisher = require('../services/content-publisher.service');
const strategist = require('../services/content-strategist.service');
const drafter = require('../services/content-drafter.service');
const moderation = require('../services/moderation.service');

const QUEUES = {
  reminders: new Queue('reminders', { connection }),
  summaries: new Queue('summaries', { connection }),
  weekly: new Queue('weekly', { connection }),
  content: new Queue('content', { connection }),
  moderation: new Queue('moderation', { connection }),
};

// AI moderation triage (batch AI-MOD). One job per uploaded photo / submitted
// owner promo, enqueued by the controllers AFTER their transaction commits (via
// moderation.service.enqueueShopImage / enqueueCampaign). `kind` is the job name:
// 'shop_image' or 'campaign'. The jobId dedups a double enqueue for one row.
async function enqueueModeration(kind, id) {
  await QUEUES.moderation.add(kind, { id }, {
    jobId: `${kind}:${id}`,
    attempts: 2,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: 1000,
  });
}

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

  new Worker(
    'content',
    async (job) => {
      // Two repeatable ticks drive the content engine. Both call the service
      // directly (no fan-out), and the services are Redis-free so they are
      // unit-tested by calling publishDue()/runStrategist() straight, not via
      // this queue. The tier gate is re-checked inside publishDue.
      if (job.name === 'content-publish') return publisher.publishDue();
      if (job.name === 'content-strategist') return strategist.runStrategist();
      // On-demand LLM draft: fill an item's body and move it idea/drafting ->
      // draft. On failure the item stays recoverable (still pre-'draft', body
      // unset) so a retry is safe; nothing is ever auto-approved or published.
      if (job.name === 'content.draft') return drafter.runDraft(job.data.id);
      return undefined;
    },
    { connection, concurrency: 1 }
  );

  new Worker(
    'moderation',
    async (job) => {
      // AI triage of one pending photo / owner promo. The processors are
      // Redis-free (unit-tested by calling them straight) and FAIL-OPEN: they
      // re-check the config gate + the row's state, never throw, and on any
      // failure leave the row pending for a human. Nothing is ever auto-rejected.
      if (job.name === 'shop_image') return moderation.moderateShopImage(job.data.id);
      if (job.name === 'campaign') return moderation.moderateCampaign(job.data.id);
      return undefined;
    },
    { connection, concurrency: 2 }
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
  // Content engine ticks. Publisher every 15 minutes → publishDue() sends any
  // due, gate-cleared scheduled items through the channel adapter. Strategist
  // weekly (Mon 8am IST) → runStrategist() seeds fresh briefs from live metrics.
  await QUEUES.content.add(
    'content-publish',
    {},
    {
      repeat: { pattern: '*/15 * * * *', tz: process.env.TZ || 'Asia/Kolkata' }, // every 15 min
      jobId: 'content-publish',
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );
  await QUEUES.content.add(
    'content-strategist',
    {},
    {
      repeat: { pattern: '0 8 * * 1', tz: process.env.TZ || 'Asia/Kolkata' }, // Mon 8am IST
      jobId: 'content-strategist',
      removeOnComplete: 100,
      removeOnFail: 100,
    }
  );

  // Touch QueueEvents so BullMQ wires up event streams
  new QueueEvents('reminders', { connection });
}

module.exports = { startWorkers, QUEUES, enqueueModeration };
