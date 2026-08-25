import type { GameStatePayload } from '@blackjack/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GameTableHud, type GameTableHudProps } from './GameTableHud';

function gameState(overrides: Partial<GameStatePayload> = {}): GameStatePayload {
  return {
    roomId: 'game:hud-test',
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

function props(overrides: Partial<GameTableHudProps> = {}): GameTableHudProps {
  return {
    gameState: gameState(),
    selfSeat: 'player1',
    canAct: true,
    turnTimer: null,
    turnTimerSeconds: 0,
    chatInput: '',
    chatMessages: [],
    rematchPending: false,
    newOpponentPending: false,
    selfAccepted: false,
    opponentAccepted: false,
    actionError: null,
    onHit: vi.fn(),
    onStand: vi.fn(),
    onChatInputChange: vi.fn(),
    onChatSubmit: vi.fn((event) => event.preventDefault()),
    onRematch: vi.fn(),
    onNewOpponent: vi.fn(),
    ...overrides,
  };
}

afterEach(cleanup);

describe('GameTableHud', () => {
  it('shows action controls and uses canAct for availability', () => {
    const hudProps = props({ canAct: false });
    render(<GameTableHud {...hudProps} />);

    expect(screen.getByRole('button', { name: 'Hit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stand' })).toBeDisabled();

    cleanup();
    render(<GameTableHud {...props()} />);
    expect(screen.getByRole('button', { name: 'Hit' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Stand' })).toBeEnabled();
  });

  it('calls the supplied hit and stand callbacks', () => {
    const hudProps = props();
    render(<GameTableHud {...hudProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Hit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stand' }));

    expect(hudProps.onHit).toHaveBeenCalledOnce();
    expect(hudProps.onStand).toHaveBeenCalledOnce();
  });

  it('shows timer meaning for self and opponent', () => {
    const { rerender } = render(
      <GameTableHud
        {...props({
          turnTimer: { roomId: 'game:hud-test', player: 'player1', durationMs: 30_000 },
          turnTimerSeconds: 18,
        })}
      />,
    );
    expect(screen.getByText('내 턴 남은 시간: 18초')).toBeVisible();

    rerender(
      <GameTableHud
        {...props({
          turnTimer: { roomId: 'game:hud-test', player: 'player2', durationMs: 30_000 },
          turnTimerSeconds: 17,
        })}
      />,
    );
    expect(screen.getByText('상대 턴 남은 시간: 17초')).toBeVisible();
  });

  it('renders canonical chat labels and forwards chat input changes', () => {
    const hudProps = props({
      chatMessages: [
        { roomId: 'game:hud-test', sender: 'player1', text: '안녕하세요' },
        { roomId: 'game:hud-test', sender: 'player2', text: '반갑습니다' },
      ],
    });
    render(<GameTableHud {...hudProps} />);

    expect(screen.getByText('Self: 안녕하세요')).toBeVisible();
    expect(screen.getByText('Opponent: 반갑습니다')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: '메시지' }), {
      target: { value: '새 메시지' },
    });
    expect(hudProps.onChatInputChange).toHaveBeenCalledWith('새 메시지');
  });

  it.each([
    ['win', '승리'],
    ['lose', '패배'],
    ['push', '무승부'],
  ] as const)('shows the finished %s result in the overlay', (result, label) => {
    const state = gameState({
      phase: 'finished',
      player1: { ...gameState().player1, result },
    });
    render(<GameTableHud {...props({ gameState: state })} />);

    expect(screen.getByRole('dialog', { name: '게임 결과' })).toBeVisible();
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Hit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: '메시지' })).not.toBeInTheDocument();
  });

  it('shows rematch states inside the finished panel', () => {
    const state = gameState({
      phase: 'finished',
      player1: { ...gameState().player1, result: 'win' },
    });
    const { rerender } = render(
      <GameTableHud {...props({ gameState: state, selfAccepted: true })} />,
    );
    expect(screen.getByText('재대결 요청 완료')).toBeVisible();

    rerender(
      <GameTableHud {...props({ gameState: state, opponentAccepted: true })} />,
    );
    expect(screen.getByText('상대 플레이어가 재대결을 요청했습니다.')).toBeVisible();
  });

  it('calls the finished choice callbacks', () => {
    const state = gameState({
      phase: 'finished',
      player1: { ...gameState().player1, result: 'push' },
    });
    const hudProps = props({ gameState: state });
    render(<GameTableHud {...hudProps} />);

    fireEvent.click(screen.getByRole('button', { name: '재대결' }));
    fireEvent.click(screen.getByRole('button', { name: '새 상대 찾기' }));

    expect(hudProps.onRematch).toHaveBeenCalledOnce();
    expect(hudProps.onNewOpponent).toHaveBeenCalledOnce();
  });
});
