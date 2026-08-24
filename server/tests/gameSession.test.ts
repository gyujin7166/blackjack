import { describe, expect, it } from 'vitest';

import type { Card, Rank, Suit } from '../src/blackjack/index.js';
import { createGameSession, determineResult } from '../src/game/index.js';

const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

function cards(...ranks: Rank[]): Card[] {
  const occurrences = new Map<Rank, number>();
  return ranks.map((rank) => {
    const occurrence = occurrences.get(rank) ?? 0;
    occurrences.set(rank, occurrence + 1);
    return { rank, suit: suits[occurrence % suits.length] };
  });
}

describe('game session initialization', () => {
  it('deals two cards each in player1, player2, dealer order', () => {
    const session = createGameSession({ deck: cards('2', '3', '4', '5', '6', '7') });

    expect(session.player1.hand.map((card) => card.rank)).toEqual(['2', '5']);
    expect(session.player2.hand.map((card) => card.rank)).toEqual(['3', '6']);
    expect(session.dealer.hand.map((card) => card.rank)).toEqual(['4', '7']);
    expect(session.phase).toBe('player1');
  });
});

describe('player turns', () => {
  it('adds a card on hit and keeps the turn below 21', () => {
    const session = createGameSession({ deck: cards('2', '3', '10', '5', '6', '7', '8') });

    session.hit();

    expect(session.player1.hand.map((card) => card.rank)).toEqual(['2', '5', '8']);
    expect(session.phase).toBe('player1');
  });

  it.each([
    { name: 'bust', deck: cards('10', '2', '10', 'K', '3', '7', '2'), status: 'bust' },
    { name: '21', deck: cards('10', '2', '10', '5', '3', '7', '6'), status: 'twenty-one' },
  ] as const)('moves to player2 after player1 hits to $name', ({ deck, status }) => {
    const session = createGameSession({ deck });

    session.hit();

    expect(session.player1.status).toBe(status);
    expect(session.phase).toBe('player2');
  });

  it('moves to player2 when player1 stands', () => {
    const session = createGameSession({ deck: cards('10', '2', '10', '6', '3', '7') });

    session.stand();

    expect(session.player1.status).toBe('stood');
    expect(session.phase).toBe('player2');
  });

  it('skips player1 when their initial hand is a natural blackjack', () => {
    const session = createGameSession({ deck: cards('A', '2', '10', 'K', '3', '7') });

    expect(session.player1.status).toBe('blackjack');
    expect(session.phase).toBe('player2');
  });

  it('supports player2 hit and keeps their turn below 21', () => {
    const session = createGameSession({ deck: cards('10', '4', '10', '6', '5', '7', '6') });
    session.stand();

    session.hit();

    expect(session.player2.hand.map((card) => card.rank)).toEqual(['4', '5', '6']);
    expect(session.phase).toBe('player2');
  });

  it('finishes after player2 busts', () => {
    const session = createGameSession({ deck: cards('10', '10', '10', '6', 'K', '7', '2') });
    session.stand();

    session.hit();

    expect(session.player2.status).toBe('bust');
    expect(session.phase).toBe('finished');
  });

  it('runs the dealer and finishes when player2 stands', () => {
    const session = createGameSession({ deck: cards('10', '9', '10', '6', '8', '7') });
    session.stand();

    session.stand();

    expect(session.player2.status).toBe('stood');
    expect(session.phase).toBe('finished');
  });

  it('automatically skips a player2 natural blackjack', () => {
    const session = createGameSession({ deck: cards('10', 'A', '10', '6', 'K', '7') });

    session.stand();

    expect(session.player2.status).toBe('blackjack');
    expect(session.phase).toBe('finished');
  });
});

describe('dealer turn', () => {
  it('hits on 16 and stops at 17 or higher', () => {
    const session = createGameSession({ deck: cards('10', '9', '10', '6', '8', '6', '5') });
    session.stand();
    session.stand();

    expect(session.dealer.hand.map((card) => card.rank)).toEqual(['10', '6', '5']);
  });

  it.each([
    { name: 'hard 17', deck: cards('10', '9', '10', '6', '8', '7', '2') },
    { name: 'soft 17', deck: cards('10', '9', 'A', '6', '8', '6', '2') },
  ])('stands on $name', ({ deck }) => {
    const session = createGameSession({ deck });
    session.stand();
    session.stand();

    expect(session.dealer.hand).toHaveLength(2);
    expect(session.deck).toHaveLength(1);
  });

  it('handles dealer bust', () => {
    const session = createGameSession({ deck: cards('10', '9', '10', '6', '8', '6', 'K') });
    session.stand();
    session.stand();

    expect(session.dealer.hand.map((card) => card.rank)).toEqual(['10', '6', 'K']);
    expect(session.player1.result).toBe('win');
    expect(session.player2.result).toBe('win');
  });

  it('does not draw when both players are bust', () => {
    const session = createGameSession({
      deck: cards('10', '10', '5', 'K', 'K', '6', '2', '3', 'K'),
    });
    session.hit();
    session.hit();

    expect(session.dealer.hand).toHaveLength(2);
    expect(session.deck).toHaveLength(1);
  });
});

