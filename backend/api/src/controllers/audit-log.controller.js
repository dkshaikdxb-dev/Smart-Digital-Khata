const auditLogService = require('../services/audit-log.service');

const getAuditLogs = async (req, res) => {
  try {
    const logs = await auditLogService.getAuditLogs();

    return res.status(200).json({
      logs
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch audit logs',
      error: error.message
    });
  }
};

module.exports = {
  getAuditLogs
};
