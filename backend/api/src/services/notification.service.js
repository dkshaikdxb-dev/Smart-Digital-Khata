const notificationLogs = [];

const sendWhatsAppReminder = async ({
  customerName,
  mobile,
  outstanding
}) => {
  const message = `Hello ${customerName}, your pending balance is ₹${outstanding}. Please clear dues.`;

  const log = {
    type: 'WHATSAPP',
    mobile,
    message,
    sentAt: new Date()
  };

  notificationLogs.push(log);

  console.log('WhatsApp reminder queued:', log);

  return {
    success: true,
    log
  };
};

const getNotificationLogs = () => {
  return notificationLogs;
};

module.exports = {
  sendWhatsAppReminder,
  getNotificationLogs
};
