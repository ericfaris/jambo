// ============================================================================
// Jambo Digital - Core Engine Types
// ============================================================================

// --- Ware Types ---
export const WARE_TYPES = ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'] as const;
export type WareType = typeof WARE_TYPES[number];

// --- Card Types ---
export type CardType = 'ware' | 'people' | 'animal' | 'utility' | 'stand';

export type InteractionType =
  | 'NONE'                  // Auto-resolve (simple ware buy/sell)
  | 'ACTIVE_SELECT'         // Active player chooses (Throne steal, Parrot)
  | 'OPPONENT_SELECT'       // Turn suspension, opponent chooses (Tribal Elder, Snake)
  | 'AUCTION'               // Alternating bids (Traveling Merchant)
  | 'DRAFT'                 // Alternating picks (Elephant, Ape)
  | 'REACTION'              // Guard / Rain Maker window
  | 'WARE_TRADE'            // Shaman all-or-nothing trade
  | 'BINARY_CHOICE'         // Choose A or B (Carrier, Supplies)
  | 'DECK_PEEK'             // Look at top N cards (Psychic)
  | 'WARE_CASH_CONVERSION'  // Discard card, return wares, get gold (Dancer)
  | 'DISCARD_PICK'          // Pick from discard pile (Drummer)
  | 'WARE_SELECT_MULTIPLE'  // Choose ware type + receive (Basket Maker)
  | 'WARE_SELL_BULK'        // Sell any wares at flat rate (Portuguese)
  | 'WARE_RETURN'           // Return ware to supply (Drums utility)
  | 'TURN_MODIFIER'         // Modify prices this turn (Wise Man)
  | 'DRAW_MODIFIER';        // Modify draw phase (Mask of Transformation)

// --- Card IDs ---
// DeckCardId uses string type since there are 110 cards with copy suffixes.
// E.g., 'guard_1', 'guard_2', ..., 'guard_6', 'ware_6all_1', etc.
// CardDesignId represents the 51 unique card designs.

export type WareDesignId =
  | 'ware_6all'
  | 'ware_3k' | 'ware_3h' | 'ware_3t' | 'ware_3l' | 'ware_3f' | 'ware_3s'
  | 'ware_2k1f' | 'ware_2l1s' | 'ware_2t1l' | 'ware_2s1k' | 'ware_2f1h' | 'ware_2h1t'
  | 'ware_slk' | 'ware_khl' | 'ware_skf' | 'ware_fht' | 'ware_tsf' | 'ware_lht';

export type PeopleDesignId =
  | 'guard' | 'rain_maker' | 'shaman' | 'psychic' | 'tribal_elder'
  | 'wise_man' | 'portuguese' | 'basket_maker' | 'traveling_merchant'
  | 'arabian_merchant' | 'dancer' | 'carrier' | 'drummer';

export type AnimalDesignId =
  | 'crocodile' | 'parrot' | 'hyena' | 'snake'
  | 'elephant' | 'ape' | 'lion' | 'cheetah';

export type UtilityDesignId =
  | 'well' | 'drums' | 'throne' | 'boat' | 'scale'
  | 'mask_of_transformation' | 'supplies' | 'kettle' | 'leopard_statue' | 'weapons';

export type StandDesignId = 'small_market_stand';

export type CardDesignId = WareDesignId | PeopleDesignId | AnimalDesignId | UtilityDesignId | StandDesignId;

// DeckCardId is a string like 'guard_1', 'ware_6all_3', etc.
// Runtime validation is provided by isValidDeckCardId() in CardDatabase.
export type DeckCardId = string;

// --- Card Definition ---
export interface WareCardWares {
  types: WareType[];  // 3 or 6 wares
  buyPrice: number;
  sellPrice: number;
}

export interface CardDefinition {
  id: DeckCardId;
  designId: CardDesignId;
  name: string;
  type: CardType;
  description: string;
  interactionType: InteractionType;
  wares?: WareCardWares;
  flowSteps: string[];
  validation: string[];
  uiPrompts: string[];
  aiHeuristic: string;
}

