const fraudDetectionService = require('../services/fraud-detection.service');

const getFraudRisk = async (req, res) => {
  try {
    const result = await fraudDetectionService.detectFraudRisk(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate fraud risk analysis',
      error: error.message
    });
  }
};

module.exports = {
  getFraudRisk
};
