export type MatchmakingStatus = 'idle' | 'waiting' | 'matched';

export type PlayerSeat = 'player1' | 'player2';

export interface MatchmakingMatchedPayload {
  roomId: string;
  seat: PlayerSeat;
}

export interface ServerToClientEvents {
  'matchmaking:waiting': () => void;
  'matchmaking:matched': (payload: MatchmakingMatchedPayload) => void;
}

export interface ClientToServerEvents {
  'matchmaking:join': () => void;
}
