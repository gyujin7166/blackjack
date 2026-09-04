import type {
  ChatMessagePayload,
  GameResult,
  GameStatePayload,
  PlayerSeat,
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

const wideStatusPanelClass =
  'min-w-[clamp(128px,calc(80px+2.5vw),168px)] rounded-md border border-white/15 bg-slate-950/70 px-[clamp(12px,calc(6px+0.3125vw),17px)] py-[clamp(8px,calc(2px+0.3125vw),12px)] text-[clamp(14px,calc(8px+0.3125vw),19px)] leading-snug text-white/90 backdrop-blur-sm';
const compactStatusPanelClass =
  'rounded-md border border-white/15 bg-slate-950/70 px-2 py-1.5 text-[11px] leading-tight text-white/90 backdrop-blur-sm';
const wideActionButtonClass =
  'min-h-[clamp(48px,calc(24px+1.25vw),64px)] text-[clamp(16px,calc(10px+0.3125vw),21px)]';
const CHAT_PANEL_ID = 'game-table-chat-panel';

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
  const showCanonicalResults = !isFinished || dealerSequenceComplete;
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

  const statusPanelClass =
    layoutMode === 'wide' ? wideStatusPanelClass : compactStatusPanelClass;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <section
        className={`${statusPanelClass} absolute ${
          layoutMode === 'wide' ? 'bottom-24 left-5' : 'top-3 left-3'
        }`}
      >
        <h2 className="font-bold">Opponent</h2>
        <p>Score: {opponent.score}</p>
        <p>Status: {opponent.status}</p>
        {showCanonicalResults && opponent.result && (
          <p>Result: {resultLabels[opponent.result]}</p>
        )}
      </section>

      <section
        className={`${statusPanelClass} absolute top-3 left-1/2 -translate-x-1/2 text-center`}
      >
        <h2 className="font-bold">Dealer</h2>
        <p>
          Dealer score:{' '}
          {isFinished && !dealerSequenceComplete
            ? '?'
            : (gameState.dealer.score ?? '?')}
        </p>
      </section>

      <section
        className={`${statusPanelClass} absolute text-right ${
          layoutMode === 'wide' ? 'right-5 bottom-24' : 'top-3 right-3'
        }`}
      >
        <h2 className="font-bold">Self</h2>
        <p>Score: {self.score}</p>
        <p>Status: {self.status}</p>
        {showCanonicalResults && self.result && (
          <p>Result: {resultLabels[self.result]}</p>
        )}
      </section>

      {turnTimer && !isFinished && (
        <p
          className={`absolute rounded-md border border-indigo-200/15 bg-indigo-950/70 font-bold whitespace-nowrap text-indigo-50/95 backdrop-blur-sm ${
            layoutMode === 'wide'
              ? 'top-4 left-4 px-[clamp(12px,calc(6px+0.3125vw),17px)] py-[clamp(8px,calc(2px+0.3125vw),12px)] text-[clamp(14px,calc(8px+0.3125vw),19px)]'
              : 'top-[76px] left-1/2 -translate-x-1/2 px-3 py-2 text-xs'
          }`}
        >
          {turnTimer.player === selfSeat ? '내' : '상대'} 턴 남은 시간:{' '}
          {turnTimerSeconds}초
        </p>
      )}

      {!isFinished && (
        <>
          {usesChatDrawer && (
            <button
              aria-controls={CHAT_PANEL_ID}
              aria-expanded={chatOpen}
              aria-label={chatOpen ? '채팅 닫기' : '채팅 열기'}
              className={`pointer-events-auto absolute z-20 min-h-11 rounded-lg border border-white/20 bg-slate-950/85 px-4 text-sm font-bold text-white shadow-lg ${
                isPortrait ? 'right-3 bottom-[68px]' : 'bottom-3 left-3'
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
                  ? 'top-24 right-3 bottom-[124px] left-3'
                  : 'top-3 right-3 bottom-[68px] w-[min(380px,calc(100%-1.5rem))]'
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
                ? 'bottom-5 left-1/2 w-[clamp(300px,calc(210px+4.6875vw),360px)] -translate-x-1/2'
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
                layoutMode === 'wide'
                  ? 'gap-[clamp(8px,calc(2px+0.3125vw),12px)]'
                  : 'gap-2'
              }`}
            >
              <button
                className={`min-h-12 rounded-lg bg-gray-100 px-3 py-2.5 text-base font-bold text-gray-900 shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${
                  layoutMode === 'wide' ? wideActionButtonClass : ''
                }`}
                disabled={!canAct}
                onClick={onHit}
                type="button"
              >
                Hit
              </button>
              <button
                className={`min-h-12 rounded-lg bg-gray-100 px-3 py-2.5 text-base font-bold text-gray-900 shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${
                  layoutMode === 'wide' ? wideActionButtonClass : ''
                }`}
                disabled={!canAct}
                onClick={onStand}
                type="button"
              >
                Stand
              </button>
            </div>
          </div>
        </>
      )}

      {showFinishedResult && (
        <>
          <div className="pointer-events-auto absolute inset-0 z-30 bg-black/70" />
          <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center p-4">
            <section
              aria-label="게임 결과"
              aria-modal="true"
              className={`pointer-events-auto max-h-[calc(100dvh-2rem)] max-w-full overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 text-center text-white shadow-2xl ${
                layoutMode === 'wide'
                  ? 'w-[clamp(384px,calc(240px+7.5vw),480px)] p-[clamp(20px,calc(8px+0.625vw),28px)]'
                  : 'w-96 p-5'
              }`}
              role="dialog"
            >
              <p
                className={`font-bold tracking-[0.18em] text-slate-400 ${
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
                  className={`rounded-lg bg-amber-500 px-4 py-2.5 font-bold text-gray-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                    layoutMode === 'wide'
                      ? 'min-h-[clamp(44px,calc(20px+1.25vw),56px)] text-[clamp(16px,calc(10px+0.3125vw),21px)]'
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
                  className={`rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                    layoutMode === 'wide'
                      ? 'min-h-[clamp(44px,calc(20px+1.25vw),56px)] text-[clamp(16px,calc(10px+0.3125vw),21px)]'
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
                  className={`mt-4 rounded-lg bg-blue-950 p-3 text-blue-100 ${
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
                  className={`mt-4 rounded-lg bg-blue-950 p-3 text-blue-100 ${
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
