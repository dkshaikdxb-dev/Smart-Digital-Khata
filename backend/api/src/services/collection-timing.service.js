const getBestCollectionWindow = async ({
  customerSegment,
  previousResponseRate,
  overdueDays
}) => {
  let recommendedTime = '10:00 AM';
  let recommendedChannel = 'WhatsApp';

  if (customerSegment === 'LOYAL') {
    recommendedTime = '06:00 PM';
  }

  if (customerSegment === 'HIGH_RISK') {
    recommendedTime = '09:00 AM';
    recommendedChannel = 'Phone Call';
  }

  if (previousResponseRate < 30) {
    recommendedChannel = 'Field Visit';
  }

  if (overdueDays > 90) {
    recommendedChannel = 'Escalation Team';
  }

  return {
    recommendedTime,
    recommendedChannel,
    generatedAt: new Date()
  };
};

module.exports = {
  getBestCollectionWindow
};
