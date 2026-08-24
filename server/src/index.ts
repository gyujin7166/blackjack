import { createServer } from 'node:http';

import type { ClientToServerEvents, ServerToClientEvents } from '@blackjack/shared';
import { Server } from 'socket.io';

import { registerSocketHandlers } from './socket/registerSocketHandlers.js';

const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const httpServer = createServer();

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: clientOrigin,
  },
});

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`Socket.IO server listening on http://localhost:${port}`);
});
