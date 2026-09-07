import type {
  ChatMessagePayload,
  GameActionRejectedPayload,
  GameActionRejectionReason,
  GameStatePayload,
  MatchmakingMatchedPayload,
  MatchmakingStatus,
  RematchStatePayload,
  TurnTimerPayload,
} from '@blackjack/shared';
import { CHAT_MESSAGE_MAX_LENGTH } from '@blackjack/shared';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { socket } from '../shared/api/socket';
import { prepareGameSounds } from '../widgets/game-table/lib/gameSounds';
import { GameTableScene } from '../widgets/game-table/ui/GameTableScene';

type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'connection-error'
  | 'disconnected';

const connectionPresentations: Record<
  ConnectionStatus,
  { message?: string; detail?: string }
> = {
  connecting: {
    message: '서버에 연결 중입니다...',
    detail: '첫 연결은 잠시 걸릴 수 있습니다.',
  },
  connected: {},
  reconnecting: {
    message: '연결이 끊어졌습니다. 자동으로 다시 연결을 시도하고 있습니다.',
  },
  'connection-error': {
    message: '서버에 연결하지 못했습니다. 자동으로 다시 시도하고 있습니다.',
  },
  disconnected: {
    message: '서버 연결에 실패했습니다. 자동으로 다시 연결할 수 없습니다.',
  },
};

const rejectionMessages: Record<GameActionRejectionReason, string> = {
  not_in_game: '진행 중인 게임이 없습니다.',
  not_your_turn: '현재 내 차례가 아닙니다.',
  game_finished: '이미 종료된 게임입니다.',
  game_unavailable: '게임을 사용할 수 없습니다.',
};

