const authService = require('../services/auth.service');

const register = async (req, res, next) => {
  try {
    const user = await authService.registerUser(req.body);

    return res.status(201).json({
      success: true,
      user
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register
};
