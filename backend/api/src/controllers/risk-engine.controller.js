const riskEngineService = require('../services/risk-engine.service');

const getRiskScore = async (req, res) => {
  try {
    const result = await riskEngineService.calculateRiskScore(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to calculate risk score',
      error: error.message
    });
  }
};

module.exports = {
  getRiskScore
};
