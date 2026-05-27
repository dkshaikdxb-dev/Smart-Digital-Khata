const creditLimitService = require('../services/credit-limit.service');

const getCreditLimitRecommendation = async (req, res) => {
  try {
    const result = await creditLimitService.generateCreditLimitRecommendation(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate credit limit recommendation',
      error: error.message
    });
  }
};

module.exports = {
  getCreditLimitRecommendation
};