export function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    socket.connected ? 'connected' : 'connecting',
  );
  const [matchmakingStatus, setMatchmakingStatus] =
    useState<MatchmakingStatus>('idle');
  const [match, setMatch] = useState<MatchmakingMatchedPayload | null>(null);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [opponentNotice, setOpponentNotice] = useState<string | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [rematchState, setRematchState] = useState<RematchStatePayload | null>(
    null,
  );
  const [newOpponentPending, setNewOpponentPending] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessagePayload[]>([]);
  const [turnTimer, setTurnTimer] = useState<TurnTimerPayload | null>(null);
  const [turnTimerDeadline, setTurnTimerDeadline] = useState<number | null>(
    null,
  );
  const [turnTimerSeconds, setTurnTimerSeconds] = useState(0);
  const [animationRound, setAnimationRound] = useState(0);
  const matchRef = useRef<MatchmakingMatchedPayload | null>(null);
  const rematchRoundPendingRef = useRef(false);

  useEffect(() => {
    if (turnTimerDeadline === null) return;

    const updateCountdown = () => {
      setTurnTimerSeconds(
        Math.max(0, Math.ceil((turnTimerDeadline - Date.now()) / 1_000)),
      );
    };
    updateCountdown();
    const interval = setInterval(updateCountdown, 250);
    return () => clearInterval(interval);
  }, [turnTimerDeadline]);

  useEffect(() => {
    const handleConnect = () => setConnectionStatus('connected');
    const handleConnectError = () => {
      setConnectionStatus(socket.active ? 'connection-error' : 'disconnected');
    };
    const handleDisconnect = () => {
      setConnectionStatus(socket.active ? 'reconnecting' : 'disconnected');
      setMatchmakingStatus('idle');
      setMatch(null);
      setGameState(null);
      setActionPending(false);
      setActionError(null);
      setOpponentNotice(null);
      setRematchPending(false);
      setRematchState(null);
      setNewOpponentPending(false);
      setChatInput('');
      setChatMessages([]);
      setTurnTimer(null);
      setTurnTimerDeadline(null);
      setTurnTimerSeconds(0);
      setAnimationRound(0);
      matchRef.current = null;
      rematchRoundPendingRef.current = false;
    };
    const handleWaiting = () => {
      setMatchmakingStatus('waiting');
      setMatch(null);
      setGameState(null);
      setActionPending(false);
      setActionError(null);
      setOpponentNotice(null);
      setRematchPending(false);
      setRematchState(null);
      setNewOpponentPending(false);
      setChatInput('');
      setChatMessages([]);
      setTurnTimer(null);
      setTurnTimerDeadline(null);
      setTurnTimerSeconds(0);
      setAnimationRound(0);
      matchRef.current = null;
      rematchRoundPendingRef.current = false;
    };
    const handleMatched = (payload: MatchmakingMatchedPayload) => {
      setMatchmakingStatus('matched');
      setMatch(payload);
      matchRef.current = payload;
      setGameState(null);
      setActionPending(false);
      setActionError(null);
      setOpponentNotice(null);
      setRematchPending(false);
      setRematchState(null);
      setNewOpponentPending(false);
      setChatInput('');
      setChatMessages([]);
      setTurnTimer(null);
      setTurnTimerDeadline(null);
      setTurnTimerSeconds(0);
      setAnimationRound(0);
      rematchRoundPendingRef.current = false;
    };
    const handleGameState = (payload: GameStatePayload) => {
      if (rematchRoundPendingRef.current) {
        rematchRoundPendingRef.current = false;
        setAnimationRound((round) => round + 1);
      }
      setGameState(payload);
      setActionPending(false);
      setActionError(null);
      setRematchPending(false);
      setRematchState(null);
      setNewOpponentPending(false);
      setTurnTimer(null);
      setTurnTimerDeadline(null);
      setTurnTimerSeconds(0);
    };
    const handleActionRejected = (payload: GameActionRejectedPayload) => {
      setActionPending(false);
      setActionError(rejectionMessages[payload.reason]);
    };
    const handleOpponentDisconnected = () => {
      setMatchmakingStatus('idle');
      setMatch(null);
      setGameState(null);
      setActionPending(false);
      setActionError(null);
      setOpponentNotice('상대 플레이어의 연결이 종료되었습니다.');
      setRematchPending(false);
      setRematchState(null);
      setNewOpponentPending(false);
      setChatInput('');
      setChatMessages([]);
      setTurnTimer(null);
      setTurnTimerDeadline(null);
      setTurnTimerSeconds(0);
      setAnimationRound(0);
      matchRef.current = null;
      rematchRoundPendingRef.current = false;
    };
    const handleOpponentLeft = () => {
      setMatchmakingStatus('idle');
      setMatch(null);
      setGameState(null);
      setActionPending(false);
      setActionError(null);
      setOpponentNotice('상대 플레이어가 새 상대 찾기를 선택했습니다.');
      setRematchPending(false);
      setRematchState(null);
      setNewOpponentPending(false);
      setChatInput('');
      setChatMessages([]);
      setTurnTimer(null);
      setTurnTimerDeadline(null);
      setTurnTimerSeconds(0);
      setAnimationRound(0);
      matchRef.current = null;
      rematchRoundPendingRef.current = false;
    };
    const handleRematchState = (payload: RematchStatePayload) => {
      if (payload.player1Accepted && payload.player2Accepted) {
        rematchRoundPendingRef.current = true;
      }
      setRematchPending(false);
      setRematchState(payload);
    };
    const handleChatMessage = (payload: ChatMessagePayload) => {
      if (payload.roomId !== matchRef.current?.roomId) return;
      setChatMessages((messages) => [...messages, payload]);
    };
    const handleTurnTimer = (payload: TurnTimerPayload) => {
      if (payload.roomId !== matchRef.current?.roomId) return;
      setTurnTimer(payload);
      setTurnTimerDeadline(Date.now() + payload.durationMs);
      setTurnTimerSeconds(Math.ceil(payload.durationMs / 1_000));
    };

    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);
    socket.on('matchmaking:waiting', handleWaiting);
    socket.on('matchmaking:matched', handleMatched);
    socket.on('matchmaking:opponent-left', handleOpponentLeft);
    socket.on('game:state', handleGameState);
    socket.on('game:action-rejected', handleActionRejected);
    socket.on('game:opponent-disconnected', handleOpponentDisconnected);
    socket.on('rematch:state', handleRematchState);
    socket.on('chat:message', handleChatMessage);
    socket.on('turn:timer', handleTurnTimer);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('connect_error', handleConnectError);
      socket.off('disconnect', handleDisconnect);
      socket.off('matchmaking:waiting', handleWaiting);
      socket.off('matchmaking:matched', handleMatched);
      socket.off('matchmaking:opponent-left', handleOpponentLeft);
      socket.off('game:state', handleGameState);
      socket.off('game:action-rejected', handleActionRejected);
      socket.off('game:opponent-disconnected', handleOpponentDisconnected);
      socket.off('rematch:state', handleRematchState);
      socket.off('chat:message', handleChatMessage);
      socket.off('turn:timer', handleTurnTimer);
      socket.disconnect();
    };
  }, []);

  const handleStartGame = () => {
    if (
      connectionStatus !== 'connected' ||
      !socket.connected ||
      matchmakingStatus !== 'idle'
    ) {
      return;
    }

    prepareGameSounds();
    setMatchmakingStatus('waiting');
    setOpponentNotice(null);
    socket.emit('matchmaking:join');
  };

  const buttonLabel =
    matchmakingStatus === 'waiting'
      ? '상대 찾는 중...'
      : matchmakingStatus === 'matched'
        ? '매칭 완료'
        : '게임 시작';
  const isConnected = connectionStatus === 'connected' && socket.connected;
  const connectionPresentation = connectionPresentations[connectionStatus];
  const showLobbyStatus =
    connectionStatus !== 'connected' ||
    matchmakingStatus === 'waiting' ||
    Boolean(match);
  const canAct = Boolean(
    isConnected &&
    match &&
    gameState &&
    !actionPending &&
    gameState.phase !== 'finished' &&
    gameState.phase === match.seat,
  );
  const selfAccepted = Boolean(
    match &&
    rematchState &&
    (match.seat === 'player1'
      ? rematchState.player1Accepted
      : rematchState.player2Accepted),
  );
  const opponentAccepted = Boolean(
    match &&
    rematchState &&
    (match.seat === 'player1'
      ? rematchState.player2Accepted
      : rematchState.player1Accepted),
  );
  const handleAction = (action: 'hit' | 'stand') => {
    if (!canAct) return;
    setActionPending(true);
    socket.emit(action === 'hit' ? 'player:hit' : 'player:stand');
  };
  const handleRematch = () => {
    if (rematchPending || newOpponentPending) return;
    setRematchPending(true);
    socket.emit('rematch:accept');
  };
  const handleNewOpponent = () => {
    if (
      newOpponentPending ||
      rematchPending ||
      gameState?.phase !== 'finished'
    ) {
      return;
    }
    setNewOpponentPending(true);
    socket.emit('matchmaking:new-opponent');
  };
  const handleChatSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !chatInput.trim() ||
      chatInput.length > CHAT_MESSAGE_MAX_LENGTH ||
      !match
    ) {
      return;
    }

    socket.emit('chat:send', { text: chatInput });
    setChatInput('');
  };

  if (match && gameState) {
    return (
      <main className="h-dvh w-full overflow-hidden bg-surface-deep">
        <GameTableScene
          actionError={actionError}
          animationRound={animationRound}
          canAct={canAct}
          chatInput={chatInput}
          chatMessages={chatMessages}
          gameState={gameState}
          newOpponentPending={newOpponentPending}
          onChatInputChange={setChatInput}
          onChatSubmit={handleChatSubmit}
          onHit={() => handleAction('hit')}
          onNewOpponent={handleNewOpponent}
          onRematch={handleRematch}
          onStand={() => handleAction('stand')}
          opponentAccepted={opponentAccepted}
          rematchPending={rematchPending}
          selfAccepted={selfAccepted}
          selfSeat={match.seat}
          turnTimer={turnTimer}
          turnTimerSeconds={turnTimerSeconds}
        />
      </main>
    );
  }

  return (
    <main className="min-h-dvh w-full bg-surface bg-lobby px-[max(28px,calc((100vw-1180px)/2))] max-sm:px-6">
      <section
        className="grid min-h-dvh grid-cols-2 items-center gap-6 py-[50px] max-[900px]:gap-0 max-sm:grid-cols-1 max-sm:pt-[42px] max-sm:pb-7"
        aria-labelledby="lobby-title"
      >
        <div className="max-sm:z-1">
          <div
            className="inline-flex items-center gap-3 text-[24px] font-extrabold tracking-[1.5px] text-ink max-sm:mb-[52px] max-sm:gap-2 max-sm:text-[15px]"
            aria-label="블랙잭"
          >
            <span
              className="text-[33px] leading-none text-accent max-sm:text-[28px]"
              aria-hidden="true"
            >
              ♠
            </span>
            BLACKJACK<span className="-ml-2.5 text-accent">.</span>
          </div>
          <h1
            className="my-[26px] text-[clamp(42px,4.4vw,62px)] leading-[1.28] font-[650] tracking-[-3px] break-keep max-[900px]:tracking-[-2px] max-sm:my-[22px] max-sm:mb-5 max-sm:text-[clamp(38px,9vw,52px)]"
            id="lobby-title"
          >
            한 장의 선택,
            <br />
            새로운 <em className="not-italic text-accent">승부.</em>
          </h1>
          <p className="text-[15px] leading-[1.9] text-muted break-keep max-sm:text-[13px]">
            21에 가까워지는 순간, 시작되는 심리전.
            <br />
            실시간으로 상대와 플레이하세요.
          </p>

          <button
            className="mt-8 flex min-h-[58px] w-[264px] items-center gap-3 rounded-[7px] border border-accent bg-accent px-[23px] text-[15px] font-[750] text-action-ink hover:enabled:border-accent-hover hover:enabled:bg-accent-hover hover:enabled:shadow-lobby-button disabled:border-status/35 disabled:bg-surface-disabled disabled:text-label max-sm:w-full"
            type="button"
            onClick={handleStartGame}
            disabled={!isConnected || matchmakingStatus !== 'idle'}
          >
            {matchmakingStatus === 'waiting' && (
              <span
                className="size-4 animate-spin rounded-full border-2 border-label/25 border-t-accent motion-reduce:animate-none"
                aria-hidden="true"
              />
            )}
            {buttonLabel}
            <span
              className="ml-auto text-[25px] font-normal"
              aria-hidden="true"
            >
              ↗
            </span>
          </button>

          {showLobbyStatus && (
            <div
              className="mt-[17px] flex max-w-[390px] items-start gap-2 text-[11px] leading-[1.8] text-muted"
              data-connection={connectionStatus}
              role="status"
              aria-live="polite"
            >
              <span
                className={`mt-[7px] size-[5px] shrink-0 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-connection shadow-connection'
                    : connectionStatus === 'disconnected'
                      ? 'bg-disconnected'
                      : 'bg-warm'
                }`}
                aria-hidden="true"
              />
              <div>
                {connectionPresentation.message && (
                  <p>{connectionPresentation.message}</p>
                )}
                {connectionPresentation.detail && (
                  <p>{connectionPresentation.detail}</p>
                )}
                {matchmakingStatus === 'waiting' && (
                  <p className="text-accent">
                    다른 플레이어를 기다리고 있습니다.
                  </p>
                )}
                {match && (
                  <p className="text-accent">
                    게임 테이블을 준비하고 있습니다.
                  </p>
                )}
              </div>
            </div>
          )}
          {opponentNotice && (
            <p
              className="mt-4 border-l-2 border-notice bg-notice/5 px-[15px] py-3 text-xs leading-[1.8] text-notice-text"
              aria-live="polite"
            >
              {opponentNotice}
            </p>
          )}
        </div>

        <div
          className="relative isolate h-[440px] max-[900px]:h-[360px] max-sm:mx-auto max-sm:mt-[25px] max-sm:h-[330px] max-sm:w-full max-sm:max-w-[400px]"
          aria-hidden="true"
        >
          <div className="absolute top-1/2 left-1/2 h-[81%] w-full -translate-x-1/2 -translate-y-1/2 -rotate-[28deg] rounded-full border border-orbit/15" />
          <div className="absolute top-1/2 left-1/2 h-[71%] w-[87%] -translate-x-1/2 -translate-y-1/2 -rotate-[28deg] rounded-full border border-dashed border-orbit/10" />
          <span className="absolute top-3 left-1/2 -translate-x-1/2 text-[9px] tracking-[3px] whitespace-nowrap text-caption/40 max-sm:top-0.5 max-sm:text-[8px]">
            THE TABLE IS YOURS
          </span>
          <span className="absolute top-[90px] right-[6%] font-serif text-[42px] leading-none text-sparkle max-sm:top-[60px]">
            ✧
          </span>
          <span className="absolute bottom-[65px] left-[11%] font-serif text-[26px] leading-none text-sparkle opacity-50">
            ✧
          </span>
          <div className="absolute top-[75px] left-[18%] w-[34%] max-w-[190px] -rotate-[17deg] overflow-hidden rounded-xl bg-paper shadow-playing-card max-[900px]:top-[65px] max-sm:top-[50px] max-sm:left-[20%] max-sm:w-[32%]">
            <img
              className="block h-auto w-full"
              src="/cards/opendecks/raster/fronts/spades/ace_of_spades.webp"
              alt=""
            />
          </div>
          <div className="absolute top-[112px] left-[45%] w-[34%] max-w-[190px] rotate-[14deg] overflow-hidden rounded-xl bg-paper shadow-playing-card max-[900px]:top-[90px] max-sm:top-20 max-sm:w-[32%]">
            <img
              className="block h-auto w-full"
              src="/cards/opendecks/raster/fronts/hearts/king_of_hearts.webp"
              alt=""
            />
          </div>
          <div className="absolute bottom-[25px] left-[29%] flex size-[102px] -rotate-12 flex-col items-center justify-center gap-px rounded-full bg-accent text-stamp-ink shadow-stamp outline outline-1 outline-offset-[-7px] outline-stamp-border max-[900px]:bottom-9 max-[900px]:size-20 max-sm:bottom-[22px]">
            <strong className="font-serif text-[43px] leading-none italic max-[900px]:text-[34px]">
              21
            </strong>
            <span className="mt-1 text-[6px] font-extrabold tracking-[1px] max-[900px]:text-[5px]">
              A PERFECT HAND
            </span>
          </div>
          <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] tracking-[2px] whitespace-nowrap text-caption/40">
            A LITTLE LUCK. A LITTLE STRATEGY.
          </span>
        </div>
      </section>
    </main>
  );
}
