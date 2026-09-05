import type {
  ChatMessagePayload,
  GameResult,
  GameStatePayload,
  PlayerSeat,
  PlayerStatus,
  TurnTimerPayload,
} from '@blackjack/shared';
import { type FormEvent, useEffect, useState } from 'react';

import type { GameTableLayoutMode } from '../lib/hudLayout';
import { GameTableChatPanel } from './GameTableChatPanel';

export interface GameTableHudProps {
  gameState: GameStatePayload;
  selfSeat: PlayerSeat;
  canAct: boolean;
  turnTimer: TurnTimerPayload | null;
  turnTimerSeconds: number;
  chatInput: string;
  chatMessages: ChatMessagePayload[];
  rematchPending: boolean;
  newOpponentPending: boolean;
  selfAccepted: boolean;
  opponentAccepted: boolean;
  actionError: string | null;
  dealerSequenceComplete: boolean;
  layoutMode?: GameTableLayoutMode;
  onHit: () => void;
  onStand: () => void;
  onChatInputChange: (value: string) => void;
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRematch: () => void;
  onNewOpponent: () => void;
}

const resultLabels: Record<GameResult, string> = {
  win: '승리',
  lose: '패배',
  push: '무승부',
};

const statusLabels: Record<PlayerStatus, string> = {
  waiting: '차례 대기',
  playing: '플레이 중',
  stood: '스탠드',
  bust: '버스트',
  blackjack: '블랙잭',
  'twenty-one': '21점',
};

const statusPanelBaseClass =
  'rounded-xl border border-border-muted/15 bg-surface/85 text-ink shadow-status-panel backdrop-blur-sm';
const wideStatusPanelClass =
  'min-w-[clamp(164px,8.75vw,216px)] px-[calc(clamp(18px,1vw,24px)+4px)] py-[clamp(18px,1vw,24px)] text-[clamp(18px,0.88vw,22px)] leading-snug';
const compactStatusPanelClass =
  'min-w-[86px] px-3 py-2 text-[11px] leading-tight';
const wideActionButtonClass =
  'min-h-[clamp(68px,3.8vw,80px)] px-[clamp(16px,0.9vw,20px)] text-[clamp(18px,0.88vw,22px)]';
const activeStatusPanelClass = 'border-turn shadow-active-status';
const actionButtonBaseClass =
  'grid min-h-12 grid-cols-[auto_1fr_auto] items-center gap-[clamp(9px,0.7vw,14px)] rounded-lg border border-action-border bg-[linear-gradient(180deg,var(--color-action-top),var(--color-action-bottom))] px-3 py-2.5 text-left text-base font-bold text-action-text shadow-action-button transition-[background-color,background-image,border-color,box-shadow,color,transform] duration-150 hover:enabled:-translate-y-px disabled:opacity-45';
const primaryButtonClass =
  'rounded-lg border border-accent bg-accent px-4 py-2.5 font-bold text-action-ink hover:enabled:border-accent-hover hover:enabled:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass =
  'rounded-lg border border-action-secondary-border/65 bg-surface-button px-4 py-2.5 font-bold text-action-secondary-text hover:enabled:border-action-secondary-border hover:enabled:bg-surface-button-hover disabled:cursor-not-allowed disabled:opacity-50';
const CHAT_PANEL_ID = 'game-table-chat-panel';

function TimerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-full fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
      viewBox="0 0 24 24"
    >
      <path d="M9 2h6M12 2v3M18.2 6.1l1.4-1.4" />
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9v4l2.6 1.7" />
    </svg>
  );
}

function HitIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-full fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
      viewBox="0 0 32 32"
    >
      <rect
        height="19"
        rx="2.5"
        transform="rotate(-12 11 17)"
        width="13"
        x="4.5"
        y="7.5"
      />
      <rect
        height="19"
        rx="2.5"
        transform="rotate(8 20 15)"
        width="13"
        x="13.5"
        y="5.5"
      />
      <path d="M20 10v8M16 14h8" />
    </svg>
  );
}

