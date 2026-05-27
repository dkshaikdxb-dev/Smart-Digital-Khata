const queue = [];

const addJob = async ({ type, payload }) => {
  const job = {
    id: `JOB-${Date.now()}`,
    type,
    payload,
    status: 'PENDING',
    createdAt: new Date()
  };

  queue.push(job);

  return job;
};

const getQueue = async () => {
  return queue;
};

module.exports = {
  addJob,
  getQueue
};
