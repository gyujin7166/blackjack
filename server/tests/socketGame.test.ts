import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import type {
  ChatMessagePayload,
  ClientToServerEvents,
  GameActionRejectedPayload,
  GameStatePayload,
  MatchmakingMatchedPayload,
  OpponentDisconnectedPayload,
  OpponentLeftPayload,
  RematchStatePayload,
  ServerToClientEvents,
  TurnTimerPayload,
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
  turnTimeoutMs?: number,
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
    turnTimeoutMs,
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

describe('server turn timer', () => {
  it('broadcasts game state before the initial timer to both players', async () => {
    const { clients } = await createFixture(undefined, 2, 180);
    const eventsOne: string[] = [];
    const eventsTwo: string[] = [];
    clients[0].on('game:state', () => eventsOne.push('state'));
    clients[0].on('turn:timer', () => eventsOne.push('timer'));
    clients[1].on('game:state', () => eventsTwo.push('state'));
    clients[1].on('turn:timer', () => eventsTwo.push('timer'));
    const timerOne = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    const timerTwo = onceEvent<TurnTimerPayload>(clients[1], 'turn:timer');

    const [match] = await matchClients(clients);
    const [payloadOne, payloadTwo] = await Promise.all([timerOne, timerTwo]);

    expect(payloadOne).toEqual({
      roomId: match.roomId,
      player: 'player1',
      durationMs: 180,
    });
    expect(payloadTwo).toEqual(payloadOne);
    expect(eventsOne.slice(0, 2)).toEqual(['state', 'timer']);
    expect(eventsTwo.slice(0, 2)).toEqual(['state', 'timer']);
  });

  it('uses the actual initial phase after a natural blackjack skip', async () => {
    const { clients } = await createFixture(
      cards('A', '2', '10', 'K', '3', '7'),
      2,
      180,
    );
    const timer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');

    await matchClients(clients);

    expect((await timer).player).toBe('player2');
  });

  it('does not start a timer for an immediately finished session', async () => {
    const { clients } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
      2,
      80,
    );
    const timer = vi.fn();
    clients[0].on('turn:timer', timer);
    clients[1].on('turn:timer', timer);

    await matchClients(clients);
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(timer).not.toHaveBeenCalled();
  });

  it('automatically stands on timeout and starts the next player timer', async () => {
    const { clients } = await createFixture(undefined, 2, 120);
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    const timeoutState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const nextTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');

    const [state, timer] = await Promise.all([timeoutState, nextTimer]);

    expect(state.player1.status).toBe('stood');
    expect(state.phase).toBe('player2');
    expect(timer.player).toBe('player2');
    expect(timer.durationMs).toBe(120);
  });

  it('resets the full timeout after a hit that keeps the same player turn', async () => {
    const { clients, state } = await createFixture(undefined, 2, 180);
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    const [match] = await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    await new Promise((resolve) => setTimeout(resolve, 110));
    const hitState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const resetTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');

    clients[0].emit('player:hit');
    const [, timer] = await Promise.all([hitState, resetTimer]);
    expect(timer).toEqual({
      roomId: match.roomId,
      player: 'player1',
      durationMs: 180,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(state.gameSessions.get(match.roomId)?.phase).toBe('player1');
    expect(state.gameSessions.get(match.roomId)?.player1.status).toBe('playing');

    const timeoutState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    expect((await timeoutState).player1.status).toBe('stood');
  });

  it('cancels the old timer on stand and starts a player2 timer', async () => {
    const { clients } = await createFixture(undefined, 2, 180);
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    const nextState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const nextTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');

    clients[0].emit('player:stand');
    const [state, timer] = await Promise.all([nextState, nextTimer]);

    expect(state.phase).toBe('player2');
    expect(timer.player).toBe('player2');
  });

  it('starts the timer for the actual next phase after a hit reaches 21', async () => {
    const { clients } = await createFixture(
      cards('10', '2', '10', '5', '3', '7', '6'),
      2,
      180,
    );
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    const nextState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const nextTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');

    clients[0].emit('player:hit');
    const [state, timer] = await Promise.all([nextState, nextTimer]);

    expect(state.player1.status).toBe('twenty-one');
    expect(state.phase).toBe('player2');
    expect(timer.player).toBe('player2');
  });

  it('does not reset the active timer for an invalid out-of-turn action', async () => {
    const { clients } = await createFixture(undefined, 2, 150);
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    const unexpectedTimer = vi.fn();
    clients[0].on('turn:timer', unexpectedTimer);
    const rejection = onceEvent<GameActionRejectedPayload>(
      clients[1],
      'game:action-rejected',
    );

    clients[1].emit('player:hit');
    await rejection;
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(unexpectedTimer).not.toHaveBeenCalled();
    const timeoutState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    expect((await timeoutState).player1.status).toBe('stood');
  });

  it('does not create another timer after the game finishes', async () => {
    const { clients } = await createFixture(
      cards('10', '9', '10', '6', '8', '7'),
      2,
      180,
    );
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    const playerTwoState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const playerTwoTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    clients[0].emit('player:stand');
    await Promise.all([playerTwoState, playerTwoTimer]);
    const finishedState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const unexpectedTimer = vi.fn();
    clients[0].on('turn:timer', unexpectedTimer);

    clients[1].emit('player:stand');
    expect((await finishedState).phase).toBe('finished');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(unexpectedTimer).not.toHaveBeenCalled();
  });

  it('starts a rematch timer for the alternating first player', async () => {
    const { clients } = await createFixture(
      cards('10', '9', '10', '6', '8', '7'),
      2,
      180,
    );
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    const playerTwoState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const playerTwoTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    clients[0].emit('player:stand');
    await Promise.all([playerTwoState, playerTwoTimer]);
    const finishedState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    clients[1].emit('player:stand');
    await finishedState;
    const acceptance = onceEvent<RematchStatePayload>(clients[0], 'rematch:state');
    clients[0].emit('rematch:accept');
    await acceptance;
    const rematchState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const rematchTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');

    clients[1].emit('rematch:accept');
    const [state, timer] = await Promise.all([rematchState, rematchTimer]);

    expect(state.phase).toBe('player2');
    expect(timer.player).toBe('player2');
  });

  it('cancels the room timer when a player disconnects', async () => {
    const { clients } = await createFixture(undefined, 2, 120);
    const initialState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const initialTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients);
    await Promise.all([initialState, initialTimer]);
    const disconnected = onceEvent<OpponentDisconnectedPayload>(
      clients[1],
      'game:opponent-disconnected',
    );
    const unexpectedState = vi.fn();
    clients[1].on('game:state', unexpectedState);

    clients[0].disconnect();
    await disconnected;
    await new Promise((resolve) => setTimeout(resolve, 170));

    expect(unexpectedState).not.toHaveBeenCalled();
  });

  it('keeps another room timer active when one room is cleaned up', async () => {
    const { clients } = await createFixture(undefined, 4, 150);
    const roomOneState = onceEvent<GameStatePayload>(clients[0], 'game:state');
    const roomOneTimer = onceEvent<TurnTimerPayload>(clients[0], 'turn:timer');
    await matchClients(clients.slice(0, 2));
    await Promise.all([roomOneState, roomOneTimer]);
    const roomTwoState = onceEvent<GameStatePayload>(clients[2], 'game:state');
    const roomTwoTimer = onceEvent<TurnTimerPayload>(clients[2], 'turn:timer');
    await matchClients(clients.slice(2, 4));
    await Promise.all([roomTwoState, roomTwoTimer]);
    const disconnected = onceEvent<OpponentDisconnectedPayload>(
      clients[1],
      'game:opponent-disconnected',
    );
    clients[0].disconnect();
    await disconnected;
    const timeoutState = onceEvent<GameStatePayload>(clients[2], 'game:state');

    expect((await timeoutState).player1.status).toBe('stood');
  });
});

describe('room chat relay', () => {
  it('broadcasts player1 canonical messages to both room players', async () => {
    const { clients } = await createFixture();
    const [match] = await matchClients(clients);
    const playerOneMessage = onceEvent<ChatMessagePayload>(clients[0], 'chat:message');
    const playerTwoMessage = onceEvent<ChatMessagePayload>(clients[1], 'chat:message');

    clients[0].emit('chat:send', { text: '안녕하세요' });
    const [messageOne, messageTwo] = await Promise.all([
      playerOneMessage,
      playerTwoMessage,
    ]);

    expect(messageOne).toEqual({
      roomId: match.roomId,
      sender: 'player1',
      text: '안녕하세요',
    });
    expect(messageTwo).toEqual(messageOne);
  });

  it('uses the authoritative player2 seat as sender', async () => {
    const { clients } = await createFixture();
    const [, match] = await matchClients(clients);
    const message = onceEvent<ChatMessagePayload>(clients[0], 'chat:message');

    clients[1].emit('chat:send', { text: '반갑습니다' });

    await expect(message).resolves.toEqual({
      roomId: match.roomId,
      sender: 'player2',
      text: '반갑습니다',
    });
  });

  it('trims leading and trailing whitespace before broadcasting', async () => {
    const { clients } = await createFixture();
    await matchClients(clients);
    const message = onceEvent<ChatMessagePayload>(clients[1], 'chat:message');

    clients[0].emit('chat:send', { text: '  trimmed message  ' });

    expect((await message).text).toBe('trimmed message');
  });

  it.each([
    { name: 'missing payload', payload: undefined },
    { name: 'non-string text', payload: { text: 123 } },
    { name: 'whitespace-only text', payload: { text: '   ' } },
    { name: '201 characters', payload: { text: 'a'.repeat(201) } },
  ])('ignores $name', async ({ payload }) => {
    const { clients } = await createFixture();
    await matchClients(clients);
    const received = vi.fn();
    clients[0].on('chat:message', received);
    clients[1].on('chat:message', received);

    clients[0].emit('chat:send', payload as never);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(received).not.toHaveBeenCalled();
  });

  it('allows exactly 200 characters', async () => {
    const { clients } = await createFixture();
    await matchClients(clients);
    const message = onceEvent<ChatMessagePayload>(clients[1], 'chat:message');
    const text = 'a'.repeat(200);

    clients[0].emit('chat:send', { text });

    expect((await message).text).toBe(text);
  });

  it('ignores an unmatched socket', async () => {
    const { clients } = await createFixture();
    const received = vi.fn();
    clients[0].on('chat:message', received);
    clients[1].on('chat:message', received);

    clients[0].emit('chat:send', { text: 'not matched' });
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(received).not.toHaveBeenCalled();
  });

  it('does not broadcast outside the matched room', async () => {
    const { clients } = await createFixture(undefined, 4);
    await matchClients(clients.slice(0, 2));
    await matchClients(clients.slice(2, 4));
    const senderMessage = onceEvent<ChatMessagePayload>(clients[0], 'chat:message');
    const opponentMessage = onceEvent<ChatMessagePayload>(clients[1], 'chat:message');
    const otherRoomMessage = vi.fn();
    clients[2].on('chat:message', otherRoomMessage);
    clients[3].on('chat:message', otherRoomMessage);

    clients[0].emit('chat:send', { text: 'room one only' });
    await Promise.all([senderMessage, opponentMessage]);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(otherRoomMessage).not.toHaveBeenCalled();
  });

  it('allows chat after the game has finished', async () => {
    const { clients } = await createFixture(cards('10', '9', 'A', '8', '7', 'K'));
    await matchClients(clients);
    const message = onceEvent<ChatMessagePayload>(clients[1], 'chat:message');

    clients[0].emit('chat:send', { text: 'finished chat' });

    expect((await message).text).toBe('finished chat');
  });

  it('allows chat while waiting for the other rematch acceptance', async () => {
    const { clients } = await createFixture(cards('10', '9', 'A', '8', '7', 'K'));
    await matchClients(clients);
    const rematchState = onceEvent<RematchStatePayload>(clients[0], 'rematch:state');
    clients[0].emit('rematch:accept');
    await rematchState;
    const message = onceEvent<ChatMessagePayload>(clients[0], 'chat:message');

    clients[1].emit('chat:send', { text: 'rematch?' });

    expect((await message).text).toBe('rematch?');
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

describe('new opponent matchmaking', () => {
  it('cleans the finished room, notifies only the opponent, and queues the requester', async () => {
    const { clients, io, state } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
    );
    const [requesterMatch] = await matchClients(clients);
    const acceptance = onceEvent<RematchStatePayload>(clients[0], 'rematch:state');
    clients[0].emit('rematch:accept');
    await acceptance;
    const opponentLeft = onceEvent<OpponentLeftPayload>(
      clients[1],
      'matchmaking:opponent-left',
    );
    const waiting = onceEvent<void>(clients[0], 'matchmaking:waiting');
    const requesterNotice = vi.fn();
    clients[0].on('matchmaking:opponent-left', requesterNotice);

    clients[0].emit('matchmaking:new-opponent');
    const [notice] = await Promise.all([opponentLeft, waiting]);

    expect(notice).toEqual({ roomId: requesterMatch.roomId });
    expect(requesterNotice).not.toHaveBeenCalled();
    expect(state.gameSessions.has(requesterMatch.roomId)).toBe(false);
    expect(state.rematchAcceptances.has(requesterMatch.roomId)).toBe(false);
    expect(
      [...state.activeMatches.values()].filter(
        (candidate) => candidate.roomId === requesterMatch.roomId,
      ),
    ).toHaveLength(0);
    expect(io.sockets.sockets.get(clients[0].id!)?.rooms.has(requesterMatch.roomId)).toBe(
      false,
    );
    expect(io.sockets.sockets.get(clients[1].id!)?.rooms.has(requesterMatch.roomId)).toBe(
      false,
    );
  });

  it('immediately matches the requester with an existing FIFO waiter in a new room', async () => {
    const { clients, state } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
      3,
    );
    const [oldMatch] = await matchClients(clients.slice(0, 2));
    const thirdWaiting = onceEvent<void>(clients[2], 'matchmaking:waiting');
    clients[2].emit('matchmaking:join');
    await thirdWaiting;
    const requesterMatched = onceEvent<MatchmakingMatchedPayload>(
      clients[0],
      'matchmaking:matched',
    );
    const thirdMatched = onceEvent<MatchmakingMatchedPayload>(
      clients[2],
      'matchmaking:matched',
    );
    const opponentLeft = onceEvent<OpponentLeftPayload>(
      clients[1],
      'matchmaking:opponent-left',
    );

    clients[0].emit('matchmaking:new-opponent');
    const [requesterNewMatch, thirdNewMatch] = await Promise.all([
      requesterMatched,
      thirdMatched,
      opponentLeft,
    ]);

    expect(requesterNewMatch.roomId).toBe(thirdNewMatch.roomId);
    expect(requesterNewMatch.roomId).not.toBe(oldMatch.roomId);
    expect(state.gameSessions.has(requesterNewMatch.roomId)).toBe(true);
    expect(state.activeMatches.has(clients[1].id!)).toBe(false);
    expect(state.activeMatches.get(clients[0].id!)?.roomId).toBe(
      requesterNewMatch.roomId,
    );
    expect(state.activeMatches.get(clients[2].id!)?.roomId).toBe(
      requesterNewMatch.roomId,
    );
  });

  it('does not auto-queue the old opponent and allows a later manual FIFO rematch', async () => {
    const { clients } = await createFixture(cards('10', '9', 'A', '8', '7', 'K'));
    const [oldMatch] = await matchClients(clients);
    const requesterWaiting = onceEvent<void>(clients[0], 'matchmaking:waiting');
    const opponentLeft = onceEvent<OpponentLeftPayload>(
      clients[1],
      'matchmaking:opponent-left',
    );
    const unexpectedOpponentWaiting = vi.fn();
    clients[1].on('matchmaking:waiting', unexpectedOpponentWaiting);
    clients[0].emit('matchmaking:new-opponent');
    await Promise.all([requesterWaiting, opponentLeft]);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(unexpectedOpponentWaiting).not.toHaveBeenCalled();

    const requesterMatched = onceEvent<MatchmakingMatchedPayload>(
      clients[0],
      'matchmaking:matched',
    );
    const opponentMatched = onceEvent<MatchmakingMatchedPayload>(
      clients[1],
      'matchmaking:matched',
    );
    clients[1].emit('matchmaking:join');
    const [requesterNewMatch, opponentNewMatch] = await Promise.all([
      requesterMatched,
      opponentMatched,
    ]);

    expect(requesterNewMatch.roomId).toBe(opponentNewMatch.roomId);
    expect(requesterNewMatch.roomId).not.toBe(oldMatch.roomId);
  });

  it('ignores requests from an in-progress game or unmatched socket', async () => {
    const { clients, state } = await createFixture(undefined, 3);
    const [match] = await matchClients(clients.slice(0, 2));
    const originalSession = state.gameSessions.get(match.roomId);
    const notifications = vi.fn();
    clients[1].on('matchmaking:opponent-left', notifications);

    clients[0].emit('matchmaking:new-opponent');
    clients[2].emit('matchmaking:new-opponent');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(state.gameSessions.get(match.roomId)).toBe(originalSession);
    expect(state.activeMatches.get(clients[0].id!)).toEqual(match);
    expect(state.activeMatches.has(clients[1].id!)).toBe(true);
    expect(state.activeMatches.has(clients[2].id!)).toBe(false);
    expect(notifications).not.toHaveBeenCalled();
  });

  it('does not change another room when leaving a finished game', async () => {
    const { clients, state } = await createFixture(
      cards('10', '9', 'A', '8', '7', 'K'),
      4,
    );
    const [leavingMatch] = await matchClients(clients.slice(0, 2));
    const [otherMatch] = await matchClients(clients.slice(2, 4));
    const otherSession = state.gameSessions.get(otherMatch.roomId);
    const opponentLeft = onceEvent<OpponentLeftPayload>(
      clients[1],
      'matchmaking:opponent-left',
    );
    const otherRoomNotice = vi.fn();
    clients[2].on('matchmaking:opponent-left', otherRoomNotice);
    clients[3].on('matchmaking:opponent-left', otherRoomNotice);

    clients[0].emit('matchmaking:new-opponent');
    await opponentLeft;
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(state.gameSessions.has(leavingMatch.roomId)).toBe(false);
    expect(state.gameSessions.get(otherMatch.roomId)).toBe(otherSession);
    expect(state.activeMatches.get(clients[2].id!)).toEqual(otherMatch);
    expect(state.activeMatches.get(clients[3].id!)?.roomId).toBe(otherMatch.roomId);
    expect(otherRoomNotice).not.toHaveBeenCalled();
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
