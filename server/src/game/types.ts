import type { Card } from '../blackjack/index.js';

export type PlayerId = 'player1' | 'player2';
export type GamePhase = PlayerId | 'dealer' | 'finished';
export type PlayerStatus =
  | 'waiting'
  | 'playing'
  | 'stood'
  | 'bust'
  | 'blackjack'
  | 'twenty-one';
export type GameResult = 'win' | 'lose' | 'push';

export interface PlayerState {
  hand: Card[];
  status: PlayerStatus;
  result: GameResult | null;
}

export interface DealerState {
  hand: Card[];
}

export interface GameSessionOptions {
  /** The first array item is the next card to be dealt. */
  deck?: readonly Card[];
}
