const { Server } = require('socket.io');

const initializeSocketServer = server => {
  const io = new Server(server, {
    cors: {
      origin: '*'
    }
  });

  io.on('connection', socket => {
    console.log('Client connected', socket.id);

    socket.emit('status', {
      message: 'Realtime connection established'
    });
  });

  return io;
};

module.exports = initializeSocketServer;
