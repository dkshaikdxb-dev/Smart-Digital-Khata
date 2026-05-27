const generateSmartNudge = async ({
  customerName,
  segment,
  outstanding
}) => {
  let message = `Hello ${customerName}, your outstanding due is ₹${outstanding}.`;

  if (segment === 'LOYAL') {
    message += ' Thank you for being a trusted customer.';
  }

  if (segment === 'WATCHLIST') {
    message += ' Kindly clear dues soon to continue uninterrupted services.';
  }

  if (segment === 'HIGH_RISK') {
    message += ' Immediate payment is requested to avoid account escalation.';
  }

  return {
    message,
    generatedAt: new Date()
  };
};

module.exports = {
  generateSmartNudge
};
