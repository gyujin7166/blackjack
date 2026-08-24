import { randomUUID } from 'node:crypto';

import type {
  ClientToServerEvents,
  GameAction,
  GameActionRejectionReason,
  MatchmakingMatchedPayload,
  PlayerSeat,
  ServerToClientEvents,
} from '@blackjack/shared';
import type { Server } from 'socket.io';

import {
  createGameSession,
  createPublicGameState,
  type GameSession,
  type GameSessionOptions,
} from '../game/index.js';
import { createMatchmakingQueue } from '../matchmaking/matchmakingQueue.js';

type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;

export interface SocketHandlerOptions {
  createSession?: (
    options?: Pick<GameSessionOptions, 'firstPlayer'>,
  ) => GameSession;
  logger?: Pick<Console, 'log'>;
}

export interface SocketServerState {
  activeMatches: Map<string, MatchmakingMatchedPayload>;
  gameSessions: Map<string, GameSession>;
  rematchAcceptances: Map<string, Set<PlayerSeat>>;
}

export function registerSocketHandlers(
  io: GameServer,
  options: SocketHandlerOptions = {},
): SocketServerState {
  const matchmakingQueue = createMatchmakingQueue();
  const activeMatches = new Map<string, MatchmakingMatchedPayload>();
  const gameSessions = new Map<string, GameSession>();
  const rematchAcceptances = new Map<string, Set<PlayerSeat>>();
  const sessionFactory = options.createSession ?? createGameSession;
  const logger = options.logger ?? console;

  io.on('connection', (socket) => {
    logger.log(`connected: ${socket.id}`);

    const rejectAction = (action: GameAction, reason: GameActionRejectionReason) => {
      socket.emit('game:action-rejected', { action, reason });
    };

    const handlePlayerAction = (action: GameAction) => {
      const match = activeMatches.get(socket.id);
      if (!match) {
        rejectAction(action, 'not_in_game');
        return;
      }

      const session = gameSessions.get(match.roomId);
      if (!session) {
        rejectAction(action, 'game_unavailable');
        return;
      }
      if (session.phase === 'finished') {
        rejectAction(action, 'game_finished');
        return;
      }
      if (match.seat !== session.phase) {
        rejectAction(action, 'not_your_turn');
        return;
      }

      if (action === 'hit') {
        session.hit();
      } else {
        session.stand();
      }
      io.to(match.roomId).emit(
        'game:state',
        createPublicGameState(match.roomId, session),
      );
    };

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
      const session = sessionFactory();
      gameSessions.set(roomId, session);

      opponentSocket.emit('matchmaking:matched', playerOneMatch);
      socket.emit('matchmaking:matched', playerTwoMatch);
      io.to(roomId).emit('game:state', createPublicGameState(roomId, session));

      logger.log(`matched: ${opponentSocketId} + ${socket.id} -> ${roomId}`);
    });

    socket.on('player:hit', () => handlePlayerAction('hit'));
    socket.on('player:stand', () => handlePlayerAction('stand'));
    socket.on('rematch:accept', () => {
      const match = activeMatches.get(socket.id);
      if (!match) return;

      const session = gameSessions.get(match.roomId);
      if (!session || session.phase !== 'finished') return;

      const acceptances = rematchAcceptances.get(match.roomId) ?? new Set<PlayerSeat>();
      acceptances.add(match.seat);
      rematchAcceptances.set(match.roomId, acceptances);
      io.to(match.roomId).emit('rematch:state', {
        roomId: match.roomId,
        player1Accepted: acceptances.has('player1'),
        player2Accepted: acceptances.has('player2'),
      });

      if (acceptances.size === 2) {
        const nextFirstPlayer =
          session.firstPlayer === 'player1' ? 'player2' : 'player1';
        const nextSession = sessionFactory({ firstPlayer: nextFirstPlayer });
        gameSessions.set(match.roomId, nextSession);
        rematchAcceptances.delete(match.roomId);
        io.to(match.roomId).emit(
          'game:state',
          createPublicGameState(match.roomId, nextSession),
        );
      }
    });

    socket.on('disconnect', (reason) => {
      matchmakingQueue.remove(socket.id);
      const match = activeMatches.get(socket.id);

      if (match) {
        const opponentEntry = [...activeMatches.entries()].find(
          ([socketId, candidate]) =>
            socketId !== socket.id && candidate.roomId === match.roomId,
        );
        const opponentSocket = opponentEntry
          ? io.sockets.sockets.get(opponentEntry[0])
          : undefined;
        opponentSocket?.emit('game:opponent-disconnected', {
          roomId: match.roomId,
        });
        opponentSocket?.leave(match.roomId);
        if (opponentEntry) {
          activeMatches.delete(opponentEntry[0]);
        }
        gameSessions.delete(match.roomId);
        rematchAcceptances.delete(match.roomId);
      }

      activeMatches.delete(socket.id);
      logger.log(`disconnected: ${socket.id} (${reason})`);
    });
  });

  return { activeMatches, gameSessions, rematchAcceptances };
}
