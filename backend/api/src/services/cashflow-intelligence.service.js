const generateCashflowInsights = async ({
  incomingCollections,
  outgoingExpenses,
  pendingOutstanding
}) => {
  const netCashflow = incomingCollections - outgoingExpenses;

  let status = 'HEALTHY';

  if (netCashflow < 0) {
    status = 'NEGATIVE';
  }

  if (pendingOutstanding > incomingCollections * 2) {
    status = 'AT_RISK';
  }

  return {
    netCashflow,
    status,
    generatedAt: new Date()
  };
};

module.exports = {
  generateCashflowInsights
};