function StandIcon() {
  return (
    <svg
      aria-hidden="true"
      className="size-full fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
      viewBox="0 0 32 32"
    >
      <path d="M9.5 15V8.5a2 2 0 0 1 4 0V14" />
      <path d="M13.5 14V6.5a2 2 0 0 1 4 0V14" />
      <path d="M17.5 14V7.5a2 2 0 0 1 4 0V15" />
      <path d="M21.5 15v-4.5a2 2 0 0 1 4 0v7.75C25.5 24.2 21.25 28 16 28c-4.1 0-6.7-2.15-8.3-5.1L4.9 17.8a2.15 2.15 0 0 1 3.65-2.25L11 18" />
    </svg>
  );
}

export function GameTableHud({
  gameState,
  selfSeat,
  canAct,
  turnTimer,
  turnTimerSeconds,
  chatInput,
  chatMessages,
  rematchPending,
  newOpponentPending,
  selfAccepted,
  opponentAccepted,
  actionError,
  dealerSequenceComplete,
  layoutMode = 'wide',
  onHit,
  onStand,
  onChatInputChange,
  onChatSubmit,
  onRematch,
  onNewOpponent,
}: GameTableHudProps) {
  const self = gameState[selfSeat];
  const opponent =
    selfSeat === 'player1' ? gameState.player2 : gameState.player1;
  const isFinished = gameState.phase === 'finished';
  const showFinishedResult = isFinished && dealerSequenceComplete;
  const isPortrait = layoutMode === 'portrait';
  const usesChatDrawer = layoutMode !== 'wide';
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!usesChatDrawer || isFinished) setChatOpen(false);
  }, [isFinished, usesChatDrawer]);

  useEffect(() => {
    if (!chatOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChatOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatOpen]);

  useEffect(() => {
    if (!canAct || isFinished) return;

    const handleActionShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.repeat ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA'))
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key !== 'h' && key !== 's') return;

      event.preventDefault();
      if (key === 'h') onHit();
      else onStand();
    };

    window.addEventListener('keydown', handleActionShortcut);
    return () => window.removeEventListener('keydown', handleActionShortcut);
  }, [canAct, isFinished, onHit, onStand]);

  const statusPanelClass =
    layoutMode === 'wide' ? wideStatusPanelClass : compactStatusPanelClass;
  const opponentIsActive =
    gameState.phase === (selfSeat === 'player1' ? 'player2' : 'player1');
  const selfIsActive = gameState.phase === selfSeat;
  const statusLabelClass = `font-bold tracking-[0.08em] ${
    layoutMode === 'wide' ? 'text-[clamp(11px,0.55vw,14px)]' : 'text-[11px]'
  }`;
  const scoreClass = `my-1.5 font-semibold tabular-nums ${
    layoutMode === 'wide'
      ? 'text-[1.45em]'
      : 'whitespace-nowrap text-[clamp(17px,4.4vw,20px)]'
  }`;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <section
        data-active={opponentIsActive}
        className={`${statusPanelBaseClass} ${statusPanelClass} absolute ${
          opponentIsActive ? activeStatusPanelClass : ''
        } ${
          layoutMode === 'wide'
            ? 'bottom-[clamp(18px,1vw,26px)] left-[clamp(18px,1vw,26px)]'
            : 'top-3 left-3'
        }`}
      >
        <h2
          className={`${statusLabelClass} ${opponentIsActive ? 'text-turn-label' : 'text-label'}`}
        >
          상대
        </h2>
        <p className={scoreClass}>점수: {opponent.score}</p>
        <p className="text-[0.75em] text-status">
          {statusLabels[opponent.status]}
        </p>
      </section>

      <section
        className={`${statusPanelBaseClass} ${statusPanelClass} absolute top-3 left-1/2 -translate-x-1/2 text-center ${
          layoutMode === 'wide'
            ? 'flex flex-col items-center justify-center'
            : ''
        }`}
      >
        <h2 className={`${statusLabelClass} text-label`}>딜러</h2>
        <p className={scoreClass}>
          점수:{' '}
          {isFinished && !dealerSequenceComplete
            ? '?'
            : (gameState.dealer.score ?? '?')}
        </p>
      </section>

      <section
        data-active={selfIsActive}
        className={`${statusPanelBaseClass} ${statusPanelClass} absolute text-right ${
          selfIsActive ? activeStatusPanelClass : ''
        } ${
          layoutMode === 'wide'
            ? 'right-[clamp(18px,1vw,26px)] bottom-[clamp(18px,1vw,26px)]'
            : 'top-3 right-3'
        }`}
      >
        <h2
          className={`${statusLabelClass} ${selfIsActive ? 'text-turn-label' : 'text-label'}`}
        >
          나
        </h2>
        <p className={scoreClass}>점수: {self.score}</p>
        <p className="text-[0.75em] text-status">{statusLabels[self.status]}</p>
      </section>

      {turnTimer && !isFinished && (
        <p
          data-urgent={turnTimerSeconds <= 5}
          className={`absolute flex items-center gap-2 rounded-full border border-accent/20 bg-timer/90 font-bold whitespace-nowrap text-accent shadow-timer backdrop-blur-sm ${
            turnTimerSeconds <= 5
              ? 'border-urgent/45 text-urgent shadow-urgent'
              : ''
          } ${
            layoutMode === 'wide'
              ? 'top-[clamp(18px,1vw,26px)] left-[clamp(18px,1vw,26px)] px-[clamp(18px,1vw,24px)] py-[clamp(12px,0.7vw,16px)] text-[clamp(14px,0.72vw,18px)]'
              : 'top-[96px] left-1/2 -translate-x-1/2 px-3 py-2 text-xs'
          }`}
        >
          <span className="size-[1.25em] shrink-0">
            <TimerIcon />
          </span>
          <span>
            {turnTimer.player === selfSeat ? '내' : '상대'} 턴 남은 시간:{' '}
            {turnTimerSeconds}초
          </span>
        </p>
      )}

      {!isFinished && (
        <>
          {usesChatDrawer && (
            <button
              aria-controls={CHAT_PANEL_ID}
              aria-expanded={chatOpen}
              aria-label={chatOpen ? '채팅 닫기' : '채팅 열기'}
              className={`${secondaryButtonClass} pointer-events-auto absolute z-20 min-h-11 text-sm shadow-lg ${
                isPortrait ? 'right-3 bottom-[92px]' : 'bottom-3 left-3'
              }`}
              onClick={() => setChatOpen((open) => !open)}
              type="button"
            >
              채팅
            </button>
          )}

          {usesChatDrawer && chatOpen && (
            <div
              className={`pointer-events-auto absolute z-20 ${
                isPortrait
                  ? 'top-24 right-3 bottom-[148px] left-3'
                  : 'top-3 right-3 bottom-[82px] w-[min(400px,calc(100%-1.5rem))]'
              }`}
            >
              <GameTableChatPanel
                chatInput={chatInput}
                chatMessages={chatMessages}
                id={CHAT_PANEL_ID}
                onChatInputChange={onChatInputChange}
                onChatSubmit={onChatSubmit}
                onClose={() => setChatOpen(false)}
                selfSeat={selfSeat}
                variant="drawer"
              />
            </div>
          )}

          <div
            className={`pointer-events-auto absolute ${
              layoutMode === 'wide'
                ? 'bottom-[clamp(18px,1vw,26px)] left-1/2 w-[clamp(480px,29vw,560px)] -translate-x-1/2'
                : isPortrait
                  ? 'right-3 bottom-3 left-3'
                  : 'right-3 bottom-3 w-[280px]'
            }`}
          >
            {actionError && (
              <p
                className="mb-2 rounded-lg border border-red-300/20 bg-red-950/90 px-3 py-2 text-sm text-red-100 shadow-lg"
                role="alert"
              >
                {actionError}
              </p>
            )}
            <div
              className={`grid grid-cols-2 ${
                layoutMode === 'wide' ? 'gap-[clamp(12px,0.7vw,16px)]' : 'gap-2'
              }`}
            >
              <button
                aria-label="Hit"
                className={`${actionButtonBaseClass} hover:enabled:border-hit-top hover:enabled:bg-[linear-gradient(180deg,var(--color-hit-top),var(--color-hit-bottom))] hover:enabled:text-hit-ink hover:enabled:shadow-hit-button ${
                  layoutMode === 'wide' ? wideActionButtonClass : ''
                }`}
                disabled={!canAct}
                onClick={onHit}
                type="button"
              >
                <span className="size-[clamp(22px,1.45vw,29px)] shrink-0">
                  <HitIcon />
                </span>
                <span className="leading-none">Hit</span>
                <kbd className="min-w-[1.9em] rounded-md border border-current/25 bg-black/8 px-1.5 py-1 text-center text-[0.58em] leading-none font-bold opacity-70">
                  H
                </kbd>
              </button>
              <button
                aria-label="Stand"
                className={`${actionButtonBaseClass} hover:enabled:border-stand-border hover:enabled:bg-[linear-gradient(180deg,var(--color-stand-top),var(--color-stand-bottom))] ${
                  layoutMode === 'wide' ? wideActionButtonClass : ''
                }`}
                disabled={!canAct}
                onClick={onStand}
                type="button"
              >
                <span className="size-[clamp(22px,1.45vw,29px)] shrink-0">
                  <StandIcon />
                </span>
                <span className="leading-none">Stand</span>
                <kbd className="min-w-[1.9em] rounded-md border border-current/25 bg-black/8 px-1.5 py-1 text-center text-[0.58em] leading-none font-bold opacity-70">
                  S
                </kbd>
              </button>
            </div>
          </div>
        </>
      )}

      {showFinishedResult && (
        <>
          <div className="pointer-events-auto absolute inset-0 z-30 bg-black/70" />
          <div className="pointer-events-none absolute inset-0 z-40 grid grid-cols-1 place-items-center p-4">
            <section
              aria-label="게임 결과"
              aria-modal="true"
              className={`pointer-events-auto max-h-[calc(100dvh-2rem)] max-w-full overflow-y-auto rounded-2xl border border-accent/30 bg-result text-center text-white shadow-2xl ${
                layoutMode === 'wide'
                  ? 'w-[clamp(430px,25vw,520px)] p-[clamp(24px,1.5vw,34px)]'
                  : 'w-96 p-5'
              }`}
              role="dialog"
            >
              <p
                className={`font-bold tracking-[0.18em] text-result-label ${
                  layoutMode === 'wide'
                    ? 'text-[clamp(12px,calc(6px+0.3125vw),16px)]'
                    : 'text-xs'
                }`}
              >
                ROUND COMPLETE
              </p>
              <p
                className={`mt-2 font-extrabold ${
                  layoutMode === 'wide'
                    ? 'text-[clamp(30px,calc(18px+0.625vw),42px)]'
                    : 'text-3xl'
                }`}
              >
                {self.result ? resultLabels[self.result] : '게임 종료'}
              </p>
              <div
                className={`mt-5 grid gap-2 ${isPortrait ? 'grid-cols-1' : 'grid-cols-2'}`}
              >
                <button
                  className={`${primaryButtonClass} ${
                    layoutMode === 'wide'
                      ? 'min-h-[clamp(56px,3vw,66px)] text-[clamp(17px,0.88vw,21px)]'
                      : ''
                  }`}
                  disabled={
                    rematchPending || newOpponentPending || selfAccepted
                  }
                  onClick={onRematch}
                  type="button"
                >
                  재대결
                </button>
                <button
                  className={`${secondaryButtonClass} ${
                    layoutMode === 'wide'
                      ? 'min-h-[clamp(56px,3vw,66px)] text-[clamp(17px,0.88vw,21px)]'
                      : ''
                  }`}
                  disabled={newOpponentPending || rematchPending}
                  onClick={onNewOpponent}
                  type="button"
                >
                  새 상대 찾기
                </button>
              </div>
              {selfAccepted && (
                <div
                  className={`mt-4 rounded-lg bg-accent/5 p-3 text-accent ${
                    layoutMode === 'wide'
                      ? 'text-[clamp(14px,calc(8px+0.3125vw),19px)]'
                      : 'text-sm'
                  }`}
                >
                  <p>재대결 요청 완료</p>
                  <p>상대 플레이어의 선택을 기다리고 있습니다.</p>
                </div>
              )}
              {opponentAccepted && !selfAccepted && (
                <p
                  className={`mt-4 rounded-lg bg-accent/5 p-3 text-accent ${
                    layoutMode === 'wide'
                      ? 'text-[clamp(14px,calc(8px+0.3125vw),19px)]'
                      : 'text-sm'
                  }`}
                >
                  상대 플레이어가 재대결을 요청했습니다.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
