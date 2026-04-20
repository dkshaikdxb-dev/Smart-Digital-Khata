const axios = require('axios');
const logger = require('../utils/logger');

const BASE = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const TOKEN = process.env.WHATSAPP_API_TOKEN;

function isConfigured() {
  return Boolean(PHONE_ID && TOKEN);
}

async function sendText(to, body) {
  if (!isConfigured()) {
    logger.warn({ to }, 'WhatsApp not configured — skipping send');
    return { skipped: true };
  }
  const url = `${BASE}/${PHONE_ID}/messages`;
  const normalized = to.startsWith('+') ? to.slice(1) : to;
  try {
    const res = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalized,
        type: 'text',
        text: { body },
      },
      { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 10_000 }
    );
    return res.data;
  } catch (err) {
    logger.error({ err: err.response?.data || err.message, to }, 'WhatsApp send failed');
    throw err;
  }
}

async function sendTemplate(to, name, languageCode = 'en', components = []) {
  if (!isConfigured()) return { skipped: true };
  const url = `${BASE}/${PHONE_ID}/messages`;
  const normalized = to.startsWith('+') ? to.slice(1) : to;
  const res = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: normalized,
      type: 'template',
      template: { name, language: { code: languageCode }, components },
    },
    { headers: { Authorization: `Bearer ${TOKEN}` }, timeout: 10_000 }
  );
  return res.data;
}

module.exports = { sendText, sendTemplate, isConfigured };
