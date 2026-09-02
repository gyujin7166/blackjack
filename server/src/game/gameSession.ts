import {
  createDeck,
  evaluateHand,
  shuffleDeck,
  type Card,
} from '../blackjack/index.js';
import type {
  DealerState,
  GamePhase,
  GameResult,
  GameSessionOptions,
  PlayerId,
  PlayerState,
} from './types.js';

const playerOrder: readonly PlayerId[] = ['player1', 'player2'];

export function determineResult(
  playerHand: readonly Card[],
  dealerHand: readonly Card[],
): GameResult {
  const player = evaluateHand(playerHand);
  const dealer = evaluateHand(dealerHand);

  if (player.isBust) return 'lose';
  if (dealer.isNaturalBlackjack && player.isNaturalBlackjack) return 'push';
  if (dealer.isNaturalBlackjack) return 'lose';
  if (player.isNaturalBlackjack) return 'win';
  if (dealer.isBust) return 'win';
  if (player.score > dealer.score) return 'win';
  if (player.score < dealer.score) return 'lose';
  return 'push';
}

export class GameSession {
  readonly deck: Card[];
  readonly firstPlayer: PlayerId;
  readonly player1: PlayerState = { hand: [], status: 'waiting', result: null };
  readonly player2: PlayerState = { hand: [], status: 'waiting', result: null };
  readonly dealer: DealerState = { hand: [] };
  phase: GamePhase = 'player1';

  constructor(options: GameSessionOptions = {}) {
    this.deck = options.deck ? [...options.deck] : shuffleDeck(createDeck());
    this.firstPlayer = options.firstPlayer ?? 'player1';

    this.dealInitialCards();
    this.startPlayerTurns();
  }

  hit(): void {
    const playerId = this.requirePlayerTurn('hit');
    const player = this[playerId];
    player.hand.push(this.drawCard());

    const evaluation = evaluateHand(player.hand);
    if (evaluation.isBust) {
      player.status = 'bust';
      this.advanceFrom(playerId);
    } else if (evaluation.score === 21) {
      player.status = 'twenty-one';
      this.advanceFrom(playerId);
    }
  }

  stand(): void {
    const playerId = this.requirePlayerTurn('stand');
    this[playerId].status = 'stood';
    this.advanceFrom(playerId);
  }

  private dealInitialCards(): void {
    for (let round = 0; round < 2; round += 1) {
      this.player1.hand.push(this.drawCard());
      this.player2.hand.push(this.drawCard());
      this.dealer.hand.push(this.drawCard());
    }
  }

  private startPlayerTurns(): void {
    for (const playerId of playerOrder) {
      if (evaluateHand(this[playerId].hand).isNaturalBlackjack) {
        this[playerId].status = 'blackjack';
      }
    }

    if (evaluateHand(this.dealer.hand).isNaturalBlackjack) {
      this.runDealerTurn();
      return;
    }

    for (const playerId of this.turnOrder()) {
      if (this[playerId].status !== 'blackjack') {
        this[playerId].status = 'playing';
        this.phase = playerId;
        return;
      }
    }

    this.runDealerTurn();
  }

  private advanceFrom(playerId: PlayerId): void {
    const [, secondPlayer] = this.turnOrder();

    if (
      playerId === this.firstPlayer &&
      this[secondPlayer].status !== 'blackjack'
    ) {
      this[secondPlayer].status = 'playing';
      this.phase = secondPlayer;
      return;
    }

    this.runDealerTurn();
  }

  private turnOrder(): readonly [PlayerId, PlayerId] {
    return this.firstPlayer === 'player1'
      ? ['player1', 'player2']
      : ['player2', 'player1'];
  }

  private runDealerTurn(): void {
    this.phase = 'dealer';

    const bothPlayersBust = playerOrder.every(
      (playerId) => evaluateHand(this[playerId].hand).isBust,
    );

    if (!bothPlayersBust) {
      while (evaluateHand(this.dealer.hand).score < 17) {
        this.dealer.hand.push(this.drawCard());
      }
    }

    for (const playerId of playerOrder) {
      this[playerId].result = determineResult(
        this[playerId].hand,
        this.dealer.hand,
      );
    }
    this.phase = 'finished';
  }

  private requirePlayerTurn(action: 'hit' | 'stand'): PlayerId {
    if (this.phase !== 'player1' && this.phase !== 'player2') {
      throw new Error(`Cannot ${action} during the ${this.phase} phase`);
    }
    return this.phase;
  }

  private drawCard(): Card {
    const card = this.deck.shift();
    if (!card) {
      throw new Error('Cannot draw from an empty deck');
    }
    return card;
  }
}

export function createGameSession(
  options: GameSessionOptions = {},
): GameSession {
  return new GameSession(options);
}
