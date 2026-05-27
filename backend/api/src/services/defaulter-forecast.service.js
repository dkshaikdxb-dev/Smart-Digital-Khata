const forecastDefaulterRisk = async ({
  overdueDays,
  outstanding,
  missedPayments
}) => {
  let risk = 0;

  risk += overdueDays * 0.5;
  risk += outstanding / 1000;
  risk += missedPayments * 10;

  if (risk > 100) {
    risk = 100;
  }

  let classification = 'STABLE';

  if (risk > 40) {
    classification = 'WATCHLIST';
  }

  if (risk > 70) {
    classification = 'HIGH_RISK';
  }

  return {
    risk: Math.round(risk),
    classification,
    generatedAt: new Date()
  };
};

module.exports = {
  forecastDefaulterRisk
};
