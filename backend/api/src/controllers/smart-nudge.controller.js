const smartNudgeService = require('../services/smart-nudge.service');

const generateNudge = async (req, res) => {
  try {
    const result = await smartNudgeService.generateSmartNudge(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate smart nudge',
      error: error.message
    });
  }
};

module.exports = {
  generateNudge
};
