const whatsappService = require('../services/whatsapp.service');

const sendReminder = async (req, res) => {
  try {
    const result = await whatsappService.sendCollectionReminder(req.body);

    return res.status(200).json({
      message: 'WhatsApp reminder sent',
      result
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to send WhatsApp reminder',
      error: error.message
    });
  }
};

module.exports = {
  sendReminder
};
