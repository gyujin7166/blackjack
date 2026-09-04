import type {
  GameActionRejectedPayload,
  GameStatePayload,
  MatchmakingMatchedPayload,
  ServerToClientEvents,
} from '@blackjack/shared';
import type { GameTableHudProps } from '../widgets/game-table/ui/GameTableHud';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { socketMock, handlers, gameTableSceneMock } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<Handler>>();
  const socketMock = {
    connected: true,
    active: true,
    on: vi.fn((event: string, handler: Handler) => {
      const eventHandlers = handlers.get(event) ?? new Set<Handler>();
      eventHandlers.add(handler);
      handlers.set(event, eventHandlers);
      return socketMock;
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
      return socketMock;
    }),
    emit: vi.fn(() => socketMock),
    connect: vi.fn(() => {
      socketMock.active = true;
      return socketMock;
    }),
    disconnect: vi.fn(() => {
      socketMock.connected = false;
      socketMock.active = false;
      return socketMock;
    }),
    serverEmit(event: string, payload?: unknown) {
      if (event === 'connect') {
        socketMock.connected = true;
        socketMock.active = true;
      } else if (event === 'disconnect' || event === 'connect_error') {
        socketMock.connected = false;
      }
      handlers.get(event)?.forEach((handler) => handler(payload));
    },
  };
  return { socketMock, handlers, gameTableSceneMock: vi.fn() };
});
const prepareGameSoundsMock = vi.hoisted(() => vi.fn());

type GameTableSceneTestProps = Omit<
  GameTableHudProps,
  'dealerSequenceComplete'
> & { animationRound: number };

vi.mock('../shared/api/socket', () => ({ socket: socketMock }));
vi.mock('../widgets/game-table/lib/gameSounds', () => ({
  prepareGameSounds: prepareGameSoundsMock,
}));
vi.mock('../widgets/game-table/ui/GameTableScene', async () => {
  const { GameTableChatPanel } =
    await import('../widgets/game-table/ui/GameTableChatPanel');
  const { GameTableHud } =
    await import('../widgets/game-table/ui/GameTableHud');

  return {
    GameTableScene: (props: GameTableSceneTestProps) => {
      gameTableSceneMock(props);
      return (
        <div data-testid="game-table-scene">
          <GameTableHud {...props} dealerSequenceComplete />
          {props.gameState.phase !== 'finished' && (
            <GameTableChatPanel
              chatInput={props.chatInput}
              chatMessages={props.chatMessages}
              id="game-table-wide-chat"
              onChatInputChange={props.onChatInputChange}
              onChatSubmit={props.onChatSubmit}
              selfSeat={props.selfSeat}
              variant="wide"
            />
          )}
        </div>
      );
    },
  };
});

import { App } from './App';

const playerOneMatch: MatchmakingMatchedPayload = {
  roomId: 'game:test-room',
  seat: 'player1',
};

function gameState(
  overrides: Partial<GameStatePayload> = {},
): GameStatePayload {
  return {
    roomId: 'game:test-room',
    phase: 'player1',
    player1: {
      hand: [{ rank: 'A', suit: 'spades' }],
      score: 11,
      status: 'playing',
      result: null,
    },
    player2: {
      hand: [{ rank: 'K', suit: 'clubs' }],
      score: 10,
      status: 'waiting',
      result: null,
    },
    dealer: {
      hand: [{ rank: '10', suit: 'hearts' }, { hidden: true }],
      score: null,
    },
    ...overrides,
  };
}

function serverEmit<E extends keyof ServerToClientEvents>(
  event: E,
  ...args: Parameters<ServerToClientEvents[E]>
) {
  act(() => socketMock.serverEmit(event, args[0]));
}

function renderMatched(match = playerOneMatch) {
  render(<App />);
  serverEmit('matchmaking:matched', match);
}

