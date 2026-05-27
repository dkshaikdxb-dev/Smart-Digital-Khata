const aiInsightsService = require('../services/ai-insights.service');

const getInsights = async (req, res) => {
  try {
    const insights = await aiInsightsService.generateMerchantInsights(req.body);

    return res.status(200).json({
      insights
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate AI insights',
      error: error.message
    });
  }
};

module.exports = {
  getInsights
};
