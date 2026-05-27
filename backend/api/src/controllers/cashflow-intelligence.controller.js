const cashflowService = require('../services/cashflow-intelligence.service');

const getCashflowInsights = async (req, res) => {
  try {
    const result = await cashflowService.generateCashflowInsights(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate cashflow intelligence',
      error: error.message
    });
  }
};

module.exports = {
  getCashflowInsights
};
