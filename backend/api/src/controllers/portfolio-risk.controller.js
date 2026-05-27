const portfolioRiskService = require('../services/portfolio-risk.service');

const getPortfolioRisk = async (req, res) => {
  try {
    const result = await portfolioRiskService.generatePortfolioRiskAnalysis(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate portfolio risk analysis',
      error: error.message
    });
  }
};

module.exports = {
  getPortfolioRisk
};
