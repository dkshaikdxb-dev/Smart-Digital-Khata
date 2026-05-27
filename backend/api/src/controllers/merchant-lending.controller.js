const merchantLendingService = require('../services/merchant-lending.service');

const getMerchantLoanEligibility = async (req, res) => {
  try {
    const result = await merchantLendingService.generateMerchantLoanEligibility(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate lending eligibility',
      error: error.message
    });
  }
};

module.exports = {
  getMerchantLoanEligibility
};
