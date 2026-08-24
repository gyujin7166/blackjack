import { createServer } from 'node:http';
import { Server } from 'socket.io';

const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const httpServer = createServer();

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigin,
  },
});

io.on('connection', (socket) => {
  console.log(`connected: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(port, () => {
  console.log(`Socket.IO server listening on http://localhost:${port}`);
});
