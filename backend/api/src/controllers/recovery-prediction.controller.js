const recoveryPredictionService = require('../services/recovery-prediction.service');

const getRecoveryPrediction = async (req, res) => {
  try {
    const result = await recoveryPredictionService.predictRecoveryProbability(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate recovery prediction',
      error: error.message
    });
  }
};

module.exports = {
  getRecoveryPrediction
};
