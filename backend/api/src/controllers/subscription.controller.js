const subscriptionPlans = require('../models/subscription-plan.model');

const getPlans = async (req, res) => {
  return res.status(200).json({
    plans: subscriptionPlans
  });
};

module.exports = {
  getPlans
};
