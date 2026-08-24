import { RANKS, SUITS, type Card } from './types.js';

export type RandomSource = () => number;

export function createDeck(): Card[] {
  return SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })));
}

export function shuffleDeck(
  deck: readonly Card[],
  random: RandomSource = Math.random,
): Card[] {
  const shuffled = [...deck];

  for (let currentIndex = shuffled.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(random() * (currentIndex + 1));
    [shuffled[currentIndex], shuffled[randomIndex]] = [
      shuffled[randomIndex],
      shuffled[currentIndex],
    ];
  }

  return shuffled;
}
