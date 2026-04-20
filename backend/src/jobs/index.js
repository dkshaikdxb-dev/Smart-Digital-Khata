const { Queue, Worker, QueueEvents } = require('bullmq');
const { connection } = require('../config/redis');
const logger = require('../utils/logger');
const { query } = require('../config/db');
const notifier = require('../services/notification.service');

const QUEUES = {
  reminders: new Queue('reminders', { connection }),
  summaries: new Queue('summaries', { connection }),
};

function startWorkers() {
  new Worker(
    'reminders',
    async (job) => {
      const { shopId, customerId } = job.data;
      const r = await query('SELECT * FROM customers WHERE id=$1 AND shop_id=$2', [customerId, shopId]);
      if (r.rowCount) await notifier.sendReminder(shopId, r.rows[0]);
    },
    { connection }
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

  // Daily: schedule reminders for shops with active/smart mode
  scheduleRecurring().catch((e) => logger.error({ err: e.message }, 'scheduleRecurring failed'));
}

async function scheduleRecurring() {
  await QUEUES.reminders.add(
    'daily-reminders',
    {},
    {
      repeat: { pattern: '0 9 * * *', tz: process.env.TZ || 'Asia/Kolkata' }, // 9am IST
      jobId: 'daily-reminders',
    }
  );
  new QueueEvents('reminders', { connection });
}

module.exports = { startWorkers, QUEUES };
