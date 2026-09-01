import type { Card, Rank, Suit } from '@blackjack/shared';
import { describe, expect, it } from 'vitest';

import { CARD_BACK_ASSET_URL, getCardFaceAssetUrl } from './cardAsset';

describe('card assets', () => {
  it.each([
    [{ rank: 'A', suit: 'spades' }, '/cards/opendecks/fronts/spades/ace_of_spades.svg'],
    [{ rank: '10', suit: 'hearts' }, '/cards/opendecks/fronts/hearts/10_of_hearts.svg'],
    [{ rank: 'J', suit: 'diamonds' }, '/cards/opendecks/fronts/diamonds/jack_of_diamonds.svg'],
    [{ rank: 'Q', suit: 'clubs' }, '/cards/opendecks/fronts/clubs/queen_of_clubs.svg'],
    [{ rank: 'K', suit: 'spades' }, '/cards/opendecks/fronts/spades/king_of_spades.svg'],
  ] satisfies Array<[Card, string]>)('maps %o to its OpenDecks SVG', (card, expected) => {
    expect(getCardFaceAssetUrl(card)).toBe(expected);
  });

  it('maps every standard card to a unique local SVG URL', () => {
    const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
    const urls = suits.flatMap((suit) =>
      ranks.map((rank) => getCardFaceAssetUrl({ rank, suit })));

    expect(new Set(urls)).toHaveLength(52);
    expect(urls).toHaveLength(52);
  });

  it('uses the local red OpenDecks card back', () => {
    expect(CARD_BACK_ASSET_URL).toBe('/cards/opendecks/card-back-red.svg');
  });
});
