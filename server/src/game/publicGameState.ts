import type { GameStatePayload } from '@blackjack/shared';

import { evaluateHand } from '../blackjack/index.js';
import type { GameSession } from './gameSession.js';

export function createPublicGameState(
  roomId: string,
  session: GameSession,
): GameStatePayload {
  const playerState = (player: GameSession['player1']) => ({
    hand: [...player.hand],
    status: player.status,
    score: evaluateHand(player.hand).score,
    result: player.result,
  });
  const revealDealer =
    session.phase === 'dealer' || session.phase === 'finished';
  const dealerUpCard = session.dealer.hand[0];

  return {
    roomId,
    phase: session.phase,
    player1: playerState(session.player1),
    player2: playerState(session.player2),
    dealer: {
      hand: revealDealer
        ? [...session.dealer.hand]
        : dealerUpCard
          ? [dealerUpCard, { hidden: true }]
          : [],
      score: revealDealer ? evaluateHand(session.dealer.hand).score : null,
    },
  };
}
