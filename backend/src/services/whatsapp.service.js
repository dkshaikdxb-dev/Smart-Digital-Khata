const axios = require('axios');
const logger = require('../utils/logger');
const settings = require('../config/settings');
const { toWaFormat } = require('../utils/phone');

function cfg() {
  return {
    base: settings.get('WHATSAPP_API_URL') || 'https://graph.facebook.com/v18.0',
    phoneId: settings.get('WHATSAPP_PHONE_NUMBER_ID'),
    token: settings.get('WHATSAPP_API_TOKEN'),
  };
}

function isConfigured() {
  const { phoneId, token } = cfg();
  return Boolean(phoneId && token);
}

async function sendText(to, body) {
  const { base, phoneId, token } = cfg();
  if (!phoneId || !token) {
    logger.warn({ to }, 'WhatsApp not configured — skipping send');
    return { skipped: true };
  }
  const url = `${base}/${phoneId}/messages`;
  const normalized = toWaFormat(to);
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
      { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
    );
    return res.data;
  } catch (err) {
    logger.error({ err: err.response?.data || err.message, to }, 'WhatsApp send failed');
    throw err;
  }
}

async function sendTemplate(to, name, languageCode = 'en', components = []) {
  const { base, phoneId, token } = cfg();
  if (!phoneId || !token) return { skipped: true };
  const url = `${base}/${phoneId}/messages`;
  const normalized = toWaFormat(to);
  const res = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: normalized,
      type: 'template',
      template: { name, language: { code: languageCode }, components },
    },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10_000 }
  );
  return res.data;
}

module.exports = { sendText, sendTemplate, isConfigured };
