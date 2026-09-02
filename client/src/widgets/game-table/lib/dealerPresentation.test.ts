import type { Card, GamePhase, HiddenCard } from '@blackjack/shared';
import { describe, expect, it } from 'vitest';

import { createDealerPresentationPlan } from './dealerPresentation';

const upcard: Card = { rank: '10', suit: 'hearts' };
const holeCard: Card = { rank: '7', suit: 'clubs' };
const hidden: HiddenCard = { hidden: true };

function plan(
  previousPhase: GamePhase | null,
  phase: GamePhase,
  dealerHand: Array<Card | HiddenCard>,
) {
  return createDealerPresentationPlan({ dealerHand, phase, previousPhase });
}

describe('createDealerPresentationPlan', () => {
  it('reveals the hole card without draws on a normal finished transition', () => {
    expect(plan('player2', 'finished', [upcard, holeCard])).toEqual({
      shouldRevealHoleCard: true,
      drawIndices: [],
      waitForInitialDeal: false,
    });
  });

  it('orders every additional dealer draw by hand index', () => {
    expect(
      plan('player1', 'finished', [
        upcard,
        holeCard,
        { rank: '2', suit: 'spades' },
        { rank: '3', suit: 'diamonds' },
      ]),
    ).toEqual({
      shouldRevealHoleCard: true,
      drawIndices: [2, 3],
      waitForInitialDeal: false,
    });
  });

  it('waits for initial deal when the first state is already finished', () => {
    expect(
      plan(null, 'finished', [upcard, holeCard, { rank: '4', suit: 'spades' }]),
    ).toEqual({
      shouldRevealHoleCard: true,
      drawIndices: [2],
      waitForInitialDeal: true,
    });
  });

  it.each(['player1', 'player2', 'dealer'] as const)(
    'does not start a sequence during %s phase',
    (phase) => {
      expect(plan(null, phase, [upcard, hidden])).toEqual({
        shouldRevealHoleCard: false,
        drawIndices: [],
        waitForInitialDeal: false,
      });
    },
  );
});
