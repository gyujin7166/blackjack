import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type {
  ClientToServerEvents,
  GameActionRejectedPayload,
  GameStatePayload,
  MatchmakingMatchedPayload,
  OpponentDisconnectedPayload,
  RematchStatePayload,
  ServerToClientEvents,
} from '@blackjack/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

import type { Rank, Suit, Card } from '../src/blackjack/index.js';
import { createGameSession, type GameSessionOptions } from '../src/game/index.js';
import {
  registerSocketHandlers,
  type SocketServerState,
} from '../src/socket/registerSocketHandlers.js';

type TestClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

function cards(...ranks: Rank[]): Card[] {
  const occurrences = new Map<Rank, number>();
  return ranks.map((rank) => {
    const occurrence = occurrences.get(rank) ?? 0;
    occurrences.set(rank, occurrence + 1);
    return { rank, suit: suits[occurrence % suits.length] };
  });
}

interface Fixture {
  httpServer: HttpServer;
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  clients: TestClient[];
  state: SocketServerState;
  sessionFactory: ReturnType<typeof vi.fn>;
}

const fixtures: Fixture[] = [];

function onceEvent<T>(client: TestClient, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), 1_000);
    client.once(event as never, ((payload: T) => {
      clearTimeout(timeout);
      resolve(payload);
    }) as never);
  });
}

