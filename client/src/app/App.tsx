import { useEffect, useState } from 'react';
import { socket } from '../shared/api/socket';

export function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.connect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.disconnect();
    };
  }, []);

  return (
    <main className="app-shell">
      <section className="status-card">
        <p className="eyebrow">BLACKJACK</p>
        <h1>Realtime Blackjack</h1>
        <p>
          Socket Status:{' '}
          <strong>{isConnected ? 'Connected' : 'Disconnected'}</strong>
        </p>
      </section>
    </main>
  );
}
