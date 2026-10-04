// ============================================================================
// Jambo Digital - Game Engine
// Central coordinator that processes game actions and manages turn flow.
// All functions are PURE - take GameState, return new GameState.
// ============================================================================

import { deriveCancellableAction, handleCancelAction } from './cancelAction.ts';
import type {
  GameState,
  GameAction,
  DeckCardId,
  PlayerState,
  UtilityDesignId,
  WareType,
  GameLogEntry,
  TurnModifiers,
} from './types.ts';
import { CONSTANTS } from './types.ts';

import { drawFromDeck, discardCard } from './deck/DeckManager.ts';
import { getCard, isDesign } from './cards/CardDatabase.ts';
import {
  addWaresToMarket,
  getSixthSpaceFee,
  getEmptySlots,
  expandMarket,
} from './market/MarketManager.ts';
import { takeFromSupply, returnToSupply } from './market/WareSupply.ts';
import { checkEndgameTrigger } from './endgame/EndgameManager.ts';
import { validateAction } from './validation/actionValidator.ts';
import { initializeResolution, resolveInteraction } from './cards/CardResolver.ts';
import { getSmallStandCost } from './market/standCost.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Create a log entry for the current state.
 */
function logEntry(
  state: GameState,
  action: string,
  details?: string
): GameLogEntry {
  return {
    turn: state.turn,
    player: state.currentPlayer,
    action,
    details,
  };
}

/**
 * Append a log entry to the state, returning new state.
 */
function withLog(
  state: GameState,
  action: string,
  details?: string
): GameState {
  return {
    ...state,
    log: [...state.log, logEntry(state, action, details)],
  };
}

/**
 * Update a single player's state immutably.
 */
function withPlayer(
  state: GameState,
  player: 0 | 1,
  updates: Partial<PlayerState>
): GameState {
  const newPlayers: [PlayerState, PlayerState] = [
    player === 0 ? { ...state.players[0], ...updates } : state.players[0],
    player === 1 ? { ...state.players[1], ...updates } : state.players[1],
  ];
  return { ...state, players: newPlayers };
}

/**
 * Create empty turn modifiers.
 */
function createEmptyTurnModifiers(): TurnModifiers {
  return {
    buyDiscount: 0,
    sellBonus: 0,
  };
}

/**
 * Determine if a ware card should be used for selling based on market contents.
 * A sell is possible if the player has all required wares in their market.
 */
function canSellWaresForCard(
  state: GameState,
  player: 0 | 1,
  requiredWares: WareType[]
): boolean {
  const requiredCounts: Partial<Record<WareType, number>> = {};
  for (const ware of requiredWares) {
    requiredCounts[ware] = (requiredCounts[ware] ?? 0) + 1;
  }

  const market = state.players[player].market;
  const marketCounts: Partial<Record<WareType, number>> = {};
  for (const slot of market) {
    if (slot !== null) {
      marketCounts[slot] = (marketCounts[slot] ?? 0) + 1;
    }
  }

  for (const [wareType, count] of Object.entries(requiredCounts)) {
    if ((marketCounts[wareType as WareType] ?? 0) < count!) {
      return false;
    }
  }

  return true;
}

/**
 * Determine if a ware card can be used for buying based on gold and market space.
 */
function canBuyWaresForCard(
  state: GameState,
  player: 0 | 1,
  buyPrice: number,
  wareCount: number
): boolean {
  const effectivePrice = Math.max(0, buyPrice - state.turnModifiers.buyDiscount);
  const playerState = state.players[player];
  const emptySlots = getEmptySlots(state, player).length;
  const fee = getSixthSpaceFee(state, player, wareCount);
  return playerState.gold >= effectivePrice + fee && emptySlots >= wareCount;
}

/**
 * Find indices of wares in market matching the required wares list.
 * Returns slot indices to remove, or null if not enough wares found.
 */
