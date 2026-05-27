const auditLogs = [];

const createAuditLog = async ({
  action,
  performedBy,
  entity,
  entityId,
  metadata
}) => {
  const log = {
    id: `AUD-${Date.now()}`,
    action,
    performedBy,
    entity,
    entityId,
    metadata,
    timestamp: new Date()
  };

  auditLogs.push(log);

  return log;
};

const getAuditLogs = async () => {
  return auditLogs;
};

module.exports = {
  createAuditLog,
  getAuditLogs
};
