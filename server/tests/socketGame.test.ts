import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type {
  ClientToServerEvents,
  GameActionRejectedPayload,
  GameStatePayload,
  MatchmakingMatchedPayload,
  ServerToClientEvents,
} from '@blackjack/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client';

import type { Rank, Suit, Card } from '../src/blackjack/index.js';
import { createGameSession } from '../src/game/index.js';
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

async function createFixture(deck = cards('2', '3', '10', '5', '6', '7', '8')) {
  const httpServer = createServer();
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
  const sessionFactory = vi.fn(() => createGameSession({ deck }));
  const state = registerSocketHandlers(io, {
    createSession: sessionFactory,
    logger: { log: vi.fn() },
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;
  const clients = [0, 1].map(() =>
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
