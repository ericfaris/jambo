// ============================================================================
// Auction Resolver - Traveling Merchant (2 wares) and Arabian Merchant (top 3
// deck cards) bidding mechanic
// ============================================================================

import type { GameState, PendingAuction, InteractionResponse, WareType, DeckCardId } from '../../types.ts';
import { placeWaresUpToCapacity } from '../../market/MarketManager.ts';
import { takeFromSupply, returnToSupply } from '../../market/WareSupply.ts';
import { isAuctionBidding } from '../../responder.ts';
import { discardCard } from '../../deck/DeckManager.ts';

/** Take the revealed cards off the top of the deck (they never left it during bidding). */
function removeRevealedFromDeck(state: GameState, cards: DeckCardId[]): GameState {
  const deck = [...state.deck];
  for (const cardId of cards) {
    const idx = deck.indexOf(cardId);
    if (idx !== -1) deck.splice(idx, 1);
  }
  return { ...state, deck };
}

const WARE_TYPES: WareType[] = ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'];

export function resolveAuction(
  state: GameState,
  pending: PendingAuction,
  response: InteractionResponse
): GameState {
  const revealedCards = pending.revealedCards ?? [];
  const isCardAuction = revealedCards.length > 0;

  // Step 1 & 2 (Traveling Merchant): active player selects 2 ware types from supply
  if (!isAuctionBidding(pending)) {
    // Guard: no ware types available in supply
    const hasAnySupply = WARE_TYPES.some(wt => state.wareSupply[wt] > 0);
    if (!hasAnySupply) {
      return {
        ...state,
        pendingResolution: null,
        log: [...state.log, { turn: state.turn, player: state.currentPlayer, action: 'AUCTION_NO_WINNER', details: 'No wares available in supply for auction' }],
      };
    }

    if (response.type !== 'SELECT_WARE_TYPE') {
      throw new Error('Expected SELECT_WARE_TYPE to choose ware for auction');
    }

    const { wareType } = response;
    if (state.wareSupply[wareType] < 1) {
      throw new Error(`No ${wareType} available in supply`);
    }

    // Take ware from supply
    const next = takeFromSupply(state, wareType, 1);
    const newWares = [...pending.wares, wareType];

    if (newWares.length < 2) {
      // Need one more ware — stay in selection phase
      return {
        ...next,
        pendingResolution: {
          ...pending,
          wares: newWares,
        },
      };
    }

    // Both wares selected — start bidding at 1g, placing player starts
    return {
      ...next,
      pendingResolution: {
        ...pending,
        wares: newWares,
        currentBid: 1,
        currentBidder: state.currentPlayer,
        nextBidder: state.currentPlayer === 0 ? 1 : 0,
        passed: [false, false],
      },
    };
  }

  // Step 3+: Bidding rounds
  if (response.type === 'AUCTION_BID') {
    const { amount } = response;
    if (amount <= pending.currentBid) {
      throw new Error(`Bid ${amount} must be higher than current bid ${pending.currentBid}`);
    }
    if (state.players[pending.nextBidder].gold < amount) {
      throw new Error(`Player ${pending.nextBidder} cannot afford bid of ${amount}`);
    }

    return {
      ...state,
      pendingResolution: {
        ...pending,
        currentBid: amount,
        currentBidder: pending.nextBidder,
        nextBidder: pending.currentBidder,
      },
    };
  }

  if (response.type === 'AUCTION_PASS') {
    const passingPlayer = pending.nextBidder;
    const newPassed = [...pending.passed] as [boolean, boolean];
    newPassed[passingPlayer] = true;

    // Arabian Merchant: no bids → revealed cards are discarded; otherwise the
    // last bidder pays and takes all of them into hand
    if (isCardAuction) {
      let newState = removeRevealedFromDeck(state, revealedCards);
      if (pending.currentBid <= 0) {
        for (const cardId of revealedCards) newState = discardCard(newState, cardId);
        return {
          ...newState,
          pendingResolution: null,
          log: [...newState.log, {
            turn: state.turn,
            player: state.currentPlayer,
            action: 'AUCTION_NO_WINNER',
            details: 'No bids — revealed cards discarded',
          }],
        };
      }
      const cardWinner = pending.currentBidder;
      const players = [...newState.players] as [typeof newState.players[0], typeof newState.players[1]];
      players[cardWinner] = {
        ...players[cardWinner],
        gold: players[cardWinner].gold - pending.currentBid,
        hand: [...players[cardWinner].hand, ...revealedCards],
      };
      newState = { ...newState, players };
      return {
        ...newState,
        pendingResolution: null,
        log: [...newState.log, {
          turn: state.turn,
          player: state.currentPlayer,
          action: 'AUCTION_WON',
          details: `Player ${cardWinner} won ${revealedCards.length} cards at ${pending.currentBid}g`,
        }],
      };
    }

    // If both passed with no real bids, wares go back to supply
    if (pending.currentBid <= 0 || (newPassed[0] && newPassed[1])) {
      let newState = state;
      for (const ware of pending.wares) {
        newState = returnToSupply(newState, ware, 1);
      }
      return {
        ...newState,
        pendingResolution: null,
        log: [...newState.log, {
          turn: state.turn,
          player: state.currentPlayer,
          action: 'AUCTION_NO_WINNER',
          details: 'Auction ended with no winner, wares returned to supply',
        }],
      };
    }

    // One player passed — other wins the auction
    const winner = pending.currentBidder;

    const winnerGold = state.players[winner].gold - pending.currentBid;

    const newPlayers = [...state.players] as [typeof state.players[0], typeof state.players[1]];
    newPlayers[winner] = { ...newPlayers[winner], gold: winnerGold };

    let newState: GameState = { ...state, players: newPlayers };
    // Winner takes what fits on their stands; the rest goes back to the supply
    const placement = placeWaresUpToCapacity(newState, winner, pending.wares);
    newState = placement.state;
    for (const ware of placement.leftover) {
      newState = returnToSupply(newState, ware, 1);
    }

    return {
      ...newState,
      pendingResolution: null,
      log: [...newState.log, {
        turn: state.turn,
        player: state.currentPlayer,
        action: 'AUCTION_WON',
        details: `Player ${winner} won auction for ${pending.wares.join(', ')} at ${pending.currentBid}g`,
      }],
    };
  }

  throw new Error('Expected AUCTION_BID or AUCTION_PASS response');
}