beforeEach(() => {
  handlers.clear();
  socketMock.connected = true;
  socketMock.active = true;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('connection status', () => {
  it('shows the initial connection attempt and disables matchmaking', () => {
    socketMock.connected = false;
    socketMock.active = false;

    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent(
      '서버에 연결 중입니다...',
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '첫 연결은 잠시 걸릴 수 있습니다.',
    );
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled();
    expect(socketMock.connect).toHaveBeenCalledTimes(1);
  });

  it('shows the connected state and enables matchmaking after connect', () => {
    socketMock.connected = false;
    socketMock.active = false;
    render(<App />);

    act(() => socketMock.serverEmit('connect'));

    expect(screen.getByRole('status')).toHaveTextContent(
      '서버에 연결되었습니다.',
    );
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled();
  });

  it('shows an automatic retry message after a recoverable connect error', () => {
    socketMock.connected = false;
    socketMock.active = false;
    render(<App />);
    socketMock.active = true;

    act(() => socketMock.serverEmit('connect_error', new Error('internal')));

    expect(screen.getByRole('status')).toHaveTextContent(
      '서버에 연결하지 못했습니다. 자동으로 다시 시도하고 있습니다.',
    );
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled();
    expect(screen.queryByText('internal')).not.toBeInTheDocument();
  });

  it('shows a terminal disconnected state when automatic retry is inactive', () => {
    socketMock.connected = false;
    socketMock.active = false;
    render(<App />);
    socketMock.active = false;

    act(() => socketMock.serverEmit('connect_error', new Error('internal')));

    expect(screen.getByRole('status')).toHaveTextContent(
      '서버 연결에 실패했습니다. 자동으로 다시 연결할 수 없습니다.',
    );
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled();
  });

  it('shows reconnecting after a recoverable disconnect and recovers on connect', () => {
    render(<App />);
    socketMock.active = true;

    act(() => socketMock.serverEmit('disconnect', 'transport close'));

    expect(screen.getByRole('status')).toHaveTextContent(
      '연결이 끊어졌습니다. 자동으로 다시 연결을 시도하고 있습니다.',
    );
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled();

    act(() => socketMock.serverEmit('connect'));

    expect(screen.getByRole('status')).toHaveTextContent(
      '서버에 연결되었습니다.',
    );
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled();
  });

  it('shows a terminal disconnected state when reconnect is inactive', () => {
    render(<App />);
    socketMock.active = false;

    act(() => socketMock.serverEmit('disconnect', 'io server disconnect'));

    expect(screen.getByRole('status')).toHaveTextContent(
      '서버 연결에 실패했습니다. 자동으로 다시 연결할 수 없습니다.',
    );
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeDisabled();
  });
});

describe('matchmaking', () => {
  it('keeps the existing start button behavior', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '게임 시작' }));

    expect(prepareGameSoundsMock).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith('matchmaking:join');
    expect(
      screen.getByRole('button', { name: '상대 찾는 중...' }),
    ).toBeDisabled();
  });

  it('shows waiting and a preparation state without internal room or seat data', () => {
    render(<App />);
    serverEmit('matchmaking:waiting');

    expect(
      screen.getByText('다른 플레이어를 기다리고 있습니다.'),
    ).toBeVisible();

    serverEmit('matchmaking:matched', playerOneMatch);

    expect(screen.getByText('게임 테이블을 준비하고 있습니다.')).toBeVisible();
    expect(screen.queryByText(/Room:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seat:/)).not.toBeInTheDocument();
  });
});

describe('game state', () => {
  it('renders dealer, opponent, and self when game:state is received', () => {
    renderMatched();

    serverEmit('game:state', gameState());

    expect(screen.getByRole('heading', { name: 'Dealer' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Opponent' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Self' })).toBeVisible();
  });

  it.each([
    {
      seat: 'player1',
      selfScore: 11,
      opponentScore: 10,
    },
    {
      seat: 'player2',
      selfScore: 10,
      opponentScore: 11,
    },
  ] as const)(
    'maps $seat to self and opponent',
    ({ seat, selfScore, opponentScore }) => {
      renderMatched({ ...playerOneMatch, seat });

      serverEmit('game:state', gameState());

      const self = screen.getByRole('heading', { name: 'Self' }).parentElement!;
      const opponent = screen.getByRole('heading', {
        name: 'Opponent',
      }).parentElement!;
      expect(within(self).getByText(`Score: ${selfScore}`)).toBeVisible();
      expect(
        within(opponent).getByText(`Score: ${opponentScore}`),
      ).toBeVisible();
    },
  );

  it('keeps the dealer score unknown while the hole card is hidden', () => {
    renderMatched();

    serverEmit('game:state', gameState());

    const dealer = screen.getByRole('heading', {
      name: 'Dealer',
    }).parentElement!;
    expect(within(dealer).getByText('Dealer score: ?')).toBeVisible();
    expect(dealer).not.toHaveTextContent('undefined');
  });
});

