import type {
  ChatMessagePayload,
  GameResult,
  GameStatePayload,
  PlayerSeat,
  TurnTimerPayload,
} from '@blackjack/shared';
import { CHAT_MESSAGE_MAX_LENGTH } from '@blackjack/shared';
import {
  type CSSProperties,
  type FormEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import {
  calculateHudLayout,
  HUD_REFERENCE_HEIGHT,
  HUD_REFERENCE_WIDTH,
} from '../lib/hudLayout';

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

const desktopStatusPanelClass =
  'min-w-[120px] rounded-md border border-white/15 bg-slate-950/60 px-3 py-2 text-sm leading-snug text-white/90 backdrop-blur-sm';
const portraitStatusPanelClass =
  'rounded-md border border-white/15 bg-slate-950/60 px-2 py-1.5 text-[11px] leading-tight text-white/90 backdrop-blur-sm';

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
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hudLayout, setHudLayout] = useState(() =>
    calculateHudLayout(HUD_REFERENCE_WIDTH, HUD_REFERENCE_HEIGHT),
  );

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const updateLayout = () => {
      const { width, height } = overlay.getBoundingClientRect();
      const nextLayout = calculateHudLayout(width, height);
      setHudLayout((currentLayout) =>
        currentLayout.isPortrait === nextLayout.isPortrait &&
        currentLayout.offsetX === nextLayout.offsetX &&
        currentLayout.offsetY === nextLayout.offsetY &&
        currentLayout.scale === nextLayout.scale
          ? currentLayout
          : nextLayout,
      );
    };

    updateLayout();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateLayout);
      return () => window.removeEventListener('resize', updateLayout);
    }
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(overlay);
    return () => resizeObserver.disconnect();
  }, []);

  const referenceLayerStyle: CSSProperties = hudLayout.isPortrait
    ? { height: '100%', width: '100%' }
    : {
        height: HUD_REFERENCE_HEIGHT,
        transform: `translate(${hudLayout.offsetX}px, ${hudLayout.offsetY}px) scale(${hudLayout.scale})`,
        transformOrigin: 'top left',
        width: HUD_REFERENCE_WIDTH,
      };
  const statusPanelClass = hudLayout.isPortrait
    ? portraitStatusPanelClass
    : desktopStatusPanelClass;
  const landscapeChatStyle: CSSProperties | undefined = hudLayout.isPortrait
    ? undefined
    : {
        bottom: 24 * hudLayout.scale,
        right: 24 * hudLayout.scale,
        top: 24 * hudLayout.scale,
        width: 380 * hudLayout.scale,
      };
  const chatPanel = !isFinished && (
    <section
      className={`pointer-events-auto absolute rounded-lg border border-white/15 bg-slate-950/65 text-white/90 backdrop-blur-sm ${
        hudLayout.isPortrait
          ? 'right-3 bottom-20 left-3 p-2.5'
          : 'flex flex-col p-4'
      }`}
      style={landscapeChatStyle}
    >
      <h2
        className={`mb-1.5 font-bold ${hudLayout.isPortrait ? 'text-[13px]' : 'text-sm'}`}
      >
        Chat
      </h2>
      <div
        aria-live="polite"
        className={`space-y-1 overflow-y-auto ${
          hudLayout.isPortrait
            ? 'mb-2 max-h-12 text-xs'
            : 'mb-3 min-h-0 flex-1 text-sm'
        }`}
      >
        {chatMessages.map((message, index) => (
          <p className="break-words" key={`${message.sender}:${index}`}>
            {message.sender === selfSeat ? 'Self' : 'Opponent'}: {message.text}
          </p>
        ))}
      </div>
      <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={onChatSubmit}>
        <input
          aria-label="메시지"
          className={`min-w-0 rounded-md border border-white/15 bg-slate-900/75 py-2 text-white outline-none focus:border-blue-400 ${
            hudLayout.isPortrait ? 'px-2.5 text-[13px]' : 'px-3 text-sm'
          }`}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          onChange={(event) => onChatInputChange(event.target.value)}
          type="text"
          value={chatInput}
        />
        <button
          className={`rounded-md bg-blue-600 py-2 font-bold text-white ${
            hudLayout.isPortrait ? 'px-3 text-[13px]' : 'px-4 text-sm'
          }`}
          type="submit"
        >
          전송
        </button>
      </form>
    </section>
  );

  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
      ref={overlayRef}
    >
      <div
        className="pointer-events-none absolute top-0 left-0 z-10"
        style={referenceLayerStyle}
      >
        <section
          className={`${statusPanelClass} absolute ${
            hudLayout.isPortrait ? 'top-3 left-3' : 'bottom-32 left-[10%]'
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
          className={`${statusPanelClass} absolute left-1/2 -translate-x-1/2 text-center ${hudLayout.isPortrait ? 'top-3' : 'top-4'}`}
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
            hudLayout.isPortrait ? 'top-3 right-3' : 'right-[428px] bottom-32'
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
            className={`absolute rounded-md border border-indigo-200/15 bg-indigo-950/60 font-bold whitespace-nowrap text-indigo-50/95 backdrop-blur-sm ${
              hudLayout.isPortrait
                ? 'top-16 left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-xs'
                : 'top-4 left-4 px-3 py-2 text-sm'
            }`}
          >
            {turnTimer.player === selfSeat ? '내' : '상대'} 턴 남은 시간:{' '}
            {turnTimerSeconds}초
          </p>
        )}

        {!isFinished && (
          <>
            {hudLayout.isPortrait && chatPanel}

            <div
              className={`pointer-events-auto absolute ${
                hudLayout.isPortrait
                  ? 'right-3 bottom-3 left-3'
                  : 'right-[428px] bottom-6 w-[280px]'
              }`}
            >
              {actionError && (
                <p
                  className={`mb-2 rounded-lg border border-red-300/20 bg-red-950/90 px-3 py-2 text-red-100 shadow-lg ${hudLayout.isPortrait ? 'text-xs' : 'text-sm'}`}
                  role="alert"
                >
                  {actionError}
                </p>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`rounded-lg bg-gray-100 px-3 py-2.5 font-bold text-gray-900 shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${
                    hudLayout.isPortrait
                      ? 'min-h-11 text-sm'
                      : 'min-h-12 text-base'
                  }`}
                  disabled={!canAct}
                  onClick={onHit}
                  type="button"
                >
                  Hit
                </button>
                <button
                  className={`rounded-lg bg-gray-100 px-3 py-2.5 font-bold text-gray-900 shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${
                    hudLayout.isPortrait
                      ? 'min-h-11 text-sm'
                      : 'min-h-12 text-base'
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
      </div>

      {!hudLayout.isPortrait && chatPanel}

      {showFinishedResult && (
        <>
          <div className="pointer-events-auto absolute inset-0 z-20 bg-black/70" />
          <div
            className="pointer-events-none absolute top-0 left-0 z-30"
            style={referenceLayerStyle}
          >
            <div
              className={`absolute inset-0 grid place-items-center ${hudLayout.isPortrait ? 'p-4' : 'p-5'}`}
            >
              <section
                aria-label="게임 결과"
                aria-modal="true"
                className={`pointer-events-auto overflow-y-auto rounded-2xl border border-white/15 bg-slate-900 text-center text-white shadow-2xl ${
                  hudLayout.isPortrait
                    ? 'max-h-[calc(100dvh-2rem)] w-full max-w-sm p-4'
                    : 'max-h-[1040px] w-96 p-5'
                }`}
                role="dialog"
              >
                <p className="text-xs font-bold tracking-[0.18em] text-slate-400">
                  ROUND COMPLETE
                </p>
                <p className="mt-2 text-3xl font-extrabold">
                  {self.result ? resultLabels[self.result] : '게임 종료'}
                </p>
                <div
                  className={`mt-5 grid gap-2 ${hudLayout.isPortrait ? 'grid-cols-1' : 'grid-cols-2'}`}
                >
                  <button
                    className="rounded-lg bg-amber-500 px-4 py-2.5 font-bold text-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={
                      rematchPending || newOpponentPending || selfAccepted
                    }
                    onClick={onRematch}
                    type="button"
                  >
                    재대결
                  </button>
                  <button
                    className="rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={newOpponentPending || rematchPending}
                    onClick={onNewOpponent}
                    type="button"
                  >
                    새 상대 찾기
                  </button>
                </div>
                {selfAccepted && (
                  <div className="mt-4 rounded-lg bg-blue-950 p-3 text-sm text-blue-100">
                    <p>재대결 요청 완료</p>
                    <p>상대 플레이어의 선택을 기다리고 있습니다.</p>
                  </div>
                )}
                {opponentAccepted && !selfAccepted && (
                  <p className="mt-4 rounded-lg bg-blue-950 p-3 text-sm text-blue-100">
                    상대 플레이어가 재대결을 요청했습니다.
                  </p>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
