const calculateRiskScore = async ({
  outstanding,
  overdueDays,
  paymentFrequency
}) => {
  let score = 0;

  if (outstanding > 50000) {
    score += 40;
  }

  if (overdueDays > 60) {
    score += 40;
  }

  if (paymentFrequency < 2) {
    score += 20;
  }

  let category = 'LOW';

  if (score >= 70) {
    category = 'HIGH';
  } else if (score >= 40) {
    category = 'MEDIUM';
  }

  return {
    score,
    category
  };
};

module.exports = {
  calculateRiskScore
};
