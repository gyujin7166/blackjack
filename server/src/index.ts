import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

import type {
  ClientToServerEvents,
  MatchmakingMatchedPayload,
  ServerToClientEvents,
} from '@blackjack/shared';
import { Server } from 'socket.io';

import { createMatchmakingQueue } from './matchmaking/matchmakingQueue.js';

const port = Number(process.env.PORT ?? 3001);
const clientOrigin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

const httpServer = createServer();
const matchmakingQueue = createMatchmakingQueue();
const activeMatches = new Map<string, MatchmakingMatchedPayload>();

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: clientOrigin,
  },
});

io.on('connection', (socket) => {
  console.log(`connected: ${socket.id}`);

  socket.on('matchmaking:join', () => {
    const existingMatch = activeMatches.get(socket.id);

    if (existingMatch) {
      socket.emit('matchmaking:matched', existingMatch);
      return;
    }

    const opponentSocketId = matchmakingQueue.enqueue(socket.id);

    if (!opponentSocketId) {
      socket.emit('matchmaking:waiting');
      return;
    }

    const opponentSocket = io.sockets.sockets.get(opponentSocketId);

    if (!opponentSocket) {
      matchmakingQueue.enqueue(socket.id);
      socket.emit('matchmaking:waiting');
      return;
    }

    const roomId = `game:${randomUUID()}`;
    const playerOneMatch: MatchmakingMatchedPayload = {
      roomId,
      seat: 'player1',
    };
    const playerTwoMatch: MatchmakingMatchedPayload = {
      roomId,
      seat: 'player2',
    };

    opponentSocket.join(roomId);
    socket.join(roomId);

    activeMatches.set(opponentSocketId, playerOneMatch);
    activeMatches.set(socket.id, playerTwoMatch);

    opponentSocket.emit('matchmaking:matched', playerOneMatch);
    socket.emit('matchmaking:matched', playerTwoMatch);

    console.log(`matched: ${opponentSocketId} + ${socket.id} -> ${roomId}`);
  });

  socket.on('disconnect', (reason) => {
    matchmakingQueue.remove(socket.id);
    activeMatches.delete(socket.id);
    console.log(`disconnected: ${socket.id} (${reason})`);
  });
});

httpServer.listen(port, () => {
  console.log(`Socket.IO server listening on http://localhost:${port}`);
});
