const detectFraudRisk = async ({
  transactionVelocity,
  unusualPaymentActivity,
  multipleMissedPayments,
  geoMismatch
}) => {
  let fraudScore = 0;

  fraudScore += transactionVelocity * 5;
  fraudScore += unusualPaymentActivity ? 30 : 0;
  fraudScore += multipleMissedPayments ? 25 : 0;
  fraudScore += geoMismatch ? 20 : 0;

  if (fraudScore > 100) {
    fraudScore = 100;
  }

  let fraudLevel = 'LOW';

  if (fraudScore > 40) {
    fraudLevel = 'MEDIUM';
  }

  if (fraudScore > 70) {
    fraudLevel = 'HIGH';
  }

  return {
    fraudScore: Math.round(fraudScore),
    fraudLevel,
    generatedAt: new Date()
  };
};

module.exports = {
  detectFraudRisk
};
