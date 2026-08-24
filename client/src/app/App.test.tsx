import type {
  GameActionRejectedPayload,
  GameStatePayload,
  MatchmakingMatchedPayload,
  ServerToClientEvents,
} from '@blackjack/shared';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { socketMock, handlers } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Set<Handler>>();
  const socketMock = {
    connected: true,
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
    connect: vi.fn(() => socketMock),
    disconnect: vi.fn(() => socketMock),
    serverEmit(event: string, payload?: unknown) {
      handlers.get(event)?.forEach((handler) => handler(payload));
    },
  };
  return { socketMock, handlers };
});

vi.mock('../shared/api/socket', () => ({ socket: socketMock }));

import { App } from './App';

const playerOneMatch: MatchmakingMatchedPayload = {
  roomId: 'game:test-room',
  seat: 'player1',
};

function gameState(overrides: Partial<GameStatePayload> = {}): GameStatePayload {
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
  vi.clearAllMocks();
});

afterEach(() => cleanup());

describe('matchmaking', () => {
  it('keeps the existing start button behavior', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: '게임 시작' }));

    expect(socketMock.emit).toHaveBeenCalledWith('matchmaking:join');
    expect(screen.getByRole('button', { name: '상대 찾는 중...' })).toBeDisabled();
  });

  it('shows waiting, room, and seat information', () => {
    render(<App />);
    serverEmit('matchmaking:waiting');

    expect(screen.getByText('다른 플레이어를 기다리고 있습니다.')).toBeVisible();

    serverEmit('matchmaking:matched', playerOneMatch);

    expect(screen.getByText('Room: game:test-room')).toBeVisible();
    expect(screen.getByText('Seat: player1')).toBeVisible();
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
      selfCard: 'A♠',
      opponentCard: 'K♣',
    },
    {
      seat: 'player2',
      selfCard: 'K♣',
      opponentCard: 'A♠',
    },
  ] as const)('maps $seat to self and opponent', ({ seat, selfCard, opponentCard }) => {
    renderMatched({ ...playerOneMatch, seat });

    serverEmit('game:state', gameState());

    const self = screen.getByRole('heading', { name: 'Self' }).parentElement!;
    const opponent = screen.getByRole('heading', { name: 'Opponent' }).parentElement!;
    expect(within(self).getByText(selfCard)).toBeVisible();
    expect(within(opponent).getByText(opponentCard)).toBeVisible();
  });

  it('renders the dealer hole card as Hidden and does not infer a score', () => {
    renderMatched();

    serverEmit('game:state', gameState());

    const dealer = screen.getByRole('heading', { name: 'Dealer' }).parentElement!;
    expect(within(dealer).getByText('10♥')).toBeVisible();
    expect(within(dealer).getByText('Hidden')).toBeVisible();
    expect(within(dealer).getByText('Dealer score: ?')).toBeVisible();
    expect(dealer).not.toHaveTextContent('undefined');
  });
});

describe('turn controls', () => {
  it.each([
    { phase: 'player1', enabled: true },
    { phase: 'player2', enabled: false },
  ] as const)('sets action availability from phase $phase', ({ phase, enabled }) => {
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
  });

  it.each([
    { button: 'Hit', event: 'player:hit' },
    { button: 'Stand', event: 'player:stand' },
  ] as const)('emits $event once when $button is clicked', ({ button, event }) => {
    renderMatched();
    serverEmit('game:state', gameState());
    socketMock.emit.mockClear();

    fireEvent.click(screen.getByRole('button', { name: button }));

    expect(socketMock.emit).toHaveBeenCalledTimes(1);
    expect(socketMock.emit).toHaveBeenCalledWith(event);
  });

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
  ] satisfies Array<[GameActionRejectedPayload['reason'], string]>) (
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
    const dealer = screen.getByRole('heading', { name: 'Dealer' }).parentElement!;
    expect(within(self).getByText(`Result: ${label}`)).toBeVisible();
    expect(within(dealer).getByText('10♥')).toBeVisible();
    expect(within(dealer).getByText('K♣')).toBeVisible();
    expect(within(dealer).getByText('Dealer score: 20')).toBeVisible();
    expect(within(dealer).queryByText('Hidden')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stand' })).toBeDisabled();
  });
});