describe('3D game table', () => {
  it('does not render before the first game state arrives', () => {
    renderMatched();

    expect(screen.queryByTestId('game-table-scene')).not.toBeInTheDocument();
    expect(gameTableSceneMock).not.toHaveBeenCalled();
  });

  it('renders when a matched game state arrives', () => {
    renderMatched();

    serverEmit('game:state', gameState());

    expect(screen.getByTestId('game-table-scene')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Realtime Blackjack' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('passes the current matched seat as selfSeat', () => {
    renderMatched({ ...playerOneMatch, seat: 'player2' });

    serverEmit('game:state', gameState());

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ selfSeat: 'player2' }),
    );
  });

  it('passes the latest game state to the scene', () => {
    renderMatched();
    const initialState = gameState();
    const latestState = gameState({
      player1: {
        ...initialState.player1,
        hand: [...initialState.player1.hand, { rank: '6', suit: 'diamonds' }],
        score: 17,
      },
    });

    serverEmit('game:state', initialState);
    serverEmit('game:state', latestState);

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ gameState: latestState }),
    );
  });

  it('starts the first game state at animation round zero', () => {
    renderMatched();

    serverEmit('game:state', gameState());

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 0 }),
    );
  });

  it('keeps the animation round when a hand grows in the same round', () => {
    renderMatched();
    const initialState = gameState();
    serverEmit('game:state', initialState);

    serverEmit(
      'game:state',
      gameState({
        player1: {
          ...initialState.player1,
          hand: [...initialState.player1.hand, { rank: '6', suit: 'diamonds' }],
        },
      }),
    );

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 0 }),
    );
  });

  it('increments the animation round for the next state after both accept', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    serverEmit('rematch:state', {
      roomId: 'game:test-room',
      player1Accepted: true,
      player2Accepted: true,
    });

    serverEmit('game:state', gameState());

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 1 }),
    );

    serverEmit('game:state', gameState({ phase: 'finished' }));
    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 1 }),
    );
  });

  it('increments once when an accepted rematch immediately finishes', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));

    serverEmit('rematch:state', {
      roomId: 'game:test-room',
      player1Accepted: true,
      player2Accepted: true,
    });
    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 0 }),
    );

    serverEmit(
      'game:state',
      gameState({
        phase: 'finished',
        player1: {
          ...gameState().player1,
          result: 'push',
        },
      }),
    );

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 1 }),
    );
  });

  it('resets the animation round for a new match lifecycle', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    serverEmit('rematch:state', {
      roomId: 'game:test-room',
      player1Accepted: true,
      player2Accepted: true,
    });
    serverEmit('game:state', gameState());
    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 1 }),
    );

    serverEmit('matchmaking:matched', {
      roomId: 'game:new-room',
      seat: 'player2',
    });
    serverEmit('game:state', gameState({ roomId: 'game:new-room' }));

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 0 }),
    );
  });

  it.each([
    {
      lifecycle: 'waiting',
      trigger: () => serverEmit('matchmaking:waiting'),
    },
    {
      lifecycle: 'matched',
      trigger: () =>
        serverEmit('matchmaking:matched', {
          roomId: 'game:replacement',
          seat: 'player2',
        }),
    },
    {
      lifecycle: 'opponent disconnected',
      trigger: () =>
        serverEmit('game:opponent-disconnected', {
          roomId: 'game:test-room',
        }),
    },
    {
      lifecycle: 'opponent left',
      trigger: () =>
        serverEmit('matchmaking:opponent-left', {
          roomId: 'game:test-room',
        }),
    },
    {
      lifecycle: 'self disconnected',
      trigger: () => act(() => socketMock.serverEmit('disconnect')),
    },
  ])('clears a pending animation round on $lifecycle', ({ trigger }) => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    serverEmit('rematch:state', {
      roomId: 'game:test-room',
      player1Accepted: true,
      player2Accepted: true,
    });

    trigger();
    serverEmit('matchmaking:matched', {
      roomId: 'game:after-reset',
      seat: 'player1',
    });
    serverEmit('game:state', gameState({ roomId: 'game:after-reset' }));

    expect(gameTableSceneMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ animationRound: 0 }),
    );
  });

  it('passes canAct and action callbacks that preserve socket intents', () => {
    renderMatched();
    serverEmit('game:state', gameState());

    let sceneProps = gameTableSceneMock.mock.calls.at(
      -1,
    )?.[0] as GameTableHudProps;
    expect(sceneProps.canAct).toBe(true);
    act(() => sceneProps.onHit());
    expect(socketMock.emit).toHaveBeenCalledWith('player:hit');

    serverEmit('game:state', gameState());
    sceneProps = gameTableSceneMock.mock.calls.at(-1)?.[0] as GameTableHudProps;
    act(() => sceneProps.onStand());
    expect(socketMock.emit).toHaveBeenCalledWith('player:stand');
  });

  it('passes chat state and callbacks to the scene', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('chat:message', {
      roomId: 'game:test-room',
      sender: 'player2',
      text: 'HUD에서 만나요',
    });

    let sceneProps = gameTableSceneMock.mock.calls.at(
      -1,
    )?.[0] as GameTableHudProps;
    expect(sceneProps.chatMessages).toEqual([
      expect.objectContaining({ text: 'HUD에서 만나요' }),
    ]);
    act(() => sceneProps.onChatInputChange('답장'));
    sceneProps = gameTableSceneMock.mock.calls.at(-1)?.[0] as GameTableHudProps;
    expect(sceneProps.chatInput).toBe('답장');
    expect(sceneProps.onChatSubmit).toEqual(expect.any(Function));
  });

  it('passes timer information to the scene', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('turn:timer', {
      roomId: 'game:test-room',
      player: 'player1',
      durationMs: 30_000,
    });

    const sceneProps = gameTableSceneMock.mock.calls.at(
      -1,
    )?.[0] as GameTableHudProps;
    expect(sceneProps.turnTimer).toEqual(
      expect.objectContaining({ player: 'player1', durationMs: 30_000 }),
    );
    expect(sceneProps.turnTimerSeconds).toBe(30);
  });

  it('passes finished choice state and callbacks to the scene', () => {
    renderMatched();
    const finishedState = gameState({
      phase: 'finished',
      player1: { ...gameState().player1, result: 'win' },
    });
    serverEmit('game:state', finishedState);

    const sceneProps = gameTableSceneMock.mock.calls.at(
      -1,
    )?.[0] as GameTableHudProps;
    expect(sceneProps).toEqual(
      expect.objectContaining({
        rematchPending: false,
        newOpponentPending: false,
        selfAccepted: false,
        opponentAccepted: false,
        onRematch: expect.any(Function),
        onNewOpponent: expect.any(Function),
      }),
    );
  });
});

