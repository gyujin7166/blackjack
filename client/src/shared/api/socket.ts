import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@blackjack/shared';
import { io, type Socket } from 'socket.io-client';

const socketUrl = import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3001';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  socketUrl,
  {
    autoConnect: false,
  },
);