async function createFixture(
  deck = cards('2', '3', '10', '5', '6', '7', '8'),
  clientCount = 2,
) {
  const httpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  const sessionFactory = vi.fn(
    (options: Pick<GameSessionOptions, 'firstPlayer'> = {}) =>
      createGameSession({ deck, ...options }),
  );
  const state = registerSocketHandlers(io, {
    createSession: sessionFactory,
    logger: { log: vi.fn() },
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  const clients = Array.from({ length: clientCount }, () =>
    createClient(`http://127.0.0.1:${port}`, {
      forceNew: true,
      transports: ['websocket'],
    }),
  );

  await Promise.all(clients.map((client) => onceEvent(client, 'connect')));

  const fixture = { httpServer, io, clients, state, sessionFactory };
  fixtures.push(fixture);
  return fixture;
}

async function matchClients(clients: TestClient[]) {
  const [playerOne, playerTwo] = clients;
  const waiting = onceEvent<void>(playerOne, 'matchmaking:waiting');
  playerOne.emit('matchmaking:join');
  await waiting;

  const matchedOne = onceEvent<MatchmakingMatchedPayload>(
    playerOne,
    'matchmaking:matched',
  );
  const matchedTwo = onceEvent<MatchmakingMatchedPayload>(
    playerTwo,
    'matchmaking:matched',
  );
  playerTwo.emit('matchmaking:join');

  return Promise.all([matchedOne, matchedTwo]);
}

afterEach(async () => {
  await Promise.all(
    fixtures.splice(0).map(async ({ clients, io, httpServer }) => {
      clients.forEach((client) => client.disconnect());
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) =>
          httpServer.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }),
  );
});

describe('Socket.IO game integration', () => {
  it('creates exactly one shared GameSession for a matched room', async () => {
    const { clients, state, sessionFactory } = await createFixture();

    const [playerOneMatch, playerTwoMatch] = await matchClients(clients);

    expect(playerOneMatch.roomId).toBe(playerTwoMatch.roomId);
    expect(playerOneMatch.seat).toBe('player1');
    expect(playerTwoMatch.seat).toBe('player2');
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(state.gameSessions.size).toBe(1);
    expect(state.gameSessions.get(playerOneMatch.roomId)).toBe(
      sessionFactory.mock.results[0]?.value,
    );
  });

  it('broadcasts the same initial game state to both matched sockets', async () => {
    const { clients } = await createFixture();
    const stateOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const stateTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');

    const [playerOneMatch] = await matchClients(clients);
    const [playerOneState, playerTwoState] = await Promise.all([stateOne, stateTwo]);

    expect(playerOneState).toEqual(playerTwoState);
    expect(playerOneState.roomId).toBe(playerOneMatch.roomId);
    expect(playerOneState.phase).toBe('player1');
  });

  it('allows the current player to hit and broadcasts the new state', async () => {
    const { clients, state } = await createFixture();
    const initialOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    const [playerOneMatch] = await matchClients(clients);
    await Promise.all([initialOne, initialTwo]);

    const nextOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const nextTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    clients[0].emit('player:hit');
    const [playerOneState, playerTwoState] = await Promise.all([nextOne, nextTwo]);

    expect(playerOneState).toEqual(playerTwoState);
    expect(playerOneState.player1.hand).toHaveLength(3);
    expect(playerOneState.phase).toBe('player1');
    expect(state.gameSessions.get(playerOneMatch.roomId)?.player1.hand).toHaveLength(3);
  });

  it('allows the current player to stand and broadcasts the turn change', async () => {
    const { clients } = await createFixture();
    const initialOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    await matchClients(clients);
    await Promise.all([initialOne, initialTwo]);

    const nextOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const nextTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    clients[0].emit('player:stand');
    const [playerOneState, playerTwoState] = await Promise.all([nextOne, nextTwo]);

    expect(playerOneState).toEqual(playerTwoState);
    expect(playerOneState.player1.status).toBe('stood');
    expect(playerOneState.phase).toBe('player2');
  });

  it('rejects out-of-turn hit and stand only to the requester without mutation', async () => {
    const { clients, state } = await createFixture();
    const initialOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    const [match] = await matchClients(clients);
    await Promise.all([initialOne, initialTwo]);
    const session = state.gameSessions.get(match.roomId);
    const before = JSON.stringify(session);
    const playerOneRejection = vi.fn();
    const unexpectedState = vi.fn();
    clients[0].on('game:action-rejected', playerOneRejection);
    clients[0].on('game:state', unexpectedState);
    clients[1].on('game:state', unexpectedState);

    const hitRejection = onceEvent<GameActionRejectedPayload>(
      clients[1],
      'game:action-rejected',
    );
    clients[1].emit('player:hit');
    await expect(hitRejection).resolves.toEqual({
      action: 'hit',
      reason: 'not_your_turn',
    });

    const standRejection = onceEvent<GameActionRejectedPayload>(
      clients[1],
      'game:action-rejected',
    );
    clients[1].emit('player:stand');
    await expect(standRejection).resolves.toEqual({
      action: 'stand',
      reason: 'not_your_turn',
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(JSON.stringify(session)).toBe(before);
    expect(playerOneRejection).not.toHaveBeenCalled();
    expect(unexpectedState).not.toHaveBeenCalled();
  });

  it('rejects an action from a socket that is not in a game', async () => {
    const { clients } = await createFixture();
    const rejection = onceEvent<GameActionRejectedPayload>(
      clients[0],
      'game:action-rejected',
    );

    clients[0].emit('player:hit');

    await expect(rejection).resolves.toEqual({ action: 'hit', reason: 'not_in_game' });
  });

  it('rejects an action when the room session is unavailable', async () => {
    const { clients, state } = await createFixture();
    const [match] = await matchClients(clients);
    state.gameSessions.delete(match.roomId);
    const rejection = onceEvent<GameActionRejectedPayload>(
      clients[0],
      'game:action-rejected',
    );

    clients[0].emit('player:stand');

    await expect(rejection).resolves.toEqual({
      action: 'stand',
      reason: 'game_unavailable',
    });
  });

  it('hides the dealer hole card, dealer score, and deck while in progress', async () => {
    const { clients } = await createFixture();
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    await matchClients(clients);

    const state = await initialState;
    const holeCard = state.dealer.hand[1];

    expect(state.dealer.hand[0]).toEqual({ rank: '10', suit: 'clubs' });
    expect(holeCard).toEqual({ hidden: true });
    expect(holeCard).not.toHaveProperty('rank');
    expect(holeCard).not.toHaveProperty('suit');
    expect(state.dealer.score).toBeNull();
    expect(state).not.toHaveProperty('deck');
  });

  it('reveals the complete dealer hand and score after the game finishes', async () => {
    const { clients } = await createFixture();
    const initialOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    await matchClients(clients);
    await Promise.all([initialOne, initialTwo]);

    const playerTwoTurnOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const playerTwoTurnTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    clients[0].emit('player:stand');
    await Promise.all([playerTwoTurnOne, playerTwoTurnTwo]);

    const finishedOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const finishedTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    clients[1].emit('player:stand');
    const states = await Promise.all([finishedOne, finishedTwo]);

    expect(states[0]).toEqual(states[1]);
    expect(states[0].phase).toBe('finished');
    expect(states[0].dealer.hand).toEqual(cards('10', '7'));
    expect(states[0].dealer.score).toBe(17);
  });

  it('rejects hit and stand after finishing without changing state', async () => {
    const { clients, state } = await createFixture();
    const initialOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    const [match] = await matchClients(clients);
    await Promise.all([initialOne, initialTwo]);
    const playerTwoTurnOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const playerTwoTurnTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    clients[0].emit('player:stand');
    await Promise.all([playerTwoTurnOne, playerTwoTurnTwo]);
    const finishedOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const finishedTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    clients[1].emit('player:stand');
    await Promise.all([finishedOne, finishedTwo]);
    const session = state.gameSessions.get(match.roomId);
    const before = JSON.stringify(session);
    const unexpectedState = vi.fn();
    clients[0].on('game:state', unexpectedState);
    clients[1].on('game:state', unexpectedState);

    const hitRejection = onceEvent<GameActionRejectedPayload>(
      clients[0],
      'game:action-rejected',
    );
    clients[0].emit('player:hit');
    await expect(hitRejection).resolves.toEqual({
      action: 'hit',
      reason: 'game_finished',
    });

    const standRejection = onceEvent<GameActionRejectedPayload>(
      clients[1],
      'game:action-rejected',
    );
    clients[1].emit('player:stand');
    await expect(standRejection).resolves.toEqual({
      action: 'stand',
      reason: 'game_finished',
    });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(JSON.stringify(session)).toBe(before);
    expect(unexpectedState).not.toHaveBeenCalled();
  });
});

describe('matched disconnect cleanup', () => {
  it.each([
    { disconnectedIndex: 0, remainingIndex: 1, player: 'player1' },
    { disconnectedIndex: 1, remainingIndex: 0, player: 'player2' },
  ])('notifies the opponent when $player disconnects', async ({
    disconnectedIndex,
    remainingIndex,
  }) => {
    const { clients } = await createFixture();
    const matches = await matchClients(clients);
    const notification = onceEvent<OpponentDisconnectedPayload>(
      clients[remainingIndex],
      'game:opponent-disconnected',
    );

    clients[disconnectedIndex].disconnect();

    await expect(notification).resolves.toEqual({ roomId: matches[0].roomId });
  });

  it.each([0, 1])(
    'removes both active matches when client %i disconnects',
    async (disconnectedIndex) => {
      const { clients, state } = await createFixture();
      const [match] = await matchClients(clients);
      const remainingIndex = disconnectedIndex === 0 ? 1 : 0;
      const notification = onceEvent<OpponentDisconnectedPayload>(
        clients[remainingIndex],
        'game:opponent-disconnected',
      );

      clients[disconnectedIndex].disconnect();
      await notification;

      expect(
        [...state.activeMatches.values()].filter(
          (candidate) => candidate.roomId === match.roomId,
        ),
      ).toHaveLength(0);
    },
  );

  it('removes only the disconnected room session and isolates other rooms', async () => {
    const { clients, state } = await createFixture(undefined, 4);
    const [firstMatch] = await matchClients(clients.slice(0, 2));
    const [secondMatch] = await matchClients(clients.slice(2, 4));
    const notification = onceEvent<OpponentDisconnectedPayload>(
      clients[1],
      'game:opponent-disconnected',
    );
    const otherRoomNotification = vi.fn();
    clients[2].on('game:opponent-disconnected', otherRoomNotification);
    clients[3].on('game:opponent-disconnected', otherRoomNotification);

    clients[0].disconnect();
    await notification;
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(state.gameSessions.has(firstMatch.roomId)).toBe(false);
    expect(state.gameSessions.has(secondMatch.roomId)).toBe(true);
    expect(
      [...state.activeMatches.values()].filter(
        (candidate) => candidate.roomId === secondMatch.roomId,
      ),
    ).toHaveLength(2);
    expect(otherRoomNotification).not.toHaveBeenCalled();
  });

  it('makes the remaining socket leave the game room', async () => {
    const { clients, io } = await createFixture();
    const [match] = await matchClients(clients);
    const remainingSocket = io.sockets.sockets.get(clients[1].id!);
    expect(remainingSocket?.rooms.has(match.roomId)).toBe(true);
    const notification = onceEvent<OpponentDisconnectedPayload>(
      clients[1],
      'game:opponent-disconnected',
    );

    clients[0].disconnect();
    await notification;

    expect(remainingSocket?.rooms.has(match.roomId)).toBe(false);
  });
});

describe('waiting disconnect regression', () => {
  it('removes only the waiting socket and allows the next two users to match', async () => {
    const { clients } = await createFixture(undefined, 3);
    const opponentDisconnected = vi.fn();
    clients[1].on('game:opponent-disconnected', opponentDisconnected);
    clients[2].on('game:opponent-disconnected', opponentDisconnected);
    const waiting = onceEvent<void>(clients[0], 'matchmaking:waiting');
    clients[0].emit('matchmaking:join');
    await waiting;

    clients[0].disconnect();
    await new Promise((resolve) => setTimeout(resolve, 25));
    const [playerOne, playerTwo] = await matchClients(clients.slice(1));

    expect(playerOne.roomId).toBe(playerTwo.roomId);
    expect(playerOne.seat).toBe('player1');
    expect(playerTwo.seat).toBe('player2');
    expect(opponentDisconnected).not.toHaveBeenCalled();
  });
});

describe('rematch', () => {
  it.each([
    {
      acceptingIndex: 0,
      expected: { player1Accepted: true, player2Accepted: false },
    },
    {
      acceptingIndex: 1,
      expected: { player1Accepted: false, player2Accepted: true },
    },
  ])('broadcasts one acceptance without replacing the session', async ({
    acceptingIndex,
    expected,
  }) => {
    const { clients, state, sessionFactory } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
    );
    const [match] = await matchClients(clients);
    const originalSession = state.gameSessions.get(match.roomId);
    const stateOne = onceEvent<RematchStatePayload>(clients[0], 'rematch:state');
    const stateTwo = onceEvent<RematchStatePayload>(clients[1], 'rematch:state');

    clients[acceptingIndex].emit('rematch:accept');
    const [playerOneState, playerTwoState] = await Promise.all([stateOne, stateTwo]);

    expect(playerOneState).toEqual({ roomId: match.roomId, ...expected });
    expect(playerTwoState).toEqual(playerOneState);
    expect(state.gameSessions.get(match.roomId)).toBe(originalSession);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
  });

  it('starts a new session in the same room after both players accept', async () => {
    const { clients, io, state, sessionFactory } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
    );
    const matches = await matchClients(clients);
    const roomId = matches[0].roomId;
    const originalSession = state.gameSessions.get(roomId);
    const firstAcceptanceOne = onceEvent<RematchStatePayload>(
      clients[0],
      'rematch:state',
    );
    const firstAcceptanceTwo = onceEvent<RematchStatePayload>(
      clients[1],
      'rematch:state',
    );
    clients[0].emit('rematch:accept');
    await Promise.all([firstAcceptanceOne, firstAcceptanceTwo]);
    const newStateOne = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const newStateTwo = onceEvent<GameStatePayload>(clients[1], 'game:state');
    const unexpectedMatched = vi.fn();
    clients[0].on('matchmaking:matched', unexpectedMatched);
    clients[1].on('matchmaking:matched', unexpectedMatched);

    clients[1].emit('rematch:accept');
    const [playerOneState, playerTwoState] = await Promise.all([
      newStateOne,
      newStateTwo,
    ]);

    expect(playerOneState).toEqual(playerTwoState);
    expect(playerOneState.roomId).toBe(roomId);
    expect(state.gameSessions.get(roomId)).not.toBe(originalSession);
    expect(sessionFactory).toHaveBeenCalledTimes(2);
    expect(state.rematchAcceptances.has(roomId)).toBe(false);
    expect(state.activeMatches.get(clients[0].id!)).toEqual(matches[0]);
    expect(state.activeMatches.get(clients[1].id!)).toEqual(matches[1]);
    expect(io.sockets.sockets.get(clients[0].id!)?.rooms.has(roomId)).toBe(true);
    expect(io.sockets.sockets.get(clients[1].id!)?.rooms.has(roomId)).toBe(true);
    expect(unexpectedMatched).not.toHaveBeenCalled();
  });

  it('alternates the first player across consecutive rematches', async () => {
    const { clients, state } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
    );
    const [match] = await matchClients(clients);
    const roomId = match.roomId;
    expect(state.gameSessions.get(roomId)?.firstPlayer).toBe('player1');

    const firstAcceptance = onceEvent<RematchStatePayload>(
      clients[0],
      'rematch:state',
    );
    clients[0].emit('rematch:accept');
    await firstAcceptance;
    const firstRematchState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    clients[1].emit('rematch:accept');
    await firstRematchState;

    expect(state.gameSessions.get(roomId)?.firstPlayer).toBe('player2');

    const secondAcceptance = onceEvent<RematchStatePayload>(
      clients[0],
      'rematch:state',
    );
    clients[0].emit('rematch:accept');
    await secondAcceptance;
    const secondRematchState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    clients[1].emit('rematch:accept');
    await secondRematchState;

    expect(state.gameSessions.get(roomId)?.firstPlayer).toBe('player1');
  });

  it('treats duplicate acceptance from one player as one vote', async () => {
    const { clients, state, sessionFactory } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
    );
    const [match] = await matchClients(clients);
    const acceptance = onceEvent<RematchStatePayload>(clients[0], 'rematch:state');
    clients[0].emit('rematch:accept');
    await acceptance;

    clients[0].emit('rematch:accept');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(state.rematchAcceptances.get(match.roomId)?.size).toBe(1);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
  });

  it('ignores acceptance while the game is in progress', async () => {
    const { clients, state, sessionFactory } = await createFixture();
    const [match] = await matchClients(clients);
    const rematchState = vi.fn();
    clients[0].on('rematch:state', rematchState);

    clients[0].emit('rematch:accept');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(state.rematchAcceptances.has(match.roomId)).toBe(false);
    expect(sessionFactory).toHaveBeenCalledTimes(1);
    expect(rematchState).not.toHaveBeenCalled();
  });

  it('ignores acceptance from an unmatched socket', async () => {
    const { clients, state, sessionFactory } = await createFixture();
    const rematchState = vi.fn();
    clients[0].on('rematch:state', rematchState);

    clients[0].emit('rematch:accept');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(state.rematchAcceptances.size).toBe(0);
    expect(sessionFactory).not.toHaveBeenCalled();
    expect(rematchState).not.toHaveBeenCalled();
  });

  it('removes acceptance when an opponent disconnects while waiting', async () => {
    const { clients, state } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
    );
    const [match] = await matchClients(clients);
    const acceptance = onceEvent<RematchStatePayload>(clients[0], 'rematch:state');
    clients[0].emit('rematch:accept');
    await acceptance;
    expect(state.rematchAcceptances.has(match.roomId)).toBe(true);
    const disconnected = onceEvent<OpponentDisconnectedPayload>(
      clients[0],
      'game:opponent-disconnected',
    );

    clients[1].disconnect();
    await disconnected;

    expect(state.rematchAcceptances.has(match.roomId)).toBe(false);
    expect(state.gameSessions.has(match.roomId)).toBe(false);
    expect(
      [...state.activeMatches.values()].some(
        (candidate) => candidate.roomId === match.roomId,
      ),
    ).toBe(false);
  });
});
