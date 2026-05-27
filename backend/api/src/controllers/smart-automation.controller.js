const smartAutomationService = require('../services/smart-automation.service');

const getAutomationWorkflow = async (req, res) => {
  try {
    const result = await smartAutomationService.generateAutomationWorkflow(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate automation workflows',
      error: error.message
    });
  }
};

module.exports = {
  getAutomationWorkflow
};
