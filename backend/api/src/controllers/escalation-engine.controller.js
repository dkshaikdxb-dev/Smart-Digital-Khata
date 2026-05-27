const escalationEngineService = require('../services/escalation-engine.service');

const getEscalationDecision = async (req, res) => {
  try {
    const result = await escalationEngineService.generateEscalationDecision(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate escalation decision',
      error: error.message
    });
  }
};

module.exports = {
  getEscalationDecision
};
