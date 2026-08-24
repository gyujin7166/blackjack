import type {
  MatchmakingMatchedPayload,
  MatchmakingStatus,
} from '@blackjack/shared';
import { useEffect, useState } from 'react';

import { socket } from '../shared/api/socket';

export function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [matchmakingStatus, setMatchmakingStatus] =
    useState<MatchmakingStatus>('idle');
  const [match, setMatch] = useState<MatchmakingMatchedPayload | null>(null);

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => {
      setIsConnected(false);
      setMatchmakingStatus('idle');
      setMatch(null);
    };
    const handleWaiting = () => {
      setMatchmakingStatus('waiting');
      setMatch(null);
    };
    const handleMatched = (payload: MatchmakingMatchedPayload) => {
      setMatchmakingStatus('matched');
      setMatch(payload);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('matchmaking:waiting', handleWaiting);
    socket.on('matchmaking:matched', handleMatched);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('matchmaking:waiting', handleWaiting);
      socket.off('matchmaking:matched', handleMatched);
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
      </section>
    </main>
  );
}
