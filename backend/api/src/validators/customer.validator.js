const validateCustomerPayload = (req, res, next) => {
  const { name, shopId } = req.body;

  if (!name || !shopId) {
    return res.status(400).json({
      message: 'Name and shopId are required'
    });
  }

  next();
};

module.exports = {
  validateCustomerPayload
};
