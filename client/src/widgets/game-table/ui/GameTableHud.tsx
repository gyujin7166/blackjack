import type {
  ChatMessagePayload,
  GameResult,
  GameStatePayload,
  PlayerSeat,
  TurnTimerPayload,
} from '@blackjack/shared';
import { CHAT_MESSAGE_MAX_LENGTH } from '@blackjack/shared';
import type { FormEvent } from 'react';

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

const statusPanelClass =
  'rounded-lg border border-white/15 bg-slate-950/75 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-sm sm:text-sm';

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
  onHit,
  onStand,
  onChatInputChange,
  onChatSubmit,
  onRematch,
  onNewOpponent,
}: GameTableHudProps) {
  const self = gameState[selfSeat];
  const opponent = selfSeat === 'player1'
    ? gameState.player2
    : gameState.player1;
  const isFinished = gameState.phase === 'finished';

  return (
    <div className="pointer-events-none absolute inset-0 z-10">
      <section className={`${statusPanelClass} absolute top-3 left-3`}>
        <h2 className="font-bold">Opponent</h2>
        <p>Score: {opponent.score}</p>
        <p>Status: {opponent.status}</p>
        {opponent.result && <p>Result: {resultLabels[opponent.result]}</p>}
      </section>

      <section
        className={`${statusPanelClass} absolute top-3 right-3 text-center sm:right-auto sm:left-1/2 sm:-translate-x-1/2`}
      >
        <h2 className="font-bold">Dealer</h2>
        <p>Dealer score: {gameState.dealer.score ?? '?'}</p>
      </section>

      <section
        className={`${statusPanelClass} absolute bottom-[15.5rem] left-3 sm:bottom-3 sm:left-1/2 sm:-translate-x-1/2 sm:text-center`}
      >
        <h2 className="font-bold">Self</h2>
        <p>Score: {self.score}</p>
        <p>Status: {self.status}</p>
        {self.result && <p>Result: {resultLabels[self.result]}</p>}
      </section>

      {turnTimer && !isFinished && (
        <p className="absolute top-[4.75rem] right-3 rounded-lg border border-indigo-300/20 bg-indigo-950/80 px-3 py-2 text-xs font-bold text-indigo-50 shadow-lg backdrop-blur-sm sm:top-3 sm:text-sm">
          {turnTimer.player === selfSeat ? '내' : '상대'} 턴 남은 시간:{' '}
          {turnTimerSeconds}초
        </p>
      )}

      {!isFinished && (
        <>
          <section className="pointer-events-auto absolute right-3 bottom-[4.75rem] left-3 rounded-xl border border-white/15 bg-slate-950/85 p-3 text-white shadow-xl backdrop-blur-sm sm:right-auto sm:bottom-3 sm:w-72">
            <h2 className="mb-2 text-sm font-bold">Chat</h2>
            <div
              aria-live="polite"
              className="mb-2 max-h-20 space-y-1 overflow-y-auto text-xs sm:max-h-28"
            >
              {chatMessages.map((message, index) => (
                <p className="break-words" key={`${message.sender}:${index}`}>
                  {message.sender === selfSeat ? 'Self' : 'Opponent'}:{' '}
                  {message.text}
                </p>
              ))}
            </div>
            <form className="grid grid-cols-[1fr_auto] gap-2" onSubmit={onChatSubmit}>
              <input
                aria-label="메시지"
                className="min-w-0 rounded-md border border-white/20 bg-slate-900/90 px-2 py-1.5 text-xs text-white outline-none focus:border-blue-400"
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                onChange={(event) => onChatInputChange(event.target.value)}
                type="text"
                value={chatInput}
              />
              <button
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"
                type="submit"
              >
                전송
              </button>
            </form>
          </section>

          <div className="pointer-events-auto absolute right-3 bottom-3 left-3 sm:left-auto sm:w-52">
            {actionError && (
              <p
                className="mb-2 rounded-lg border border-red-300/20 bg-red-950/90 px-3 py-2 text-xs text-red-100 shadow-lg"
                role="alert"
              >
                {actionError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-900 shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canAct}
                onClick={onHit}
                type="button"
              >
                Hit
              </button>
              <button
                className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-bold text-gray-900 shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
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

      {isFinished && (
        <>
          <div className="pointer-events-auto absolute inset-0 z-20 bg-black/70" />
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center p-4">
            <section
              aria-label="게임 결과"
              aria-modal="true"
              className="pointer-events-auto w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900 p-5 text-center text-white shadow-2xl"
              role="dialog"
            >
              <p className="text-xs font-bold tracking-[0.18em] text-slate-400">
                ROUND COMPLETE
              </p>
              <p className="mt-2 text-3xl font-extrabold">
                {self.result ? resultLabels[self.result] : '게임 종료'}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                  className="rounded-lg bg-amber-500 px-4 py-2.5 font-bold text-gray-950 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={rematchPending || newOpponentPending || selfAccepted}
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
        </>
      )}
    </div>
  );
}
