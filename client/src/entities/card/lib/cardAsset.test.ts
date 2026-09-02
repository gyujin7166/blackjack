import type { Card, Rank, Suit } from '@blackjack/shared';
import { describe, expect, it } from 'vitest';

import { CARD_BACK_ASSET_URL, getCardFaceAssetUrl } from './cardAsset';

describe('card assets', () => {
  it.each([
    [
      { rank: 'A', suit: 'spades' },
      '/cards/opendecks/raster/fronts/spades/ace_of_spades.webp',
    ],
    [
      { rank: '10', suit: 'hearts' },
      '/cards/opendecks/raster/fronts/hearts/10_of_hearts.webp',
    ],
    [
      { rank: 'J', suit: 'diamonds' },
      '/cards/opendecks/raster/fronts/diamonds/jack_of_diamonds.webp',
    ],
    [
      { rank: 'Q', suit: 'clubs' },
      '/cards/opendecks/raster/fronts/clubs/queen_of_clubs.webp',
    ],
    [
      { rank: 'K', suit: 'spades' },
      '/cards/opendecks/raster/fronts/spades/king_of_spades.webp',
    ],
  ] satisfies Array<[Card, string]>)(
    'maps %o to its OpenDecks WebP',
    (card, expected) => {
      expect(getCardFaceAssetUrl(card)).toBe(expected);
    },
  );

  it('maps every standard card to a unique local raster URL', () => {
    const ranks: Rank[] = [
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
    ];
    const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
    const urls = suits.flatMap((suit) =>
      ranks.map((rank) => getCardFaceAssetUrl({ rank, suit })),
    );

    expect(new Set(urls)).toHaveLength(52);
    expect(urls).toHaveLength(52);
    expect(urls.every((url) => url.endsWith('.webp'))).toBe(true);
    expect(urls.every((url) => !url.endsWith('.svg'))).toBe(true);
  });

  it('uses the local red OpenDecks card back', () => {
    expect(CARD_BACK_ASSET_URL).toBe(
      '/cards/opendecks/raster/card-back-red.webp',
    );
  });
});
