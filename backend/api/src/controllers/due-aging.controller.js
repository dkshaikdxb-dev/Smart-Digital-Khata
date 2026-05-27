const dueAgingService = require('../services/due-aging.service');

const getDueAgingReport = async (req, res) => {
  try {
    const { shopId } = req.query;

    const report = await dueAgingService.generateDueAgingReport(shopId);

    return res.status(200).json(report);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate due aging report',
      error: error.message
    });
  }
};

module.exports = {
  getDueAgingReport
};