// --- Player State ---
export interface UtilityState {
  cardId: DeckCardId;
  designId: UtilityDesignId;
  usedThisTurn: boolean;
}

export interface PlayerState {
  gold: number;
  hand: DeckCardId[];
  market: (WareType | null)[];  // 6 base slots, expanded by +3 per stand
  utilities: UtilityState[];     // Max 3
  smallMarketStands: number;     // Number of purchased small stands
}

// --- Pending Resolution ---
export interface PendingOpponentDiscard {
  type: 'OPPONENT_DISCARD';
  sourceCard: DeckCardId;
  targetPlayer: 0 | 1;
  discardTo: number;  // Target hand size (e.g., 3 for Tribal Elder)
}

export interface PendingAuction {
  type: 'AUCTION';
  sourceCard: DeckCardId;
  wares: WareType[];          // Wares being auctioned (Traveling Merchant)
  /** Arabian Merchant: top deck cards up for auction. They stay on top of the
   *  deck until the auction ends (nothing draws mid-auction). */
  revealedCards?: DeckCardId[];
  currentBid: number;
  currentBidder: 0 | 1;
  nextBidder: 0 | 1;
  passed: boolean[];          // [p0Passed, p1Passed]
}

export interface PendingDraft {
  type: 'DRAFT';
  sourceCard: DeckCardId;
  draftMode: 'wares' | 'cards' | 'utilities';
  availableWares: WareType[];       // Wares to draft from (wares mode)
  availableCards?: DeckCardId[];     // Cards/utilities to draft from (cards/utilities mode)
  currentPicker: 0 | 1;
  picks: [WareType[], WareType[]];  // Wares picked by each player (wares mode)
  cardPicks?: [DeckCardId[], DeckCardId[]]; // Cards picked by each player (cards/utilities mode)
}

export interface PendingWareTheftSwap {
  type: 'WARE_THEFT_SWAP';
  sourceCard: DeckCardId;
  step: 'STEAL' | 'GIVE';
  stolenWare?: WareType;       // Set after steal step
  stolenIndex?: number;        // Opponent's slot of the stolen ware (exchanged in place)
}

export interface PendingWareTheftSingle {
  type: 'WARE_THEFT_SINGLE';
  sourceCard: DeckCardId;
}


export interface PendingWareTrade {
  type: 'WARE_TRADE';
  sourceCard: DeckCardId;
  step: 'SELECT_GIVE' | 'SELECT_RECEIVE';
  giveType?: WareType;
  giveCount?: number;
}

export interface PendingBinaryChoice {
  type: 'BINARY_CHOICE';
  sourceCard: DeckCardId;
  options: [string, string];   // Description of each choice
}

export interface PendingDeckPeek {
  type: 'DECK_PEEK';
  sourceCard: DeckCardId;
  revealedCards: DeckCardId[];
  pickCount: number;
}

export interface PendingWareCashConversion {
  type: 'WARE_CASH_CONVERSION';
  sourceCard: DeckCardId;
  step: 'SELECT_CARD' | 'SELECT_WARES' | 'EXECUTE';
  selectedCard?: DeckCardId;
  selectedWares?: WareType[];
}

export interface PendingDiscardPick {
  type: 'DISCARD_PICK';
  sourceCard: DeckCardId;
  eligibleCards: DeckCardId[];  // Filtered discard pile (e.g., utilities only)
}

export interface PendingWareSelectMultiple {
  type: 'WARE_SELECT_MULTIPLE';
  sourceCard: DeckCardId;
  count: number;               // How many to receive
}

export interface PendingWareSellBulk {
  type: 'WARE_SELL_BULK';
  sourceCard: DeckCardId;
  pricePerWare: number;
}

export interface PendingWareReturn {
  type: 'WARE_RETURN';
  sourceCard: DeckCardId;
  count: number;
}

export interface PendingTurnModifier {
  type: 'TURN_MODIFIER';
  sourceCard: DeckCardId;
  buyDiscount: number;
  sellBonus: number;
}

