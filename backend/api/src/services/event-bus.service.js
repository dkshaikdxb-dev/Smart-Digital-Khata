const events = [];

const publishEvent = async ({ type, payload }) => {
  const event = {
    id: `EVT-${Date.now()}`,
    type,
    payload,
    createdAt: new Date()
  };

  events.push(event);

  return event;
};

const getEvents = async () => {
  return events;
};

module.exports = {
  publishEvent,
  getEvents
};