describe('turn controls', () => {
  it.each([
    { phase: 'player1', enabled: true },
    { phase: 'player2', enabled: false },
  ] as const)(
    'sets action availability from phase $phase',
    ({ phase, enabled }) => {
      renderMatched();
      serverEmit('game:state', gameState({ phase }));

      const hit = screen.getByRole('button', { name: 'Hit' });
      const stand = screen.getByRole('button', { name: 'Stand' });
      if (enabled) {
        expect(hit).toBeEnabled();
        expect(stand).toBeEnabled();
      } else {
        expect(hit).toBeDisabled();
        expect(stand).toBeDisabled();
      }
    },
  );

  it.each([
    { button: 'Hit', event: 'player:hit' },
    { button: 'Stand', event: 'player:stand' },
  ] as const)(
    'emits $event once when $button is clicked',
    ({ button, event }) => {
      renderMatched();
      serverEmit('game:state', gameState());
      socketMock.emit.mockClear();

      fireEvent.click(screen.getByRole('button', { name: button }));

      expect(socketMock.emit).toHaveBeenCalledTimes(1);
      expect(socketMock.emit).toHaveBeenCalledWith(event);
    },
  );

  it('prevents duplicate actions until the next game state arrives', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    socketMock.emit.mockClear();
    const hit = screen.getByRole('button', { name: 'Hit' });
    const stand = screen.getByRole('button', { name: 'Stand' });

    fireEvent.click(hit);
    fireEvent.click(hit);

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(hit).toBeDisabled();
    expect(stand).toBeDisabled();

    serverEmit('game:state', gameState());

    expect(hit).toBeEnabled();
    expect(stand).toBeEnabled();
  });
});

describe('action rejection', () => {
  it.each([
    ['not_in_game', '진행 중인 게임이 없습니다.'],
    ['not_your_turn', '현재 내 차례가 아닙니다.'],
    ['game_finished', '이미 종료된 게임입니다.'],
    ['game_unavailable', '게임을 사용할 수 없습니다.'],
  ] satisfies Array<[GameActionRejectedPayload['reason'], string]>)(
    'shows a message for %s',
    (reason, message) => {
      renderMatched();
      serverEmit('game:state', gameState());

      serverEmit('game:action-rejected', { action: 'hit', reason });

      expect(screen.getByRole('alert')).toHaveTextContent(message);
    },
  );

  it('clears pending when an action is rejected', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    fireEvent.click(screen.getByRole('button', { name: 'Hit' }));

    serverEmit('game:action-rejected', {
      action: 'hit',
      reason: 'not_your_turn',
    });

    expect(screen.getByRole('button', { name: 'Hit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stand' })).toBeEnabled();
  });
});

