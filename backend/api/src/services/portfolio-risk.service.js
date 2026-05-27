const generatePortfolioRiskAnalysis = async ({
  totalCustomers,
  highRiskCustomers,
  totalOutstanding,
  overdueOutstanding
}) => {
  let portfolioRisk = 'LOW';

  const highRiskRatio = (highRiskCustomers / totalCustomers) * 100;
  const overdueRatio = (overdueOutstanding / totalOutstanding) * 100;

  if (highRiskRatio > 20 || overdueRatio > 35) {
    portfolioRisk = 'MEDIUM';
  }

  if (highRiskRatio > 40 || overdueRatio > 60) {
    portfolioRisk = 'HIGH';
  }

  return {
    portfolioRisk,
    highRiskRatio: Math.round(highRiskRatio),
    overdueRatio: Math.round(overdueRatio),
    generatedAt: new Date()
  };
};

module.exports = {
  generatePortfolioRiskAnalysis
};
