import type {
  Card,
  GameActionRejectedPayload,
  GameActionRejectionReason,
  GameResult,
  GameStatePayload,
  PublicDealerState,
  MatchmakingMatchedPayload,
  MatchmakingStatus,
  PublicPlayerState,
  Suit,
} from '@blackjack/shared';
import { useEffect, useState } from 'react';

import { socket } from '../shared/api/socket';

const suitSymbols: Record<Suit, string> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

const rejectionMessages: Record<GameActionRejectionReason, string> = {
  not_in_game: '진행 중인 게임이 없습니다.',
  not_your_turn: '현재 내 차례가 아닙니다.',
  game_finished: '이미 종료된 게임입니다.',
  game_unavailable: '게임을 사용할 수 없습니다.',
};

const resultLabels: Record<GameResult, string> = {
  win: '승리',
  lose: '패배',
  push: '무승부',
};

function PlayerPanel({ title, player }: { title: string; player: PublicPlayerState }) {
  return (
    <div className="hand-panel">
      <h2>{title}</h2>
      <p>Score: {player.score}</p>
      <p>Status: {player.status}</p>
      {player.result && <p>Result: {resultLabels[player.result]}</p>}
      <div className="card-row">
        {player.hand.map((card: Card, index) => (
          <span className="playing-card" key={`${card.suit}:${card.rank}:${index}`}>
            {card.rank}
            {suitSymbols[card.suit]}
          </span>
        ))}
      </div>
    </div>
  );
}

function DealerPanel({ dealer }: { dealer: PublicDealerState }) {
  return (
    <div className="hand-panel">
      <h2>Dealer</h2>
      <p>Dealer score: {dealer.score ?? '?'}</p>
      <div className="card-row">
        {dealer.hand.map((card, index) =>
          'hidden' in card ? (
            <span className="playing-card hidden-card" key={`hidden:${index}`}>
              Hidden
            </span>
          ) : (
            <span className="playing-card" key={`${card.suit}:${card.rank}:${index}`}>
              {card.rank}
              {suitSymbols[card.suit]}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [matchmakingStatus, setMatchmakingStatus] =
    useState<MatchmakingStatus>('idle');
  const [match, setMatch] = useState<MatchmakingMatchedPayload | null>(null);
  const [gameState, setGameState] = useState<GameStatePayload | null>(null);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => {
      setIsConnected(false);
      setMatchmakingStatus('idle');
      setMatch(null);
      setGameState(null);
      setActionPending(false);
      setActionError(null);
    };
    const handleWaiting = () => {
      setMatchmakingStatus('waiting');
      setMatch(null);
    };
    const handleMatched = (payload: MatchmakingMatchedPayload) => {
      setMatchmakingStatus('matched');
      setMatch(payload);
    };
    const handleGameState = (payload: GameStatePayload) => {
      setGameState(payload);
      setActionPending(false);
      setActionError(null);
    };
    const handleActionRejected = (payload: GameActionRejectedPayload) => {
      setActionPending(false);
      setActionError(rejectionMessages[payload.reason]);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('matchmaking:waiting', handleWaiting);
    socket.on('matchmaking:matched', handleMatched);
    socket.on('game:state', handleGameState);
    socket.on('game:action-rejected', handleActionRejected);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('matchmaking:waiting', handleWaiting);
      socket.off('matchmaking:matched', handleMatched);
      socket.off('game:state', handleGameState);
      socket.off('game:action-rejected', handleActionRejected);
      socket.disconnect();
    };
  }, []);

  const handleStartGame = () => {
    if (!socket.connected || matchmakingStatus !== 'idle') {
      return;
    }

    setMatchmakingStatus('waiting');
    socket.emit('matchmaking:join');
  };

  const buttonLabel =
    matchmakingStatus === 'waiting'
      ? '상대 찾는 중...'
      : matchmakingStatus === 'matched'
        ? '매칭 완료'
        : '게임 시작';
  const self = match && gameState ? gameState[match.seat] : null;
  const opponent =
    match && gameState
      ? match.seat === 'player1'
        ? gameState.player2
        : gameState.player1
      : null;
  const canAct = Boolean(
    isConnected &&
      match &&
      gameState &&
      !actionPending &&
      gameState.phase !== 'finished' &&
      gameState.phase === match.seat,
  );
  const handleAction = (action: 'hit' | 'stand') => {
    if (!canAct) return;
    setActionPending(true);
    socket.emit(action === 'hit' ? 'player:hit' : 'player:stand');
  };

  return (
    <main className="app-shell">
      <section className="status-card">
        <p className="eyebrow">BLACKJACK</p>
        <h1>Realtime Blackjack</h1>
        <p>
          Socket Status:{' '}
          <strong>{isConnected ? 'Connected' : 'Disconnected'}</strong>
        </p>

        <button
          type="button"
          onClick={handleStartGame}
          disabled={!isConnected || matchmakingStatus !== 'idle'}
        >
          {buttonLabel}
        </button>

        {matchmakingStatus === 'waiting' && (
          <p className="matchmaking-message">다른 플레이어를 기다리고 있습니다.</p>
        )}

        {match && (
          <div className="match-info">
            <p>Room: {match.roomId}</p>
            <p>Seat: {match.seat}</p>
          </div>
        )}

        {match && gameState && (
          <section className="game-table">
            <DealerPanel dealer={gameState.dealer} />
            {opponent && <PlayerPanel title="Opponent" player={opponent} />}
            {self && <PlayerPanel title="Self" player={self} />}
            <div className="action-controls">
              <button
                type="button"
                disabled={!canAct}
                onClick={() => handleAction('hit')}
              >
                Hit
              </button>
              <button
                type="button"
                disabled={!canAct}
                onClick={() => handleAction('stand')}
              >
                Stand
              </button>
            </div>
            {actionError && (
              <p className="action-error" role="alert">
                {actionError}
              </p>
            )}
          </section>
        )}
      </section>
    </main>
  );
}