describe('finished game', () => {
  it.each([
    ['win', '승리'],
    ['lose', '패배'],
    ['push', '무승부'],
  ] as const)('shows the self %s result as %s', (result, label) => {
    renderMatched();
    const baseState = gameState();

    serverEmit(
      'game:state',
      gameState({
        phase: 'finished',
        player1: { ...baseState.player1, result },
        dealer: {
          hand: [
            { rank: '10', suit: 'hearts' },
            { rank: 'K', suit: 'clubs' },
          ],
          score: 20,
        },
      }),
    );

    const self = screen.getByRole('heading', { name: 'Self' }).parentElement!;
    const dealer = screen.getByRole('heading', {
      name: 'Dealer',
    }).parentElement!;
    expect(within(self).getByText(`Result: ${label}`)).toBeVisible();
    expect(within(dealer).getByText('Dealer score: 20')).toBeVisible();
    expect(
      (gameTableSceneMock.mock.calls.at(-1)?.[0] as GameTableHudProps).gameState
        .dealer.hand,
    ).toEqual([
      { rank: '10', suit: 'hearts' },
      { rank: 'K', suit: 'clubs' },
    ]);
    expect(
      screen.queryByRole('button', { name: 'Hit' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Stand' }),
    ).not.toBeInTheDocument();
  });
});

describe('rematch', () => {
  it('shows the rematch button only after the game finishes', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    expect(
      screen.queryByRole('button', { name: '재대결' }),
    ).not.toBeInTheDocument();
    const current = gameState();

    serverEmit(
      'game:state',
      gameState({
        phase: 'finished',
        player1: { ...current.player1, result: 'win' },
      }),
    );

    expect(screen.getByRole('button', { name: '재대결' })).toBeEnabled();
  });

  it('emits one acceptance and prevents a fast duplicate click', () => {
    renderMatched();
    const current = gameState();
    serverEmit(
      'game:state',
      gameState({ phase: 'finished', player1: current.player1 }),
    );
    socketMock.emit.mockClear();
    const rematchButton = screen.getByRole('button', { name: '재대결' });

    fireEvent.click(rematchButton);
    fireEvent.click(rematchButton);

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith('rematch:accept');
    expect(rematchButton).toBeDisabled();
  });

  it.each([
    {
      seat: 'player1',
      payload: { player1Accepted: true, player2Accepted: false },
    },
    {
      seat: 'player2',
      payload: { player1Accepted: false, player2Accepted: true },
    },
  ] as const)('shows self acceptance for $seat', ({ seat, payload }) => {
    renderMatched({ ...playerOneMatch, seat });
    const current = gameState();
    serverEmit(
      'game:state',
      gameState({ phase: 'finished', player1: current.player1 }),
    );

    serverEmit('rematch:state', { roomId: playerOneMatch.roomId, ...payload });

    expect(screen.getByText('재대결 요청 완료')).toBeVisible();
    expect(
      screen.getByText('상대 플레이어의 선택을 기다리고 있습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '재대결' })).toBeDisabled();
  });

  it.each([
    {
      seat: 'player1',
      payload: { player1Accepted: false, player2Accepted: true },
    },
    {
      seat: 'player2',
      payload: { player1Accepted: true, player2Accepted: false },
    },
  ] as const)('shows opponent acceptance for $seat', ({ seat, payload }) => {
    renderMatched({ ...playerOneMatch, seat });
    const current = gameState();
    serverEmit(
      'game:state',
      gameState({ phase: 'finished', player1: current.player1 }),
    );

    serverEmit('rematch:state', { roomId: playerOneMatch.roomId, ...payload });

    expect(
      screen.getByText('상대 플레이어가 재대결을 요청했습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '재대결' })).toBeEnabled();
  });

  it('clears the previous rematch state on every new game state', () => {
    renderMatched();
    const current = gameState();
    const finished = gameState({ phase: 'finished', player1: current.player1 });
    serverEmit('game:state', finished);
    serverEmit('rematch:state', {
      roomId: playerOneMatch.roomId,
      player1Accepted: true,
      player2Accepted: false,
    });
    expect(screen.getByText('재대결 요청 완료')).toBeVisible();

    serverEmit('game:state', { ...finished, dealer: { ...finished.dealer } });

    expect(screen.queryByText('재대결 요청 완료')).not.toBeInTheDocument();
    expect(
      screen.queryByText('상대 플레이어의 선택을 기다리고 있습니다.'),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '재대결' })).toBeEnabled();
  });

  it('keeps the game scene while returning to normal round controls', () => {
    renderMatched();
    const current = gameState();
    serverEmit(
      'game:state',
      gameState({ phase: 'finished', player1: current.player1 }),
    );
    serverEmit('rematch:state', {
      roomId: playerOneMatch.roomId,
      player1Accepted: true,
      player2Accepted: true,
    });

    serverEmit('game:state', gameState({ phase: 'player1' }));

    expect(screen.getByTestId('game-table-scene')).toBeVisible();
    expect(screen.queryByText(/Room:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Seat:/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '재대결' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stand' })).toBeEnabled();
  });
});

describe('new opponent', () => {
  it('shows the control only for a finished game', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    expect(
      screen.queryByRole('button', { name: '새 상대 찾기' }),
    ).not.toBeInTheDocument();

    serverEmit('game:state', gameState({ phase: 'finished' }));

    expect(screen.getByRole('button', { name: '재대결' })).toBeVisible();
    expect(screen.getByRole('button', { name: '새 상대 찾기' })).toBeEnabled();
  });

  it('emits once, prevents duplicate clicks, and disables rematch', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    socketMock.emit.mockClear();
    const newOpponent = screen.getByRole('button', { name: '새 상대 찾기' });

    fireEvent.click(newOpponent);
    fireEvent.click(newOpponent);

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith('matchmaking:new-opponent');
    expect(newOpponent).toBeDisabled();
    expect(screen.getByRole('button', { name: '재대결' })).toBeDisabled();
  });

  it('disables new opponent while a rematch request is pending', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));

    fireEvent.click(screen.getByRole('button', { name: '재대결' }));

    expect(screen.getByRole('button', { name: '새 상대 찾기' })).toBeDisabled();

    serverEmit('rematch:state', {
      roomId: playerOneMatch.roomId,
      player1Accepted: true,
      player2Accepted: false,
    });

    expect(screen.getByRole('button', { name: '새 상대 찾기' })).toBeEnabled();
  });

  it('clears the old game and rematch UI when waiting', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    serverEmit('rematch:state', {
      roomId: playerOneMatch.roomId,
      player1Accepted: true,
      player2Accepted: false,
    });

    serverEmit('matchmaking:waiting');

    expect(
      screen.getByText('다른 플레이어를 기다리고 있습니다.'),
    ).toBeVisible();
    expect(screen.queryByText('Room: game:test-room')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Dealer' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('재대결 요청 완료')).not.toBeInTheDocument();
  });

  it('clears the old game before a new matched state arrives', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));

    serverEmit('matchmaking:matched', {
      roomId: 'game:new-room',
      seat: 'player2',
    });

    expect(screen.getByText('게임 테이블을 준비하고 있습니다.')).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Dealer' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('A♠')).not.toBeInTheDocument();
  });

  it('returns the old opponent to idle with a notice and keeps the socket connected', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));

    serverEmit('matchmaking:opponent-left', { roomId: playerOneMatch.roomId });

    expect(screen.queryByText('Room: game:test-room')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Dealer' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('상대 플레이어가 새 상대 찾기를 선택했습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      '서버에 연결되었습니다.',
    );
  });

  it('clears the opponent-left notice when starting matchmaking again', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    serverEmit('matchmaking:opponent-left', { roomId: playerOneMatch.roomId });
    socketMock.emit.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '게임 시작' }));

    expect(socketMock.emit).toHaveBeenCalledWith('matchmaking:join');
    expect(
      screen.queryByText('상대 플레이어가 새 상대 찾기를 선택했습니다.'),
    ).not.toBeInTheDocument();
  });

  it.each(['disconnect', 'game:opponent-disconnected'] as const)(
    'clears pending after %s',
    (event) => {
      renderMatched();
      serverEmit('game:state', gameState({ phase: 'finished' }));
      fireEvent.click(screen.getByRole('button', { name: '새 상대 찾기' }));

      if (event === 'disconnect') {
        socketMock.connected = false;
        act(() => socketMock.serverEmit('disconnect', 'transport close'));
        socketMock.connected = true;
        act(() => socketMock.serverEmit('connect'));
      } else {
        serverEmit('game:opponent-disconnected', {
          roomId: playerOneMatch.roomId,
        });
      }
      serverEmit('matchmaking:matched', playerOneMatch);
      serverEmit('game:state', gameState({ phase: 'finished' }));

      expect(
        screen.getByRole('button', { name: '새 상대 찾기' }),
      ).toBeEnabled();
    },
  );
});

