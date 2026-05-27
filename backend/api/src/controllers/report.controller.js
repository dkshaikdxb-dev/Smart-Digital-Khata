const reportService = require('../services/report.service');

const getOutstandingReport = async (req, res) => {
  try {
    const { shopId } = req.query;

    const report = await reportService.generateOutstandingReport(shopId);

    return res.status(200).json({
      report
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate report',
      error: error.message
    });
  }
};

module.exports = {
  getOutstandingReport
};
