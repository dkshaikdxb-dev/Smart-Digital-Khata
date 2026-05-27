const predictRecoveryProbability = async ({
  outstanding,
  overdueDays,
  paymentFrequency
}) => {
  let probability = 100;

  probability -= outstanding / 1000;
  probability -= overdueDays * 0.5;
  probability += paymentFrequency * 5;

  if (probability < 0) {
    probability = 0;
  }

  if (probability > 100) {
    probability = 100;
  }

  let recommendation = 'Normal follow-up';

  if (probability < 30) {
    recommendation = 'High-risk account. Escalate collections.';
  } else if (probability < 60) {
    recommendation = 'Send frequent payment reminders.';
  }

  return {
    probability: Math.round(probability),
    recommendation
  };
};

module.exports = {
  predictRecoveryProbability
};
