const generateMerchantHealthScore = async ({
  totalOutstanding,
  collectionEfficiency,
  activeCustomers,
  recoveryRate
}) => {
  let score = 100;

  score -= totalOutstanding / 5000;
  score += collectionEfficiency * 0.3;
  score += recoveryRate * 0.2;
  score += activeCustomers / 50;

  if (score > 100) {
    score = 100;
  }

  if (score < 0) {
    score = 0;
  }

  let status = 'EXCELLENT';

  if (score < 80) {
    status = 'GOOD';
  }

  if (score < 60) {
    status = 'WARNING';
  }

  if (score < 40) {
    status = 'CRITICAL';
  }

  return {
    score: Math.round(score),
    status,
    generatedAt: new Date()
  };
};

module.exports = {
  generateMerchantHealthScore
};
