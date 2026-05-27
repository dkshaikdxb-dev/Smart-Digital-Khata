const notificationService = require('../services/notification.service');

const sendReminder = async (req, res) => {
  try {
    const result = await notificationService.sendWhatsAppReminder(req.body);

    return res.status(200).json({
      message: 'Reminder sent successfully',
      result
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to send reminder',
      error: error.message
    });
  }
};

const getLogs = async (req, res) => {
  try {
    const logs = notificationService.getNotificationLogs();

    return res.status(200).json({
      logs
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch logs',
      error: error.message
    });
  }
};

module.exports = {
  sendReminder,
  getLogs
};