export interface PendingDrawModifier {
  type: 'DRAW_MODIFIER';
  sourceCard: DeckCardId;
}

export interface PendingUtilityEffect {
  type: 'UTILITY_EFFECT';
  sourceCard: DeckCardId;
  utilityDesign: UtilityDesignId;
  step: 'SELECT_CARD' | 'SELECT_WARE_TYPE' | 'DONE';
  selectedCards?: DeckCardId[];
}

export interface PendingHandSwap {
  type: 'HAND_SWAP';
  sourceCard: DeckCardId;
  step: 'TAKE' | 'GIVE';
  revealedHand: DeckCardId[];
  takenCard?: DeckCardId;
}

export interface PendingOpponentChoice {
  type: 'OPPONENT_CHOICE';
  sourceCard: DeckCardId;
  options: [string, string];
}

export interface PendingSuppliesDiscard {
  type: 'SUPPLIES_DISCARD';
  sourceCard: DeckCardId;
}

export interface PendingCarrierWareSelect {
  type: 'CARRIER_WARE_SELECT';
  sourceCard: DeckCardId;
  targetPlayer: 0 | 1;
}

export interface PendingUtilityKeep {
  type: 'UTILITY_KEEP';
  sourceCard: DeckCardId;
  step: 'ACTIVE_CHOOSE' | 'OPPONENT_CHOOSE';
}

export interface PendingCrocodileUse {
  type: 'CROCODILE_USE';
  sourceCard: DeckCardId;
  step: 'SELECT_UTILITY' | 'USE_UTILITY';
  selectedUtilityIndex?: number;
  opponentPlayer: 0 | 1;
}

export interface PendingUtilityReplace {
  type: 'UTILITY_REPLACE';
  sourceCard: DeckCardId;
  newUtilityDesignId: UtilityDesignId;
}

export type PendingResolution =
  | PendingOpponentDiscard
  | PendingAuction
  | PendingDraft
  | PendingWareTheftSwap
  | PendingWareTheftSingle

  | PendingWareTrade
  | PendingBinaryChoice
  | PendingDeckPeek
  | PendingWareCashConversion
  | PendingDiscardPick
  | PendingWareSelectMultiple
  | PendingWareSellBulk
  | PendingWareReturn
  | PendingTurnModifier
  | PendingDrawModifier
  | PendingUtilityEffect
  | PendingHandSwap
  | PendingOpponentChoice
  | PendingSuppliesDiscard
  | PendingCarrierWareSelect
  | PendingUtilityKeep
  | PendingCrocodileUse
  | PendingUtilityReplace;

// --- Turn Modifiers (active for current turn) ---
export interface TurnModifiers {
  buyDiscount: number;   // e.g., Wise Man -2g on buys
  sellBonus: number;     // e.g., Wise Man +2g on sells
}

// --- Endgame State ---
export interface EndgameState {
  triggerPlayer: 0 | 1;
  finalTurnPlayer: 0 | 1;
  isFinalTurn: boolean;
}

// --- Phase ---
export type Phase = 'DRAW' | 'PLAY' | 'GAME_OVER';

// --- Game State (the whole thing) ---
export interface GameState {
  version: string;
  rngSeed: number;
  rngState: number;              // Current RNG position
  turn: number;
  currentPlayer: 0 | 1;
  phase: Phase;
  actionsLeft: number;           // 0-5
  drawsThisPhase: number;        // Tracks draws in DRAW phase (max 5)
  drawnCard: DeckCardId | null;   // Card drawn but not yet kept/discarded
  keptCardThisDrawPhase: boolean; // Whether player kept a card in draw phase

  deck: DeckCardId[];
  discardPile: DeckCardId[];
  reshuffleCount: number;

  wareSupply: Record<WareType, number>;

  players: [PlayerState, PlayerState];

  pendingResolution: PendingResolution | null;
  turnModifiers: TurnModifiers;
  endgame: EndgameState | null;

  // Guard reaction tracking
  pendingGuardReaction: {
    animalCard: DeckCardId;
    targetPlayer: 0 | 1;
  } | null;

