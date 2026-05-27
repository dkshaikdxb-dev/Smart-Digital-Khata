const customerService = require('../services/customer.service');

const createCustomer = async (req, res) => {
  try {
    const customer = await customerService.createCustomer(req.body);

    return res.status(201).json({
      message: 'Customer created successfully',
      customer
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to create customer',
      error: error.message
    });
  }
};

const getCustomers = async (req, res) => {
  try {
    const { shopId } = req.query;

    const customers = await customerService.getCustomersByShop(shopId);

    return res.status(200).json({
      customers
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch customers',
      error: error.message
    });
  }
};

module.exports = {
  createCustomer,
  getCustomers
};
