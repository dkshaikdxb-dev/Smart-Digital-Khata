const generateRevenueForecast = async ({
  monthlyCollections,
  recoveryRate,
  customerGrowthRate
}) => {
  const projectedGrowthFactor =
    1 + customerGrowthRate / 100 + recoveryRate / 200;

  const nextMonthProjection = monthlyCollections * projectedGrowthFactor;
  const quarterProjection = nextMonthProjection * 3;

  return {
    nextMonthProjection: Math.round(nextMonthProjection),
    quarterProjection: Math.round(quarterProjection),
    generatedAt: new Date()
  };
};

module.exports = {
  generateRevenueForecast
};