describe('turn timer', () => {
  it.each([
    { player: 'player1', label: '내 턴 남은 시간: 30초' },
    { player: 'player2', label: '상대 턴 남은 시간: 30초' },
  ] as const)('shows $label for $player', ({ player, label }) => {
    renderMatched();
    serverEmit('game:state', gameState());

    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player,
      durationMs: 30_000,
    });

    expect(screen.getByText(label)).toBeVisible();
  });

  it('counts down from durationMs using the local display clock', () => {
    vi.useFakeTimers();
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player: 'player1',
      durationMs: 30_000,
    });

    act(() => vi.advanceTimersByTime(1_100));

    expect(screen.getByText('내 턴 남은 시간: 29초')).toBeVisible();
  });

  it('ignores a timer from another room', () => {
    renderMatched();
    serverEmit('game:state', gameState());

    serverEmit('turn:timer', {
      roomId: 'game:old-room',
      player: 'player1',
      durationMs: 30_000,
    });

    expect(screen.queryByText(/턴 남은 시간/)).not.toBeInTheDocument();
  });

  it('clears an old timer on game state and shows the following new timer', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player: 'player1',
      durationMs: 30_000,
    });
    expect(screen.getByText('내 턴 남은 시간: 30초')).toBeVisible();

    serverEmit('game:state', gameState({ phase: 'player2' }));
    expect(screen.queryByText(/턴 남은 시간/)).not.toBeInTheDocument();

    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player: 'player2',
      durationMs: 30_000,
    });
    expect(screen.getByText('상대 턴 남은 시간: 30초')).toBeVisible();
  });

  it('shows zero without emitting player:stand from the client', () => {
    vi.useFakeTimers();
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player: 'player1',
      durationMs: 1_000,
    });
    socketMock.emit.mockClear();

    act(() => vi.advanceTimersByTime(1_500));

    expect(screen.getByText('내 턴 남은 시간: 0초')).toBeVisible();
    expect(socketMock.emit).not.toHaveBeenCalledWith('player:stand');
  });

  it('keeps the timer when an action is rejected', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player: 'player1',
      durationMs: 30_000,
    });

    serverEmit('game:action-rejected', {
      action: 'hit',
      reason: 'not_your_turn',
    });

    expect(screen.getByText('내 턴 남은 시간: 30초')).toBeVisible();
  });

  it.each([
    {
      lifecycle: 'matchmaking:waiting',
      trigger: () => serverEmit('matchmaking:waiting'),
    },
    {
      lifecycle: 'new matchmaking:matched',
      trigger: () =>
        serverEmit('matchmaking:matched', {
          roomId: 'game:new-room',
          seat: 'player2',
        }),
    },
    {
      lifecycle: 'matchmaking:opponent-left',
      trigger: () =>
        serverEmit('matchmaking:opponent-left', {
          roomId: playerOneMatch.roomId,
        }),
    },
    {
      lifecycle: 'game:opponent-disconnected',
      trigger: () =>
        serverEmit('game:opponent-disconnected', {
          roomId: playerOneMatch.roomId,
        }),
    },
    {
      lifecycle: 'self disconnect',
      trigger: () => {
        socketMock.connected = false;
        act(() => socketMock.serverEmit('disconnect', 'transport close'));
      },
    },
  ])('removes the timer on $lifecycle', ({ trigger }) => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player: 'player1',
      durationMs: 30_000,
    });
    expect(screen.getByText(/턴 남은 시간/)).toBeVisible();

    trigger();

    expect(screen.queryByText(/턴 남은 시간/)).not.toBeInTheDocument();
  });

  it('uses the new rematch timer while keeping chat messages', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    serverEmit('chat:message', {
      roomId: playerOneMatch.roomId,
      sender: 'player2',
      text: '한 판 더?',
    });

    serverEmit('game:state', gameState({ phase: 'player2' }));
    serverEmit('turn:timer', {
      roomId: playerOneMatch.roomId,
      player: 'player2',
      durationMs: 30_000,
    });

    expect(screen.getByText('상대 턴 남은 시간: 30초')).toBeVisible();
    expect(screen.getByText('Opponent: 한 판 더?')).toBeVisible();
  });
});

