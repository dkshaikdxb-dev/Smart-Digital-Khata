const merchantHealthService = require('../services/merchant-health.service');

const getMerchantHealth = async (req, res) => {
  try {
    const result = await merchantHealthService.generateMerchantHealthScore(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate merchant health score',
      error: error.message
    });
  }
};

module.exports = {
  getMerchantHealth
};
