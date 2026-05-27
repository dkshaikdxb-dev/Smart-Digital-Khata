const benchmarkService = require('../services/merchant-benchmark.service');

const getBenchmarkInsights = async (req, res) => {
  try {
    const result = await benchmarkService.generateBenchmarkInsights(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate benchmark insights',
      error: error.message
    });
  }
};

module.exports = {
  getBenchmarkInsights
};
