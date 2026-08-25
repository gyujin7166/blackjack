import type { Card, GamePhase, HiddenCard } from '@blackjack/shared';

export interface DealerPresentationPlan {
  shouldRevealHoleCard: boolean;
  drawIndices: number[];
  waitForInitialDeal: boolean;
}

interface DealerPresentationInput {
  previousPhase: GamePhase | null;
  phase: GamePhase;
  dealerHand: Array<Card | HiddenCard>;
}

export function createDealerPresentationPlan({
  previousPhase,
  phase,
  dealerHand,
}: DealerPresentationInput): DealerPresentationPlan {
  if (phase !== 'finished' || previousPhase === 'finished') {
    return {
      shouldRevealHoleCard: false,
      drawIndices: [],
      waitForInitialDeal: false,
    };
  }

  const holeCard = dealerHand[1];
  const shouldRevealHoleCard = Boolean(holeCard && !('hidden' in holeCard));

  return {
    shouldRevealHoleCard,
    drawIndices: shouldRevealHoleCard
      ? dealerHand.slice(2).map((_, offset) => offset + 2)
      : [],
    waitForInitialDeal: previousPhase === null,
  };
}