describe('results', () => {
  it.each([
    { name: 'player bust', player: cards('10', 'K', '2'), dealer: cards('10', '7'), result: 'lose' },
    { name: 'dealer bust', player: cards('10', '7'), dealer: cards('10', 'K', '2'), result: 'win' },
    { name: 'higher player score', player: cards('10', '9'), dealer: cards('10', '8'), result: 'win' },
    { name: 'lower player score', player: cards('10', '7'), dealer: cards('10', '8'), result: 'lose' },
    { name: 'equal score', player: cards('10', '8'), dealer: cards('K', '8'), result: 'push' },
    { name: 'player natural over dealer 21', player: cards('A', 'K'), dealer: cards('7', '7', '7'), result: 'win' },
    { name: 'dealer natural over player 21', player: cards('7', '7', '7'), dealer: cards('A', 'K'), result: 'lose' },
    { name: 'both natural', player: cards('A', 'K'), dealer: cards('A', 'Q'), result: 'push' },
  ] as const)('$name returns $result', ({ player, dealer, result }) => {
    expect(determineResult(player, dealer)).toBe(result);
  });

  it('finishes immediately when the dealer has a natural blackjack', () => {
    const session = createGameSession({ deck: cards('10', 'A', 'A', '9', 'K', 'K') });

    expect(session.phase).toBe('finished');
    expect(session.player1.result).toBe('lose');
    expect(session.player2.result).toBe('push');
  });
});

describe('finished session', () => {
  it('rejects hit and stand after finishing', () => {
    const session = createGameSession({ deck: cards('10', '9', '10', '7', '8', '7') });
    session.stand();
    session.stand();

    expect(() => session.hit()).toThrow('Cannot hit during the finished phase');
    expect(() => session.stand()).toThrow('Cannot stand during the finished phase');
  });
});

describe('configurable first player', () => {
  it('defaults to player1', () => {
    const session = createGameSession({ deck: cards('10', '9', '10', '6', '8', '7') });

    expect(session.firstPlayer).toBe('player1');
    expect(session.phase).toBe('player1');
  });

  it('starts with player2 without changing the deal order', () => {
    const session = createGameSession({
      deck: cards('2', '3', '10', '5', '6', '7'),
      firstPlayer: 'player2',
    });

    expect(session.firstPlayer).toBe('player2');
    expect(session.phase).toBe('player2');
    expect(session.player1.hand.map((card) => card.rank)).toEqual(['2', '5']);
    expect(session.player2.hand.map((card) => card.rank)).toEqual(['3', '6']);
  });

  it('moves from player2 to player1 after stand', () => {
    const session = createGameSession({
      deck: cards('10', '9', '10', '6', '8', '7'),
      firstPlayer: 'player2',
    });

    session.stand();

    expect(session.player2.status).toBe('stood');
    expect(session.phase).toBe('player1');
  });

  it.each([
    { name: 'bust', deck: cards('2', '10', '10', '5', 'K', '7', '2'), status: 'bust' },
    { name: '21', deck: cards('2', '10', '10', '5', '5', '7', '6'), status: 'twenty-one' },
  ] as const)('moves to player1 after player2 hits to $name', ({ deck, status }) => {
    const session = createGameSession({ deck, firstPlayer: 'player2' });

    session.hit();

    expect(session.player2.status).toBe(status);
    expect(session.phase).toBe('player1');
  });

  it('skips a player2 natural blackjack and starts player1', () => {
    const session = createGameSession({
      deck: cards('10', 'A', '10', '6', 'K', '7'),
      firstPlayer: 'player2',
    });

    expect(session.player2.status).toBe('blackjack');
    expect(session.phase).toBe('player1');
  });

  it('skips a player1 natural after player2 finishes', () => {
    const session = createGameSession({
      deck: cards('A', '10', '10', 'K', '6', '7'),
      firstPlayer: 'player2',
    });

    expect(session.phase).toBe('player2');
    session.stand();

    expect(session.player1.status).toBe('blackjack');
    expect(session.phase).toBe('finished');
  });

  it('preserves both-player natural blackjack behavior', () => {
    const session = createGameSession({
      deck: cards('A', 'A', '10', 'K', 'Q', '7'),
      firstPlayer: 'player2',
    });

    expect(session.phase).toBe('finished');
    expect(session.player1.result).toBe('win');
    expect(session.player2.result).toBe('win');
  });

  it('preserves immediate dealer natural blackjack behavior', () => {
    const session = createGameSession({
      deck: cards('10', '9', 'A', '8', '7', 'K'),
      firstPlayer: 'player2',
    });

    expect(session.phase).toBe('finished');
    expect(session.player1.result).toBe('lose');
    expect(session.player2.result).toBe('lose');
  });
});