  // Crocodile post-resolution cleanup
  crocodileCleanup: {
    utilityCardId: DeckCardId;
    /** The Crocodile card itself — the borrowed utility's own resolution replaces
     *  pendingResolution, so this is the only remaining reference to it. */
    crocodileCardId: DeckCardId;
    opponentPlayer: 0 | 1;
    utilityIndex: number;
  } | null;

  // Rain Maker reaction tracking
  pendingWareCardReaction: {
    wareCardId: DeckCardId;
    targetPlayer: 0 | 1;
  } | null;

  log: GameLogEntry[];
}

// --- Game Log ---
export interface GameLogEntry {
  turn: number;
  player: 0 | 1;
  action: string;
  details?: string;
}

// --- Actions ---
export type GameAction =
  | { type: 'DRAW_CARD' }
  | { type: 'KEEP_CARD' }
  | { type: 'DISCARD_DRAWN' }
  | { type: 'SKIP_DRAW' }  // Skip draw phase entirely, transition to PLAY
  | { type: 'PLAY_CARD'; cardId: DeckCardId; wareMode?: 'buy' | 'sell' }
  | { type: 'ACTIVATE_UTILITY'; utilityIndex: number }
  | { type: 'END_TURN' }
  | { type: 'RESOLVE_INTERACTION'; response: InteractionResponse }
  | { type: 'GUARD_REACTION'; play: boolean }  // true = play Guard, false = decline
  | { type: 'WARE_CARD_REACTION'; play: boolean }  // Rain Maker: true = take ware card, false = decline
  ;

// --- Interaction Responses ---
export type InteractionResponse =
  | { type: 'SELECT_WARE'; wareIndex: number }
  | { type: 'SELECT_WARE_TYPE'; wareType: WareType }
  | { type: 'SELECT_CARD'; cardId: DeckCardId }
  | { type: 'SELECT_CARDS'; cardIds: DeckCardId[] }
  | { type: 'SELECT_WARES'; wareIndices: number[] }
  | { type: 'AUCTION_BID'; amount: number }
  | { type: 'AUCTION_PASS' }
  | { type: 'BINARY_CHOICE'; choice: 0 | 1 }
  | { type: 'DECK_PEEK_PICK'; cardIndex: number }
  | { type: 'DISCARD_PICK'; cardId: DeckCardId }
  | { type: 'SELL_WARES'; wareIndices: number[] }
  | { type: 'RETURN_WARE'; wareIndex: number }
  | { type: 'OPPONENT_DISCARD_SELECTION'; cardIndices: number[] }
  | { type: 'OPPONENT_CHOICE'; choice: 0 | 1 }
  | { type: 'SELECT_UTILITY'; utilityIndex: number }
  ;

// --- Game Constants ---
export const CONSTANTS = {
  MAX_ACTIONS: 5,
  MAX_UTILITIES: 3,
  MARKET_SLOTS: 6,
  STAND_EXPANSION_SLOTS: 3,
  SIXTH_SLOT_PENALTY: 2,
  ENDGAME_GOLD_THRESHOLD: 60,
  STARTING_GOLD: 20,
  ACTION_BONUS_THRESHOLD: 2,  // 2+ actions left = +1g
  ACTION_BONUS_GOLD: 1,
  MAX_DRAW_PHASE_DRAWS: 5,
  FIRST_STAND_COST: 6,
  ADDITIONAL_STAND_COST: 3,
  GUARD_REACTION_TIMEOUT_MS: 2000,
  TOTAL_CARDS_IN_GAME: 110,
  INITIAL_HAND_SIZE: 5,
  AI_ACTION_DELAY_MS: 3000,  // 3 seconds between AI actions
} as const;

// --- Ware Supply Initial Counts ---
export const INITIAL_WARE_SUPPLY: Record<WareType, number> = {
  trinkets: 6,
  hides: 6,
  tea: 6,
  silk: 6,
  fruit: 6,
  salt: 6,
};