describe('room chat', () => {
  it('shows chat controls only inside a matched game', () => {
    renderMatched();
    expect(
      screen.queryByRole('heading', { name: 'Chat' }),
    ).not.toBeInTheDocument();

    serverEmit('game:state', gameState());

    expect(screen.getByRole('heading', { name: 'Chat' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: '메시지' })).toHaveAttribute(
      'maxlength',
      '200',
    );
    expect(screen.getByRole('button', { name: '전송' })).toBeVisible();
  });

  it('sends text exactly once, clears the input, and does not append optimistically', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    socketMock.emit.mockClear();
    const input = screen.getByRole('textbox', { name: '메시지' });

    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith('chat:send', {
      text: '안녕하세요',
    });
    expect(input).toHaveValue('');
    expect(screen.queryByText('Self: 안녕하세요')).not.toBeInTheDocument();
  });

  it('does not send whitespace-only input', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    socketMock.emit.mockClear();

    fireEvent.change(screen.getByRole('textbox', { name: '메시지' }), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '전송' }));

    expect(socketMock.emit).not.toHaveBeenCalled();
  });

  it('appends canonical server messages with Self and Opponent labels', () => {
    renderMatched();
    serverEmit('game:state', gameState());

    serverEmit('chat:message', {
      roomId: playerOneMatch.roomId,
      sender: 'player1',
      text: '안녕하세요',
    });
    serverEmit('chat:message', {
      roomId: playerOneMatch.roomId,
      sender: 'player2',
      text: '반갑습니다',
    });

    expect(screen.getByText('Self: 안녕하세요')).toBeVisible();
    expect(screen.getByText('Opponent: 반갑습니다')).toBeVisible();
  });

  it('ignores a late message from another room', () => {
    renderMatched();
    serverEmit('game:state', gameState());

    serverEmit('chat:message', {
      roomId: 'game:old-room',
      sender: 'player1',
      text: 'old message',
    });

    expect(screen.queryByText(/old message/)).not.toBeInTheDocument();
  });

  it('keeps messages when a rematch game state starts in the same room', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));
    serverEmit('chat:message', {
      roomId: playerOneMatch.roomId,
      sender: 'player2',
      text: '한 판 더?',
    });

    serverEmit('game:state', gameState({ phase: 'player2' }));

    expect(screen.getByText('Opponent: 한 판 더?')).toBeVisible();
  });

  it.each([
    {
      lifecycle: 'matchmaking:waiting',
      trigger: () => serverEmit('matchmaking:waiting'),
    },
    {
      lifecycle: 'new matchmaking:matched',
      trigger: () =>
        serverEmit('matchmaking:matched', {
          roomId: 'game:new-room',
          seat: 'player2',
        }),
    },
    {
      lifecycle: 'matchmaking:opponent-left',
      trigger: () =>
        serverEmit('matchmaking:opponent-left', {
          roomId: playerOneMatch.roomId,
        }),
    },
    {
      lifecycle: 'game:opponent-disconnected',
      trigger: () =>
        serverEmit('game:opponent-disconnected', {
          roomId: playerOneMatch.roomId,
        }),
    },
    {
      lifecycle: 'self disconnect',
      trigger: () => {
        socketMock.connected = false;
        act(() => socketMock.serverEmit('disconnect', 'transport close'));
      },
    },
  ])('clears messages and input on $lifecycle', ({ trigger }) => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('chat:message', {
      roomId: playerOneMatch.roomId,
      sender: 'player1',
      text: 'remove me',
    });
    fireEvent.change(screen.getByRole('textbox', { name: '메시지' }), {
      target: { value: 'draft' },
    });
    expect(screen.getByText('Self: remove me')).toBeVisible();

    trigger();

    expect(screen.queryByText('Self: remove me')).not.toBeInTheDocument();

    if (screen.queryByRole('textbox', { name: '메시지' })) {
      expect(screen.getByRole('textbox', { name: '메시지' })).toHaveValue('');
    }
  });
});

