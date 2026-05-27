const segmentCustomer = async ({
  outstanding,
  overdueDays,
  paymentFrequency
}) => {
  let segment = 'REGULAR';

  if (outstanding > 100000 || overdueDays > 90) {
    segment = 'HIGH_RISK';
  } else if (paymentFrequency >= 5 && overdueDays < 15) {
    segment = 'LOYAL';
  } else if (outstanding > 30000) {
    segment = 'WATCHLIST';
  }

  return {
    segment,
    generatedAt: new Date()
  };
};

module.exports = {
  segmentCustomer
};
