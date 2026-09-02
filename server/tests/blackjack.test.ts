import { describe, expect, it } from 'vitest';

import {
  createDeck,
  evaluateHand,
  shuffleDeck,
  SUITS,
  type Card,
  type Rank,
  type Suit,
} from '../src/blackjack/index.js';

const defaultSuit: Suit = 'spades';

function hand(...ranks: Rank[]): Card[] {
  return ranks.map((rank) => ({ rank, suit: defaultSuit }));
}

function cardKey(card: Card): string {
  return `${card.suit}:${card.rank}`;
}

describe('deck', () => {
  it('creates 52 unique cards with 13 cards per suit', () => {
    const deck = createDeck();

    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardKey))).toHaveLength(52);

    for (const suit of SUITS) {
      expect(deck.filter((card) => card.suit === suit)).toHaveLength(13);
    }
  });

  it('preserves the card set when shuffled', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck, () => 0);

    expect(shuffled).not.toBe(deck);
    expect([...shuffled].map(cardKey).sort()).toEqual(deck.map(cardKey).sort());
  });
});

describe('hand evaluation', () => {
  it.each([
    [['10', '7'], 17],
    [['K', 'Q'], 20],
    [['A', '6'], 17],
    [['A', '6', '10'], 17],
    [['A', 'A', '9'], 21],
    [['A', 'A', '9', 'K'], 21],
  ] satisfies Array<[Rank[], number]>)('%j scores %i', (ranks, score) => {
    expect(evaluateHand(hand(...ranks))).toMatchObject({
      score,
      isBust: false,
    });
  });

  it('marks a hand over 21 as bust', () => {
    expect(evaluateHand(hand('10', 'K', '2'))).toMatchObject({
      score: 22,
      isBust: true,
    });
  });

  it.each([
    ['A', 'K'],
    ['A', '10'],
  ] satisfies Rank[][])(
    'recognizes %s + %s as a natural blackjack',
    (...ranks) => {
      expect(evaluateHand(hand(...ranks)).isNaturalBlackjack).toBe(true);
    },
  );

  it('does not recognize a three-card 21 as a natural blackjack', () => {
    expect(evaluateHand(hand('A', '5', '5')).isNaturalBlackjack).toBe(false);
  });
});
