import type { Card } from '../blackjack/index.js';
import type {
  GamePhase,
  GameResult,
  PlayerSeat,
  PlayerStatus,
} from '@blackjack/shared';

export type PlayerId = PlayerSeat;
export type { GamePhase, GameResult, PlayerStatus };

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
