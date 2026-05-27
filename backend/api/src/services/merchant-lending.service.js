const generateMerchantLoanEligibility = async ({
  merchantHealthScore,
  recoveryRate,
  monthlyCollections,
  portfolioRisk
}) => {
  let eligible = false;
  let approvedAmount = 0;
  let lendingTier = 'REJECTED';

  if (
    merchantHealthScore >= 60 &&
    recoveryRate >= 65 &&
    portfolioRisk !== 'HIGH'
  ) {
    eligible = true;
    approvedAmount = monthlyCollections * 2;
    lendingTier = 'STANDARD';
  }

  if (
    merchantHealthScore >= 80 &&
    recoveryRate >= 80 &&
    portfolioRisk === 'LOW'
  ) {
    approvedAmount = monthlyCollections * 4;
    lendingTier = 'PREMIUM';
  }

  return {
    eligible,
    approvedAmount: Math.round(approvedAmount),
    lendingTier,
    generatedAt: new Date()
  };
};

module.exports = {
  generateMerchantLoanEligibility
};
