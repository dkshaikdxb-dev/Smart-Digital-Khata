const generateMerchantCopilotAdvice = async ({
  cashflowStatus,
  portfolioRisk,
  recoveryRate,
  fraudLevel
}) => {
  const recommendations = [];

  if (cashflowStatus !== 'HEALTHY') {
    recommendations.push('Improve collection efficiency to stabilize cashflow');
  }

  if (portfolioRisk === 'HIGH') {
    recommendations.push('Reduce exposure to high-risk customers');
  }

  if (recoveryRate < 60) {
    recommendations.push('Increase reminder frequency and escalation tracking');
  }

  if (fraudLevel === 'HIGH') {
    recommendations.push('Review suspicious transactions immediately');
  }

  if (recommendations.length === 0) {
    recommendations.push('Business performance is healthy and stable');
  }

  return {
    recommendations,
    generatedAt: new Date()
  };
};

module.exports = {
  generateMerchantCopilotAdvice
};
