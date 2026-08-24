export type MatchmakingStatus = 'idle' | 'waiting' | 'matched';

export type PlayerSeat = 'player1' | 'player2';

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type Rank =
  | 'A'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | '10'
  | 'J'
  | 'Q'
  | 'K';

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type GamePhase = PlayerSeat | 'dealer' | 'finished';
export type GameResult = 'win' | 'lose' | 'push';
export type PlayerStatus =
  | 'waiting'
  | 'playing'
  | 'stood'
  | 'bust'
  | 'blackjack'
  | 'twenty-one';

export interface PublicPlayerState {
  hand: Card[];
  status: PlayerStatus;
  score: number;
  result: GameResult | null;
}

export interface HiddenCard {
  hidden: true;
}

export interface PublicDealerState {
  hand: Array<Card | HiddenCard>;
  score: number | null;
}

export interface GameStatePayload {
  roomId: string;
  phase: GamePhase;
  player1: PublicPlayerState;
  player2: PublicPlayerState;
  dealer: PublicDealerState;
}

export type GameAction = 'hit' | 'stand';
export type GameActionRejectionReason =
  | 'not_in_game'
  | 'not_your_turn'
  | 'game_finished'
  | 'game_unavailable';

export interface GameActionRejectedPayload {
  action: GameAction;
  reason: GameActionRejectionReason;
}

export interface MatchmakingMatchedPayload {
  roomId: string;
  seat: PlayerSeat;
}

export interface ServerToClientEvents {
  'matchmaking:waiting': () => void;
  'matchmaking:matched': (payload: MatchmakingMatchedPayload) => void;
  'game:state': (payload: GameStatePayload) => void;
  'game:action-rejected': (payload: GameActionRejectedPayload) => void;
}

export interface ClientToServerEvents {
  'matchmaking:join': () => void;
  'player:hit': () => void;
  'player:stand': () => void;
}
