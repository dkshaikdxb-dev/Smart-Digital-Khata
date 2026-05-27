const complianceService = require('../services/compliance-monitor.service');

const getComplianceStatus = async (req, res) => {
  try {
    const result = await complianceService.generateComplianceStatus(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate compliance status',
      error: error.message
    });
  }
};

module.exports = {
  getComplianceStatus
};