describe('disconnect', () => {
  it('clears match, game state, pending action, and action error', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    fireEvent.click(screen.getByRole('button', { name: 'Hit' }));
    serverEmit('game:action-rejected', {
      action: 'hit',
      reason: 'not_your_turn',
    });
    expect(screen.getByRole('alert')).toBeVisible();

    socketMock.connected = false;
    act(() => socketMock.serverEmit('disconnect', 'transport close'));

    expect(screen.getByRole('status')).toHaveTextContent(
      '연결이 끊어졌습니다. 자동으로 다시 연결을 시도하고 있습니다.',
    );
    expect(screen.queryByText('Room: game:test-room')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Dealer' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    socketMock.connected = true;
    act(() => socketMock.serverEmit('connect'));
    serverEmit('matchmaking:matched', playerOneMatch);

    expect(
      screen.queryByRole('heading', { name: 'Dealer' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('resets the game and shows a message when the opponent disconnects', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('game:action-rejected', {
      action: 'hit',
      reason: 'not_your_turn',
    });

    serverEmit('game:opponent-disconnected', { roomId: playerOneMatch.roomId });

    expect(screen.queryByText('Room: game:test-room')).not.toBeInTheDocument();
    expect(screen.queryByText('Seat: player1')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Dealer' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByText('상대 플레이어의 연결이 종료되었습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled();
    expect(screen.getByRole('status')).toHaveTextContent(
      '서버에 연결되었습니다.',
    );
  });

  it('allows matchmaking again and clears the opponent disconnect message', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    serverEmit('game:opponent-disconnected', { roomId: playerOneMatch.roomId });
    socketMock.emit.mockClear();

    fireEvent.click(screen.getByRole('button', { name: '게임 시작' }));

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith('matchmaking:join');
    expect(
      screen.queryByText('상대 플레이어의 연결이 종료되었습니다.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '상대 찾는 중...' }),
    ).toBeDisabled();
  });

  it.each(['opponent', 'self'] as const)(
    'clears rematch UI when the %s disconnects',
    (disconnectedParty) => {
      renderMatched();
      const current = gameState();
      serverEmit(
        'game:state',
        gameState({ phase: 'finished', player1: current.player1 }),
      );
      fireEvent.click(screen.getByRole('button', { name: '재대결' }));
      serverEmit('rematch:state', {
        roomId: playerOneMatch.roomId,
        player1Accepted: true,
        player2Accepted: false,
      });
      expect(screen.getByText('재대결 요청 완료')).toBeVisible();

      if (disconnectedParty === 'opponent') {
        serverEmit('game:opponent-disconnected', {
          roomId: playerOneMatch.roomId,
        });
      } else {
        socketMock.connected = false;
        act(() => socketMock.serverEmit('disconnect', 'transport close'));
      }

      expect(screen.queryByText('재대결 요청 완료')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: '재대결' }),
      ).not.toBeInTheDocument();
    },
  );
});
