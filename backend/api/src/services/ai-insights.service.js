const generateMerchantInsights = async ({
  totalOutstanding,
  totalCustomers
}) => {
  const insights = [];

  if (totalOutstanding > 50000) {
    insights.push('Outstanding dues are high. Increase collection efforts.');
  }

  if (totalCustomers > 1000) {
    insights.push('You are eligible for enterprise merchant plans.');
  }

  if (totalOutstanding < 10000) {
    insights.push('Collections are healthy and stable.');
  }

  return insights;
};

module.exports = {
  generateMerchantInsights
};
