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
import { GameTableScene } from '../widgets/game-table/ui/GameTableScene';

const rejectionMessages: Record<GameActionRejectionReason, string> = {
  not_in_game: '진행 중인 게임이 없습니다.',
  not_your_turn: '현재 내 차례가 아닙니다.',
  game_finished: '이미 종료된 게임입니다.',
  game_unavailable: '게임을 사용할 수 없습니다.',
};

export function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
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
  const [turnTimerDeadline, setTurnTimerDeadline] = useState<number | null>(null);
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
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => {
      setIsConnected(false);
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
    if (!socket.connected || matchmakingStatus !== 'idle') {
      return;
    }

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
    if (newOpponentPending || rematchPending || gameState?.phase !== 'finished') {
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

  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="w-full max-w-[760px] rounded-2xl border border-gray-700 bg-gray-800 p-8">
        <p className="m-0 text-xs font-bold tracking-[0.16em]">BLACKJACK</p>
        <h1 className="mt-2 mb-4 text-[2em] font-bold">Realtime Blackjack</h1>
        <p>
          Socket Status:{' '}
          <strong>{isConnected ? 'Connected' : 'Disconnected'}</strong>
        </p>

        <button
          className="mt-5 cursor-pointer rounded-[10px] border-0 bg-gray-200 px-[18px] py-3 font-bold text-gray-900 disabled:cursor-not-allowed disabled:opacity-60"
          type="button"
          onClick={handleStartGame}
          disabled={!isConnected || matchmakingStatus !== 'idle'}
        >
          {buttonLabel}
        </button>

        {matchmakingStatus === 'waiting' && (
          <p className="mt-4">다른 플레이어를 기다리고 있습니다.</p>
        )}

        {opponentNotice && (
          <p className="mt-4 rounded-lg bg-amber-900 p-3 text-amber-100">
            {opponentNotice}
          </p>
        )}

        {match && (
          <div className="mt-4 rounded-[10px] bg-gray-900 p-4">
            <p className="my-1 [overflow-wrap:anywhere]">Room: {match.roomId}</p>
            <p className="my-1 [overflow-wrap:anywhere]">Seat: {match.seat}</p>
          </div>
        )}

        {match && gameState && (
          <div className="mt-6">
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
          </div>
        )}
      </section>
    </main>
  );
}