describe('rematch', () => {
  it('shows the rematch button only after the game finishes', () => {
    renderMatched();
    serverEmit('game:state', gameState());
    expect(screen.queryByRole('button', { name: '재대결' })).not.toBeInTheDocument();
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
    serverEmit('game:state', gameState({ phase: 'finished', player1: current.player1 }));
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
    serverEmit('game:state', gameState({ phase: 'finished', player1: current.player1 }));

    serverEmit('rematch:state', { roomId: playerOneMatch.roomId, ...payload });

    expect(screen.getByText('재대결 요청 완료')).toBeVisible();
    expect(screen.getByText('상대 플레이어의 선택을 기다리고 있습니다.')).toBeVisible();
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
    serverEmit('game:state', gameState({ phase: 'finished', player1: current.player1 }));

    serverEmit('rematch:state', { roomId: playerOneMatch.roomId, ...payload });

    expect(screen.getByText('상대 플레이어가 재대결을 요청했습니다.')).toBeVisible();
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

  it('keeps room and seat while returning to normal round controls', () => {
    renderMatched();
    const current = gameState();
    serverEmit('game:state', gameState({ phase: 'finished', player1: current.player1 }));
    serverEmit('rematch:state', {
      roomId: playerOneMatch.roomId,
      player1Accepted: true,
      player2Accepted: true,
    });

    serverEmit('game:state', gameState({ phase: 'player1' }));

    expect(screen.getByText('Room: game:test-room')).toBeVisible();
    expect(screen.getByText('Seat: player1')).toBeVisible();
    expect(screen.queryByRole('button', { name: '재대결' })).not.toBeInTheDocument();
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

    expect(screen.getByText('다른 플레이어를 기다리고 있습니다.')).toBeVisible();
    expect(screen.queryByText('Room: game:test-room')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dealer' })).not.toBeInTheDocument();
    expect(screen.queryByText('재대결 요청 완료')).not.toBeInTheDocument();
  });

  it('clears the old game before a new matched state arrives', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));

    serverEmit('matchmaking:matched', {
      roomId: 'game:new-room',
      seat: 'player2',
    });

    expect(screen.getByText('Room: game:new-room')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Dealer' })).not.toBeInTheDocument();
    expect(screen.queryByText('A♠')).not.toBeInTheDocument();
  });

  it('returns the old opponent to idle with a notice and keeps the socket connected', () => {
    renderMatched();
    serverEmit('game:state', gameState({ phase: 'finished' }));

    serverEmit('matchmaking:opponent-left', { roomId: playerOneMatch.roomId });

    expect(screen.queryByText('Room: game:test-room')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dealer' })).not.toBeInTheDocument();
    expect(
      screen.getByText('상대 플레이어가 새 상대 찾기를 선택했습니다.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled();
    expect(screen.getByText('Connected')).toBeVisible();
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
        serverEmit('game:opponent-disconnected', { roomId: playerOneMatch.roomId });
      }
      serverEmit('matchmaking:matched', playerOneMatch);
      serverEmit('game:state', gameState({ phase: 'finished' }));

      expect(screen.getByRole('button', { name: '새 상대 찾기' })).toBeEnabled();
    },
  );
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

    expect(screen.getByText('Disconnected')).toBeVisible();
    expect(screen.queryByText('Room: game:test-room')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dealer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    socketMock.connected = true;
    act(() => socketMock.serverEmit('connect'));
    serverEmit('matchmaking:matched', playerOneMatch);

    expect(screen.queryByRole('heading', { name: 'Dealer' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { name: 'Dealer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('상대 플레이어의 연결이 종료되었습니다.')).toBeVisible();
    expect(screen.getByRole('button', { name: '게임 시작' })).toBeEnabled();
    expect(screen.getByText('Connected')).toBeVisible();
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
    expect(screen.getByRole('button', { name: '상대 찾는 중...' })).toBeDisabled();
  });

  it.each(['opponent', 'self'] as const)(
    'clears rematch UI when the %s disconnects',
    (disconnectedParty) => {
      renderMatched();
      const current = gameState();
      serverEmit('game:state', gameState({ phase: 'finished', player1: current.player1 }));
      fireEvent.click(screen.getByRole('button', { name: '재대결' }));
      serverEmit('rematch:state', {
        roomId: playerOneMatch.roomId,
        player1Accepted: true,
        player2Accepted: false,
      });
      expect(screen.getByText('재대결 요청 완료')).toBeVisible();

      if (disconnectedParty === 'opponent') {
        serverEmit('game:opponent-disconnected', { roomId: playerOneMatch.roomId });
      } else {
        socketMock.connected = false;
        act(() => socketMock.serverEmit('disconnect', 'transport close'));
      }

      expect(screen.queryByText('재대결 요청 완료')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '재대결' })).not.toBeInTheDocument();
    },
  );
});
