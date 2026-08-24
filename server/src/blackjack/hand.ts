import type { Card, Rank } from './types.js';

export interface HandEvaluation {
  score: number;
  isBust: boolean;
  isNaturalBlackjack: boolean;
  isSoft: boolean;
}

const rankValues: Record<Rank, number> = {
  A: 11,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 10,
  Q: 10,
  K: 10,
};

export function evaluateHand(cards: readonly Card[]): HandEvaluation {
  let score = cards.reduce((total, card) => total + rankValues[card.rank], 0);
  let highAceCount = cards.filter((card) => card.rank === 'A').length;

  while (score > 21 && highAceCount > 0) {
    score -= 10;
    highAceCount -= 1;
  }

  return {
    score,
    isBust: score > 21,
    isNaturalBlackjack: cards.length === 2 && score === 21,
    isSoft: highAceCount > 0,
  };
}
