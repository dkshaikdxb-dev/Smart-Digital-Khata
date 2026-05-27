const segmentationService = require('../services/customer-segmentation.service');

const getCustomerSegment = async (req, res) => {
  try {
    const result = await segmentationService.segmentCustomer(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate customer segment',
      error: error.message
    });
  }
};

module.exports = {
  getCustomerSegment
};
