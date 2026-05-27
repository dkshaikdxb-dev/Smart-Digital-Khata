const alerts = [];

const triggerRealtimeAlert = async ({ severity, message, entityId }) => {
  const alert = {
    id: `ALT-${Date.now()}`,
    severity,
    message,
    entityId,
    createdAt: new Date()
  };

  alerts.push(alert);

  return alert;
};

const getAlerts = async () => {
  return alerts;
};

module.exports = {
  triggerRealtimeAlert,
  getAlerts
};
