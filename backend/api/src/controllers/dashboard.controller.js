const dashboardService = require('../services/dashboard.service');

const getDashboard = async (req, res) => {
  try {
    const { shopId } = req.query;

    const analytics = await dashboardService.getDashboardAnalytics(shopId);

    return res.status(200).json(analytics);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to load dashboard analytics',
      error: error.message
    });
  }
};

module.exports = {
  getDashboard
};
