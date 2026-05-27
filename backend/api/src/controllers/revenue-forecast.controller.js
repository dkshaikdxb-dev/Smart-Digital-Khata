const revenueForecastService = require('../services/revenue-forecast.service');

const getRevenueForecast = async (req, res) => {
  try {
    const result = await revenueForecastService.generateRevenueForecast(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate revenue forecast',
      error: error.message
    });
  }
};

module.exports = {
  getRevenueForecast
};
