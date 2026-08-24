import type { Card, Rank, Suit } from '@blackjack/shared';

export const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;

export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K',
] as const;

export type { Card, Rank, Suit };