function findWareSlots(
  market: (WareType | null)[],
  requiredWares: WareType[]
): number[] | null {
  const needed: Partial<Record<WareType, number>> = {};
  for (const ware of requiredWares) {
    needed[ware] = (needed[ware] ?? 0) + 1;
  }

  const indices: number[] = [];
  const used = new Set<number>();

  for (const [wareType, count] of Object.entries(needed)) {
    let found = 0;
    for (let i = 0; i < market.length && found < count!; i++) {
      if (!used.has(i) && market[i] === wareType) {
        indices.push(i);
        used.add(i);
        found++;
      }
    }
    if (found < count!) {
      return null;
    }
  }

  return indices;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Process a game action. Validates the action, dispatches to the appropriate
 * handler, and returns the new game state.
 *
 * Throws if the action is invalid.
 */
export function processAction(state: GameState, action: GameAction): GameState {
  const validation = validateAction(state, action);
  if (!validation.valid) {
    throw new Error(`Invalid action ${action.type}: ${validation.reason}`);
  }

  let next: GameState;
  switch (action.type) {
    case 'DRAW_CARD':
      next = handleDrawCard(state);
      break;
    case 'KEEP_CARD':
      next = handleKeepCard(state);
      break;
    case 'DISCARD_DRAWN':
      next = handleDiscardDrawn(state);
      break;
    case 'SKIP_DRAW':
      next = handleSkipDraw(state);
      break;
    case 'PLAY_CARD':
      next = handlePlayCard(state, action.cardId, action.wareMode);
      break;
    case 'ACTIVATE_UTILITY':
      next = handleActivateUtility(state, action.utilityIndex);
      break;
    case 'END_TURN':
      next = handleEndTurn(state);
      break;
    case 'RESOLVE_INTERACTION':
      next = handleResolveInteraction(state, action.response);
      break;
    case 'GUARD_REACTION':
      next = handleGuardReaction(state, action.play);
      break;
    case 'WARE_CARD_REACTION':
      next = handleWareCardReaction(state, action.play);
      break;
    case 'CANCEL_ACTION':
      next = handleCancelAction(state);
      break;
    default:
      throw new Error(`Unknown action type`);
  }

  // Offer a cancel only right after the action that opened the resolution;
  // any further action (the first choice, a reaction, …) withdraws it.
  const cancellable = action.type === 'CANCEL_ACTION' ? null : deriveCancellableAction(state, action, next);
  if (cancellable || next.cancellableAction) {
    next = { ...next, cancellableAction: cancellable };
  }

  // Auto-end turn when no actions left and no pending interactions
  if (next.actionsLeft === 0 &&
      next.phase === 'PLAY' &&
      !next.pendingResolution &&
      !next.pendingGuardReaction &&
      !next.pendingWareCardReaction) {
    next = handleEndTurn(next);
  }

  return next;
}

// ---------------------------------------------------------------------------
// Draw Phase Handlers
// ---------------------------------------------------------------------------

/**
 * Skip the draw phase entirely and transition to PLAY phase.
 */
export function handleSkipDraw(state: GameState): GameState {
  let next: GameState = {
    ...state,
    phase: 'PLAY',
  };
  next = withLog(next, 'SKIP_DRAW', 'Skipped draw phase');
  return next;
}

/**
 * Draw phase: reveal top card from deck. Costs 1 action.
 */
export function handleDrawCard(state: GameState): GameState {
  const drawResult = drawFromDeck(state);
  if (drawResult.card === null) {
    throw new Error('No cards available to draw (deadlock)');
  }

  let next = drawResult.state;

  next = {
    ...next,
    drawnCard: drawResult.card,
    drawsThisPhase: next.drawsThisPhase + 1,
    actionsLeft: next.actionsLeft - 1,
  };

  next = withLog(next, 'DRAW_CARD', `Drew ${drawResult.card}`);

  return next;
}

/**
 * Keep the drawn card. Adds it to hand, clears drawnCard, transitions to PLAY phase.
 */
export function handleKeepCard(state: GameState): GameState {
  const cp = state.currentPlayer;
  const keptCard = state.drawnCard!;

  const newHand = [...state.players[cp].hand, keptCard];
  let next = withPlayer(state, cp, { hand: newHand });

  next = {
    ...next,
    phase: 'PLAY',
    drawnCard: null,
    keptCardThisDrawPhase: true,
  };

  next = withLog(next, 'KEEP_CARD', `Kept ${keptCard}`);

  return next;
}

/**
 * Discard the drawn card. Clears drawnCard.
 */
export function handleDiscardDrawn(state: GameState): GameState {
  const discardedCard = state.drawnCard!;

  let next: GameState = { ...state, drawnCard: null };
  next = discardCard(next, discardedCard);

  next = withLog(next, 'DISCARD_DRAWN', `Discarded ${discardedCard}`);

  if (next.actionsLeft <= 0) {
    next = {
      ...next,
      phase: 'PLAY',
    };
    next = withLog(next, 'AUTO_TRANSITION', 'No actions remaining, transitioning to PLAY phase');
  }

  return next;
}

// ---------------------------------------------------------------------------
// Play Phase Handlers
// ---------------------------------------------------------------------------

/**
 * Play a card from hand during the PLAY phase.
 */
export function handlePlayCard(
  state: GameState,
  cardId: DeckCardId,
  wareMode?: 'buy' | 'sell'
): GameState {
  const cp = state.currentPlayer;
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;
  const cardDef = getCard(cardId);
  const hand = state.players[cp].hand;

  // Remove card from hand
  const cardIndex = hand.indexOf(cardId);
  if (cardIndex === -1) {
    throw new Error(`Card "${cardId}" not found in hand`);
  }
  const newHand = [...hand];
  newHand.splice(cardIndex, 1);

  let next = withPlayer(state, cp, { hand: newHand });

  // Decrement actions
  next = {
    ...next,
    actionsLeft: next.actionsLeft - 1,
  };

  // Dispatch based on card type
  switch (cardDef.type) {
    case 'ware':
      if (!wareMode) {
        throw new Error('wareMode is required when playing a ware card');
      }
      next = handleWareCard(next, cardId, cardDef.wares!, wareMode);
      break;

    case 'utility':
      next = handlePlayUtility(next, cardId, cardDef.designId as UtilityDesignId);
      break;

    case 'people':
      next = handlePlayPeople(next, cardId, cardDef);
      break;

    case 'animal':
      next = handlePlayAnimal(next, cardId, cardDef, opponent);
      break;

    case 'stand':
      next = handlePlayStand(next, cardId);
      break;

    default:
      next = discardCard(next, cardId);
      next = withLog(next, 'PLAY_CARD', `Played ${cardDef.name} (discarded)`);
      break;
  }

  return next;
}

/**
 * Handle a ware card being played.
 * Accepts wareMode ('buy' | 'sell') from the action — player chooses.
 * Uses per-card buyPrice/sellPrice from the card definition.
 */
function handleWareCard(
  state: GameState,
  cardId: DeckCardId,
  wares: { types: WareType[]; buyPrice: number; sellPrice: number },
  wareMode: 'buy' | 'sell'
): GameState {
  const cp = state.currentPlayer;
  let next = state;

  if (wareMode === 'sell') {
    // --- SELL ---
    if (!canSellWaresForCard(next, cp, wares.types)) {
      throw new Error(`Cannot sell: player does not have the required wares`);
    }

    const market = next.players[cp].market;
    const slotsToRemove = findWareSlots(market, wares.types);
    if (slotsToRemove === null) {
      throw new Error('Cannot find required wares in market');
    }

    // Remove wares from market
    const newMarket = [...market];
    for (const idx of slotsToRemove) {
      newMarket[idx] = null;
    }
    next = withPlayer(next, cp, { market: newMarket });

    // Return wares to supply
    for (const wareType of wares.types) {
      next = returnToSupply(next, wareType, 1);
    }

    // Add gold (with sell bonus)
    const sellGold = wares.sellPrice + next.turnModifiers.sellBonus;
    next = withPlayer(next, cp, {
      gold: next.players[cp].gold + sellGold,
    });

    next = discardCard(next, cardId);
    next = withLog(next, 'PLAY_WARE_SELL', `Sold wares for ${sellGold}g via ${cardId}`);
  } else {
    // --- BUY ---
    if (!canBuyWaresForCard(next, cp, wares.buyPrice, wares.types.length)) {
      throw new Error(`Cannot buy: insufficient gold or market space`);
    }

    const effectivePrice = Math.max(0, wares.buyPrice - next.turnModifiers.buyDiscount);
    next = withPlayer(next, cp, {
      gold: next.players[cp].gold - effectivePrice,
    });

    // Take wares from supply and add to market
    for (const wareType of wares.types) {
      next = takeFromSupply(next, wareType, 1);
    }
    next = addWaresToMarket(next, cp, wares.types);

    next = discardCard(next, cardId);
    next = withLog(next, 'PLAY_WARE_BUY', `Bought wares for ${effectivePrice}g via ${cardId}`);
  }

  // Check if opponent has Rain Maker in hand
  const opponent: 0 | 1 = cp === 0 ? 1 : 0;
  const opponentHasRainMaker = next.players[opponent].hand.some(
    id => isDesign(id, 'rain_maker')
  );
  if (opponentHasRainMaker) {
    next = {
      ...next,
      pendingWareCardReaction: {
        wareCardId: cardId,
        targetPlayer: opponent,
      },
    };
    next = withLog(next, 'RAIN_MAKER_WINDOW', 'Opponent may play Rain Maker');
  }

  return next;
}

/**
 * Handle playing a utility card from hand into the play area.
 */
function handlePlayUtility(
  state: GameState,
  cardId: DeckCardId,
  designId: UtilityDesignId
): GameState {
  const cp = state.currentPlayer;
  const player = state.players[cp];

  // At max utilities — trigger replacement flow
  if (player.utilities.length >= CONSTANTS.MAX_UTILITIES) {
    return {
      ...state,
      pendingResolution: {
        type: 'UTILITY_REPLACE',
        sourceCard: cardId,
        newUtilityDesignId: designId,
      },
    };
  }

  const newUtilities = [
    ...player.utilities,
    { cardId, designId, usedThisTurn: false },
  ];

  let next = withPlayer(state, cp, {
    utilities: newUtilities,
  });

  next = withLog(next, 'PLAY_UTILITY', `Placed ${cardId} in play area`);

  return next;
}

/**
 * Handle playing a Small Market Stand.
 * Pay cost (6g first, 3g subsequent), expand market by 3 slots.
 */
function handlePlayStand(state: GameState, cardId: DeckCardId): GameState {
  const cp = state.currentPlayer;
  const player = state.players[cp];

  const cost = getSmallStandCost(state);

  if (player.gold < cost) {
    throw new Error(`Cannot buy stand: need ${cost}g, have ${player.gold}g`);
  }

  // Pay cost and increment stand count
  let next = withPlayer(state, cp, {
    gold: player.gold - cost,
    smallMarketStands: player.smallMarketStands + 1,
  });

  // Expand market by 3 slots
  next = expandMarket(next, cp);

  // Discard the stand card
  next = discardCard(next, cardId);
  next = withLog(next, 'PLAY_STAND', `Purchased Small Market Stand for ${cost}g (market now ${next.players[cp].market.length} slots)`);

  return next;
}

/**
 * Handle playing a people card.
 */
function handlePlayPeople(
  state: GameState,
  cardId: DeckCardId,
  cardDef: { name: string; interactionType: string }
): GameState {
  let next = state;

  // REACTION cards (Guard, Rain Maker) are not played via PLAY_CARD action
  if (cardDef.interactionType === 'REACTION') {
    next = discardCard(next, cardId);
    next = withLog(next, 'PLAY_PEOPLE', `Played ${cardDef.name} (reaction card)`);
    return next;
  }

  // TURN_MODIFIER cards auto-resolve immediately
  if (cardDef.interactionType === 'TURN_MODIFIER') {
    const pending = initializeResolution(next, cardId);
    if (pending && pending.type === 'TURN_MODIFIER') {
      next = {
        ...next,
        turnModifiers: {
          buyDiscount: next.turnModifiers.buyDiscount + pending.buyDiscount,
          sellBonus: next.turnModifiers.sellBonus + pending.sellBonus,
        },
      };
    }
    next = discardCard(next, cardId);
    next = withLog(next, 'PLAY_PEOPLE', `Played ${cardDef.name} (turn modifier applied)`);
    return next;
  }

  // Initialize resolution for interactive people cards
  const pending = initializeResolution(next, cardId);
  if (pending) {
    next = {
      ...next,
      pendingResolution: pending,
    };
    next = withLog(next, 'PLAY_PEOPLE', `Played ${cardDef.name} - awaiting resolution`);
  } else {
    // No resolution needed — discard
    next = discardCard(next, cardId);
    next = withLog(next, 'PLAY_PEOPLE', `Played ${cardDef.name}`);
  }

  return next;
}

/**
 * Handle playing an animal card. Sets pendingGuardReaction for the opponent,
 * or proceeds directly to animal effect resolution.
 */
function handlePlayAnimal(
  state: GameState,
  cardId: DeckCardId,
  cardDef: { name: string; interactionType: string },
  opponent: 0 | 1
): GameState {
  let next = state;

  // Check if opponent has any Guard card in hand (design-based check)
  const opponentHasGuard = next.players[opponent].hand.some(
    id => isDesign(id, 'guard')
  );

  if (opponentHasGuard) {
    next = {
      ...next,
      pendingGuardReaction: {
        animalCard: cardId,
        targetPlayer: opponent,
      },
    };
    next = withLog(next, 'PLAY_ANIMAL', `Played ${cardDef.name} - awaiting Guard reaction from opponent`);
  } else {
    // No guard — proceed directly to animal effect
    next = initiateAnimalEffect(next, cardId, cardDef.name);
  }

  return next;
}

/**
 * Set up the animal card's effect resolution.
 * Called after Guard is declined or no Guard was available.
 */
function initiateAnimalEffect(
  state: GameState,
  cardId: DeckCardId,
  cardName: string
): GameState {
  let next = state;
  const pending = initializeResolution(next, cardId);
  if (pending) {
    next = {
      ...next,
      pendingResolution: pending,
    };

    // Draft cards: clear the source pools now that items are captured in pending
    if (pending.type === 'DRAFT') {
      const emptyMarket = (p: 0 | 1) => next.players[p].market.map(() => null) as (WareType | null)[];
      if (pending.draftMode === 'wares') {
        next = withPlayer(next, 0, { market: emptyMarket(0) });
        next = withPlayer(next, 1, { market: emptyMarket(1) });
      } else if (pending.draftMode === 'cards') {
        next = withPlayer(next, 0, { hand: [] });
        next = withPlayer(next, 1, { hand: [] });
      } else if (pending.draftMode === 'utilities') {
        next = withPlayer(next, 0, { utilities: [] });
        next = withPlayer(next, 1, { utilities: [] });
      }
    }

    next = withLog(next, 'PLAY_ANIMAL', `Played ${cardName} - awaiting resolution`);
  } else {
    next = discardCard(next, cardId);
    next = withLog(next, 'PLAY_ANIMAL', `Played ${cardName}`);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Utility Activation
// ---------------------------------------------------------------------------

/**
 * Activate a utility card already in play.
 */
export function handleActivateUtility(
  state: GameState,
  utilityIndex: number
): GameState {
  const cp = state.currentPlayer;
  const player = state.players[cp];
  const utility = player.utilities[utilityIndex];

  if (!utility) {
    throw new Error(`Invalid utility index: ${utilityIndex}`);
  }
  if (utility.usedThisTurn) {
    throw new Error(`Utility "${utility.cardId}" already used this turn`);
  }

  // Mark as used and decrement actions
  const newUtilities = player.utilities.map((u, i) =>
    i === utilityIndex ? { ...u, usedThisTurn: true } : u
  );

  let next = withPlayer(state, cp, { utilities: newUtilities });
  next = {
    ...next,
    actionsLeft: next.actionsLeft - 1,
  };

  // Dispatch based on utility design
  const cardDef = getCard(utility.cardId);

  switch (utility.designId) {
    case 'well': {
      // Pay 1g, draw 1 card
      if (next.players[cp].gold < 1) {
        throw new Error('Cannot activate Well: need 1g');
      }
      next = withPlayer(next, cp, { gold: next.players[cp].gold - 1 });
      const drawResult = drawFromDeck(next);
      if (drawResult.card !== null) {
        next = drawResult.state;
        const newHand = [...next.players[cp].hand, drawResult.card];
        next = withPlayer(next, cp, { hand: newHand });
        next = withLog(next, 'ACTIVATE_UTILITY', `Well: paid 1g, drew ${drawResult.card}`);
      } else {
        next = withLog(next, 'ACTIVATE_UTILITY', 'Well: paid 1g, but deck is empty (deadlock)');
      }
      break;
    }

    default: {
      // All other utilities go through the resolver system
      const pending = initializeResolution(next, utility.cardId);
      if (pending) {
        next = {
          ...next,
          pendingResolution: pending,
        };
        next = withLog(next, 'ACTIVATE_UTILITY', `Activated ${cardDef.name} - awaiting resolution`);
      } else {
        next = withLog(next, 'ACTIVATE_UTILITY', `Activated ${cardDef.name}`);
      }
      break;
    }
  }

  return next;
}

// ---------------------------------------------------------------------------
// Interaction Resolution
// ---------------------------------------------------------------------------

/**
 * Handle RESOLVE_INTERACTION action. Delegates to resolveInteraction()
 * from CardResolver.ts. After resolution completes, handles cleanup.
 */
function handleResolveInteraction(
  state: GameState,
  response: import('./types.ts').InteractionResponse
): GameState {
  let next = resolveInteraction(state, response);

  // If resolution completed (pendingResolution is null), handle post-resolution
  if (next.pendingResolution === null) {
    // Discard the source card if it was a people/animal card in play
    const sourceCard = state.pendingResolution?.sourceCard;
    if (sourceCard) {
      const cardDef = getCard(sourceCard);
      // People and animal cards get discarded after resolution
      // (utility cards stay in play)
      if (cardDef.type === 'people' || cardDef.type === 'animal') {
        // Only discard if not already in discard pile
        if (!next.discardPile.includes(sourceCard)) {
          next = discardCard(next, sourceCard);
        }
      }
    }

    // Handle Crocodile cleanup: discard the used opponent utility
    if (next.crocodileCleanup) {
      const cleanup = next.crocodileCleanup;
      const opUtils = next.players[cleanup.opponentPlayer].utilities;
      const utilToDiscard = opUtils.find(u => u.cardId === cleanup.utilityCardId);
      if (utilToDiscard) {
        const newUtilities = opUtils.filter(u => u.cardId !== cleanup.utilityCardId);
        next = withPlayer(next, cleanup.opponentPlayer, { utilities: newUtilities });
        next = discardCard(next, cleanup.utilityCardId);
        next = withLog(next, 'CROCODILE_CLEANUP', `Discarded opponent's ${cleanup.utilityCardId} after Crocodile use`);
      }
      // An interactive borrowed utility replaced the Crocodile's pendingResolution,
      // so the source-card discard above saw the utility, not the Crocodile.
      if (!next.discardPile.includes(cleanup.crocodileCardId)) {
        next = discardCard(next, cleanup.crocodileCardId);
      }
      next = { ...next, crocodileCleanup: null };
    }
  }

  return next;
}

/**
 * Handle GUARD_REACTION action.
 * play=true: opponent plays Guard, animal card cancelled.
 * play=false: opponent declines, animal effect proceeds.
 */
function handleGuardReaction(state: GameState, play: boolean): GameState {
  const guard = state.pendingGuardReaction;
  if (!guard) {
    throw new Error('No pending Guard reaction');
  }

  let next = state;
  const opponent = guard.targetPlayer;
  const animalCard = guard.animalCard;
  const animalDef = getCard(animalCard);

  if (play) {
    // Find a Guard card in opponent's hand
    const guardCardIndex = next.players[opponent].hand.findIndex(
      id => isDesign(id, 'guard')
    );
    if (guardCardIndex === -1) {
      throw new Error('Opponent has no Guard card to play');
    }
    const guardCardId = next.players[opponent].hand[guardCardIndex];

    // Remove Guard from opponent's hand
    const newHand = [...next.players[opponent].hand];
    newHand.splice(guardCardIndex, 1);
    next = withPlayer(next, opponent, { hand: newHand });

    // Discard both Guard and animal card
    next = discardCard(next, guardCardId);
    next = discardCard(next, animalCard);

    // Clear guard reaction
    next = { ...next, pendingGuardReaction: null };
    next = withLog(next, 'GUARD_PLAYED', `Guard cancelled ${animalDef.name}`);
  } else {
    // Opponent declines — clear guard reaction and proceed with animal effect
    next = { ...next, pendingGuardReaction: null };
    next = initiateAnimalEffect(next, animalCard, animalDef.name);
  }

  return next;
}

/**
 * Handle WARE_CARD_REACTION action (Rain Maker).
 * play=true: opponent plays Rain Maker, takes ware card from discard.
 * play=false: opponent declines.
 */
function handleWareCardReaction(state: GameState, play: boolean): GameState {
  const reaction = state.pendingWareCardReaction;
  if (!reaction) {
    throw new Error('No pending ware card reaction');
  }

  let next = state;
  const target = reaction.targetPlayer;

  if (play) {
    // Find Rain Maker in target player's hand
    const rmIndex = next.players[target].hand.findIndex(
      id => isDesign(id, 'rain_maker')
    );
    if (rmIndex === -1) {
      throw new Error('Player has no Rain Maker to play');
    }
    const rmCardId = next.players[target].hand[rmIndex];

    // Remove Rain Maker from hand
    const newHand = [...next.players[target].hand];
    newHand.splice(rmIndex, 1);
    next = withPlayer(next, target, { hand: newHand });

    // Move ware card from discard to target's hand
    const wareCardIndex = next.discardPile.indexOf(reaction.wareCardId);
    if (wareCardIndex !== -1) {
      const newDiscard = [...next.discardPile];
      newDiscard.splice(wareCardIndex, 1);
      next = { ...next, discardPile: newDiscard };
      const targetHand = [...next.players[target].hand, reaction.wareCardId];
      next = withPlayer(next, target, { hand: targetHand });
    }

    // Discard Rain Maker
    next = discardCard(next, rmCardId);

    next = { ...next, pendingWareCardReaction: null };
    next = withLog(next, 'RAIN_MAKER_PLAYED', `Rain Maker took ${reaction.wareCardId} from discard`);
  } else {
    next = { ...next, pendingWareCardReaction: null };
    next = withLog(next, 'RAIN_MAKER_DECLINED', 'Opponent declined Rain Maker reaction');
  }

  return next;
}

// ---------------------------------------------------------------------------
// Draw as Action (PLAY phase)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// End Turn
// ---------------------------------------------------------------------------

/**
 * End the current player's turn.
 */
export function handleEndTurn(state: GameState): GameState {
  const cp = state.currentPlayer;
  let next = state;

  // 1. Action bonus: +1g if 2+ actions remaining
  if (next.actionsLeft >= CONSTANTS.ACTION_BONUS_THRESHOLD) {
    next = withPlayer(next, cp, {
      gold: next.players[cp].gold + CONSTANTS.ACTION_BONUS_GOLD,
    });
    next = withLog(next, 'ACTION_BONUS', `+${CONSTANTS.ACTION_BONUS_GOLD}g for ${next.actionsLeft} unused actions`);
  }

  // 2. Reset turn modifiers
  next = {
    ...next,
    turnModifiers: createEmptyTurnModifiers(),
  };

  // 3. Reset utility usedThisTurn flags for current player
  const player = next.players[cp];
  const resetUtilities = player.utilities.map((u) => ({
    ...u,
    usedThisTurn: false,
  }));
  next = withPlayer(next, cp, { utilities: resetUtilities });

  // 4. Check endgame trigger
  next = checkEndgameTrigger(next);

  if (next.phase === 'GAME_OVER') {
    next = withLog(next, 'GAME_OVER', 'Game has ended');
    return next;
  }

  // 5. Log END_TURN before switching (so it's attributed to the current player/turn)
  const nextPlayer: 0 | 1 = cp === 0 ? 1 : 0;
  next = withLog(next, 'END_TURN', `Turn ended. Player ${nextPlayer + 1}'s turn begins (turn ${next.turn + 1})`);

  // 6. Switch player and increment turn
  next = {
    ...next,
    currentPlayer: nextPlayer,
    turn: next.turn + 1,
  };

  // 7. Reset draw phase state
  next = {
    ...next,
    phase: 'DRAW' as const,
    drawsThisPhase: 0,
    drawnCard: null,
    keptCardThisDrawPhase: false,
  };

  // 8. Set actions for next turn
  next = {
    ...next,
    actionsLeft: CONSTANTS.MAX_ACTIONS,
  };

  return next;
}
