const collectionTimingService = require('../services/collection-timing.service');

const getCollectionWindow = async (req, res) => {
  try {
    const result = await collectionTimingService.getBestCollectionWindow(req.body);

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to generate collection timing recommendation',
      error: error.message
    });
  }
};

module.exports = {
  getCollectionWindow
};
