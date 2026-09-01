import type { Card } from '@blackjack/shared';

export const CARD_BACK_ASSET_URL = '/cards/opendecks/card-back-red.svg';

const rankAssetNames: Record<Card['rank'], string> = {
  A: 'ace',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6': '6',
  '7': '7',
  '8': '8',
  '9': '9',
  '10': '10',
  J: 'jack',
  Q: 'queen',
  K: 'king',
};

export function getCardFaceAssetUrl(card: Card) {
  const rank = rankAssetNames[card.rank];
  return `/cards/opendecks/fronts/${card.suit}/${rank}_of_${card.suit}.svg`;
}
