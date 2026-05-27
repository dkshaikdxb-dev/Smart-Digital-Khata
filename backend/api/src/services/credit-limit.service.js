const generateCreditLimitRecommendation = async ({
  recoveryRate,
  overdueDays,
  purchaseFrequency,
  currentOutstanding
}) => {
  let recommendedLimit = 5000;

  recommendedLimit += recoveryRate * 100;
  recommendedLimit += purchaseFrequency * 500;
  recommendedLimit -= overdueDays * 50;
  recommendedLimit -= currentOutstanding * 0.1;

  if (recommendedLimit < 1000) {
    recommendedLimit = 1000;
  }

  return {
    recommendedLimit: Math.round(recommendedLimit),
    generatedAt: new Date()
  };
};

module.exports = {
  generateCreditLimitRecommendation
};
