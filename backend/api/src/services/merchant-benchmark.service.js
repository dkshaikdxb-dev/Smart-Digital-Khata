const generateBenchmarkInsights = async ({
  merchantRecoveryRate,
  merchantGrowthRate,
  industryAverageRecovery,
  industryAverageGrowth
}) => {
  const recoveryPerformance =
    merchantRecoveryRate - industryAverageRecovery;

  const growthPerformance =
    merchantGrowthRate - industryAverageGrowth;

  let ranking = 'AVERAGE';

  if (recoveryPerformance > 10 && growthPerformance > 10) {
    ranking = 'TOP_PERFORMER';
  }

  if (recoveryPerformance < -10 || growthPerformance < -10) {
    ranking = 'UNDERPERFORMING';
  }

  return {
    ranking,
    recoveryPerformance,
    growthPerformance,
    generatedAt: new Date()
  };
};

module.exports = {
  generateBenchmarkInsights
};
