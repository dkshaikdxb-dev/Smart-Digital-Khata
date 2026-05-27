const sendCollectionReminder = async ({ customerName, mobile, amount, paymentLink }) => {
  const payload = {
    to: mobile,
    template: 'collection_reminder',
    variables: {
      customerName,
      amount,
      paymentLink
    },
    sentAt: new Date()
  };

  console.log('WhatsApp message payload:', payload);

  return {
    success: true,
    payload
  };
};

module.exports = {
  sendCollectionReminder
};
