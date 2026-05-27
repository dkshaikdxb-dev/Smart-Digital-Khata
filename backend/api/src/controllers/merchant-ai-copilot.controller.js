const merchantCopilotService = require('../services/merchant-ai-copilot.service');

const getMerchantCopilotAdvice = async (req, res) => {
  try {
    const result = await merchantCopilotService.generateMerchantCopilotAdvice(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate merchant copilot recommendations',
      error: error.message
    });
  }
};

module.exports = {
  getMerchantCopilotAdvice
};
