const defaulterForecastService = require('../services/defaulter-forecast.service');

const getDefaulterForecast = async (req, res) => {
  try {
    const result = await defaulterForecastService.forecastDefaulterRisk(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate defaulter forecast',
      error: error.message
    });
  }
};

module.exports = {
  getDefaulterForecast
};
