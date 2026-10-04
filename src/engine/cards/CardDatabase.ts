// ============================================================================
// Jambo Digital - Complete Card Database (110 Cards)
// ============================================================================

import type {
  CardDefinition,
  CardDesignId,
  CardType,
  DeckCardId,
  WareCardWares,
  WareType,
} from '../types.ts';

// ============================================================================
// Helper: create a ware card wares definition
// ============================================================================

function wareSpec(types: WareType[], buyPrice: number, sellPrice: number): WareCardWares {
  return { types, buyPrice, sellPrice };
}

// ============================================================================
// CARD DESIGN TEMPLATES (51 unique designs)
// Each template omits `id` since it varies per copy.
// ============================================================================

interface CardDesignTemplate {
  designId: CardDesignId;
  name: string;
  type: CardType;
  description: string;
  interactionType: CardDefinition['interactionType'];
  wares?: WareCardWares;
  flowSteps: string[];
  validation: string[];
  uiPrompts: string[];
  aiHeuristic: string;
}

// --- Ware Card Designs (19 unique) ---

const WARE_DESIGNS: { design: CardDesignTemplate; copies: number }[] = [
  // 6-ware: all six types (4 copies)
  {
    design: {
      designId: 'ware_6all',
      name: 'Grand Market',
      type: 'ware',
      description: 'Buy all 6 wares for 10g, or sell them for 18g.',
      interactionType: 'NONE',
      wares: wareSpec(['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'], 10, 18),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 10 AND market_space >= 6', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 10g or Sell for 18g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 4,
  },
  // 3-of-a-kind (6 types, 2 copies each)
  {
    design: {
      designId: 'ware_3k',
      name: 'Trinket Stall',
      type: 'ware',
      description: 'Buy 3 trinkets for 3g, or sell them for 10g.',
      interactionType: 'NONE',
      wares: wareSpec(['trinkets', 'trinkets', 'trinkets'], 3, 10),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 3 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 3g or Sell for 10g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_3h',
      name: 'Hide Stall',
      type: 'ware',
      description: 'Buy 3 hides for 3g, or sell them for 10g.',
      interactionType: 'NONE',
      wares: wareSpec(['hides', 'hides', 'hides'], 3, 10),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 3 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 3g or Sell for 10g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_3t',
      name: 'Tea Stall',
      type: 'ware',
      description: 'Buy 3 tea for 3g, or sell them for 10g.',
      interactionType: 'NONE',
      wares: wareSpec(['tea', 'tea', 'tea'], 3, 10),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 3 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 3g or Sell for 10g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_3l',
      name: 'Silk Stall',
      type: 'ware',
      description: 'Buy 3 silk for 3g, or sell them for 10g.',
      interactionType: 'NONE',
      wares: wareSpec(['silk', 'silk', 'silk'], 3, 10),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 3 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 3g or Sell for 10g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_3f',
      name: 'Fruit Stall',
      type: 'ware',
      description: 'Buy 3 fruit for 3g, or sell them for 10g.',
      interactionType: 'NONE',
      wares: wareSpec(['fruit', 'fruit', 'fruit'], 3, 10),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 3 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 3g or Sell for 10g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_3s',
      name: 'Salt Stall',
      type: 'ware',
      description: 'Buy 3 salt for 3g, or sell them for 10g.',
      interactionType: 'NONE',
      wares: wareSpec(['salt', 'salt', 'salt'], 3, 10),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 3 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 3g or Sell for 10g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  // Pair + one (6 combos, 2 copies each)
  {
    design: {
      designId: 'ware_2k1f',
      name: 'Trinkets & Fruit',
      type: 'ware',
      description: 'Buy 2 trinkets + 1 fruit for 4g, or sell them for 11g.',
      interactionType: 'NONE',
      wares: wareSpec(['trinkets', 'trinkets', 'fruit'], 4, 11),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 4 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 4g or Sell for 11g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_2l1s',
      name: 'Silk & Salt',
      type: 'ware',
      description: 'Buy 2 silk + 1 salt for 4g, or sell them for 11g.',
      interactionType: 'NONE',
      wares: wareSpec(['silk', 'silk', 'salt'], 4, 11),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 4 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 4g or Sell for 11g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_2t1l',
      name: 'Tea & Silk',
      type: 'ware',
      description: 'Buy 2 tea + 1 silk for 4g, or sell them for 11g.',
      interactionType: 'NONE',
      wares: wareSpec(['tea', 'tea', 'silk'], 4, 11),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 4 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 4g or Sell for 11g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_2s1k',
      name: 'Salt & Trinkets',
      type: 'ware',
      description: 'Buy 2 salt + 1 trinkets for 4g, or sell them for 11g.',
      interactionType: 'NONE',
      wares: wareSpec(['salt', 'salt', 'trinkets'], 4, 11),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 4 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 4g or Sell for 11g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_2f1h',
      name: 'Fruit & Hides',
      type: 'ware',
      description: 'Buy 2 fruit + 1 hides for 4g, or sell them for 11g.',
      interactionType: 'NONE',
      wares: wareSpec(['fruit', 'fruit', 'hides'], 4, 11),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 4 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 4g or Sell for 11g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_2h1t',
      name: 'Hides & Tea',
      type: 'ware',
      description: 'Buy 2 hides + 1 tea for 4g, or sell them for 11g.',
      interactionType: 'NONE',
      wares: wareSpec(['hides', 'hides', 'tea'], 4, 11),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 4 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 4g or Sell for 11g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  // Three different (6 combos, 2 copies each)
  {
    design: {
      designId: 'ware_slk',
      name: 'Salt, Silk & Trinkets',
      type: 'ware',
      description: 'Buy 1 salt + 1 silk + 1 trinkets for 5g, or sell them for 12g.',
      interactionType: 'NONE',
      wares: wareSpec(['salt', 'silk', 'trinkets'], 5, 12),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 5 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 5g or Sell for 12g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_khl',
      name: 'Trinkets, Hides & Silk',
      type: 'ware',
      description: 'Buy 1 trinkets + 1 hides + 1 silk for 5g, or sell them for 12g.',
      interactionType: 'NONE',
      wares: wareSpec(['trinkets', 'hides', 'silk'], 5, 12),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 5 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 5g or Sell for 12g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_skf',
      name: 'Salt, Trinkets & Fruit',
      type: 'ware',
      description: 'Buy 1 salt + 1 trinkets + 1 fruit for 5g, or sell them for 12g.',
      interactionType: 'NONE',
      wares: wareSpec(['salt', 'trinkets', 'fruit'], 5, 12),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 5 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 5g or Sell for 12g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_fht',
      name: 'Fruit, Hides & Tea',
      type: 'ware',
      description: 'Buy 1 fruit + 1 hides + 1 tea for 5g, or sell them for 12g.',
      interactionType: 'NONE',
      wares: wareSpec(['fruit', 'hides', 'tea'], 5, 12),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 5 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 5g or Sell for 12g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_tsf',
      name: 'Tea, Salt & Fruit',
      type: 'ware',
      description: 'Buy 1 tea + 1 salt + 1 fruit for 5g, or sell them for 12g.',
      interactionType: 'NONE',
      wares: wareSpec(['tea', 'salt', 'fruit'], 5, 12),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 5 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 5g or Sell for 12g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'ware_lht',
      name: 'Silk, Hides & Tea',
      type: 'ware',
      description: 'Buy 1 silk + 1 hides + 1 tea for 5g, or sell them for 12g.',
      interactionType: 'NONE',
      wares: wareSpec(['silk', 'hides', 'tea'], 5, 12),
      flowSteps: ['Player chooses BUY or SELL', 'Execute chosen action'],
      validation: ['buy: gold >= 5 AND market_space >= 3', 'sell: has_required_wares'],
      uiPrompts: ['Buy for 5g or Sell for 12g?'],
      aiHeuristic: 'buy_or_sell_best_value',
    },
    copies: 2,
  },
];

// --- Stand Design (1 unique) ---

const STAND_DESIGN: { design: CardDesignTemplate; copies: number } = {
  design: {
    designId: 'small_market_stand',
    name: 'Small Market Stand',
    type: 'stand',
    description: 'Add 3 extra market spaces. The first stand built in the game costs 6g; every later stand (either player) costs 3g.',
    interactionType: 'NONE',
    flowSteps: ['Pay cost: 6g if no stand has been built yet in the game, otherwise 3g', 'Add 3 extra ware slots to player market'],
    validation: ['gold >= cost (6g for the first stand in the game, 3g after)'],
    uiPrompts: ['Purchase Small Market Stand for {cost}g?'],
    aiHeuristic: 'buy_if_market_frequently_full',
  },
  copies: 5,
};

// --- People Card Designs (13 unique) ---

const PEOPLE_DESIGNS: { design: CardDesignTemplate; copies: number }[] = [
  {
    design: {
      designId: 'guard',
      name: 'Guard',
      type: 'people',
      description: 'Reaction: Cancel an opponent\'s animal card.',
      interactionType: 'REACTION',
      flowSteps: ['Reaction: when opponent plays animal card', 'Both animal and Guard discarded, effect cancelled'],
      validation: ['opponent is playing an animal card', 'Guard is in hand'],
      uiPrompts: ['Animal attack! Play Guard to cancel?'],
      aiHeuristic: 'guard_if_valuable_assets_threatened',
    },
    copies: 6,
  },
  {
    design: {
      designId: 'rain_maker',
      name: 'Rain Maker',
      type: 'people',
      description: 'Reaction: When opponent uses a ware card, take it from the discard pile.',
      interactionType: 'REACTION',
      flowSteps: ['Reaction: after opponent buys or sells with ware card', 'Take that ware card from discard pile', 'Rain Maker is discarded'],
      validation: ['opponent just used a ware card', 'Rain Maker is in hand'],
      uiPrompts: ['Opponent used ware card! Take it from discard?'],
      aiHeuristic: 'always_steal_if_ware',
    },
    copies: 3,
  },
  {
    design: {
      designId: 'shaman',
      name: 'Shaman',
      type: 'people',
      description: 'Swap all wares of one type in your market for the same number of another type.',
      interactionType: 'WARE_TRADE',
      flowSteps: ['Select ware type to give', 'Select ware type to receive', 'Swap all of give type for same count of receive type'],
      validation: ['market has >= 1 ware of any type', 'supply has enough of receive type'],
      uiPrompts: ['Trade which ware type?', 'Receive which ware type?'],
      aiHeuristic: 'trade_lowest_to_highest_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'psychic',
      name: 'Psychic',
      type: 'people',
      description: 'Look at the top 6 cards of the deck and take 1 into your hand.',
      interactionType: 'DECK_PEEK',
      flowSteps: ['Reveal top 6 cards of deck', 'Player selects 1 card to add to hand', 'Return remaining 5 cards to top in same order'],
      validation: ['deck has >= 1 card'],
      uiPrompts: ['Pick 1 card from top 6'],
      aiHeuristic: 'pick_highest_value_card',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'tribal_elder',
      name: 'Tribal Elder',
      type: 'people',
      description: 'Choose: draw up to 5 cards, or force opponent to discard down to 3.',
      interactionType: 'BINARY_CHOICE',
      flowSteps: ['Choose: draw up to 5 cards OR opponent discards to 3', 'Execute chosen option'],
      validation: [],
      uiPrompts: ['Draw to 5 cards OR Opponent discards to 3?'],
      aiHeuristic: 'always_force_opponent_discard',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'wise_man',
      name: 'Wise Man from Afar',
      type: 'people',
      description: 'This turn: buy wares 2g cheaper, sell wares 2g more (Dancer and Portuguese sales too).',
      interactionType: 'TURN_MODIFIER',
      flowSteps: ['Apply turn modifier: buy -2g, sell +2g', 'Lasts until end of turn'],
      validation: [],
      uiPrompts: ['Wise Man active: Buy -2g, Sell +2g this turn'],
      aiHeuristic: 'always_play_before_buy_sell',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'portuguese',
      name: 'Portuguese',
      type: 'people',
      description: 'Sell any number of wares from your market at 2g each.',
      interactionType: 'WARE_SELL_BULK',
      flowSteps: ['Select any number of wares from market', 'Each sold for flat 2g', 'Return to supply'],
      validation: ['market has >= 1 ware'],
      uiPrompts: ['Select wares to sell at 2g each'],
      aiHeuristic: 'sell_wares_without_matching_sell_cards',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'basket_maker',
      name: 'Basket Maker',
      type: 'people',
      description: 'Pay 2g to take 2 wares of the same type from supply.',
      interactionType: 'WARE_SELECT_MULTIPLE',
      flowSteps: ['Pay 2g', 'Select 1 ware type', 'Take 2 of that type from supply'],
      validation: ['gold >= 2', 'market_space >= 2', 'supply has >= 2 of chosen type'],
      uiPrompts: ['Pay 2g. Choose ware type (receive x2)'],
      aiHeuristic: 'select_highest_value_ware',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'traveling_merchant',
      name: 'Traveling Merchant',
      type: 'people',
      description: 'Select 2 ware types from supply to auction. Players bid alternately starting at 1g. Winner pays and receives both wares from supply.',
      interactionType: 'AUCTION',
      flowSteps: ['Select 2 ware types from supply', 'Alternate bids starting at 1g (placing player starts)', 'Winner pays and receives both wares from supply'],
      validation: ['supply has >= 1 ware type available'],
      uiPrompts: ['Pick first ware type from supply', 'Pick second ware type from supply', 'Current bid: {bid}g. Raise or Pass?'],
      aiHeuristic: 'bid_if_ware_value_exceeds_bid',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'arabian_merchant',
      name: 'Arabian Merchant',
      type: 'people',
      description: 'Reveal top 3 deck cards. Both players bid; highest bidder pays and takes all 3.',
      interactionType: 'AUCTION',
      flowSteps: ['Reveal top 3 cards from deck', 'Alternate bids starting at 1g', 'Winner pays and receives all 3 cards'],
      validation: ['deck has >= 1 card'],
      uiPrompts: ['Top 3 cards revealed. Bid?', 'Current bid: {bid}g. Raise or Pass?'],
      aiHeuristic: 'bid_if_card_value_exceeds_bid',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'dancer',
      name: 'Dancer',
      type: 'people',
      description: 'Discard a ware card from hand, return any 3 wares, receive the card\'s sell price.',
      interactionType: 'WARE_CASH_CONVERSION',
      flowSteps: ['Select any ware card from hand', 'Sell any 3 wares from market (no matching required)', 'Receive sell price of selected ware card', 'Discard Dancer and ware card'],
      validation: ['hand contains at least 1 ware card', 'market has >= 3 wares'],
      uiPrompts: ['Select a ware card from hand', 'Return any 3 wares to supply'],
      aiHeuristic: 'select_highest_sell_value_ware_card',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'carrier',
      name: 'Carrier',
      type: 'people',
      description: 'Choose: take 2 wares of one type, or draw 2 cards. Opponent gets the other.',
      interactionType: 'BINARY_CHOICE',
      flowSteps: ['Choose: 2 wares of same type from supply OR 2 cards from deck', 'Opponent gets the other option'],
      validation: [],
      uiPrompts: ['Choose: 2 wares of same type OR 2 cards? (Opponent gets the other)'],
      aiHeuristic: 'choose_higher_value_option',
    },
    copies: 1,
  },
  {
    design: {
      designId: 'drummer',
      name: 'Drummer',
      type: 'people',
      description: 'Take 1 utility card from the discard pile into your hand.',
      interactionType: 'DISCARD_PICK',
      flowSteps: ['Scan discard pile for utility cards', 'Select 1 utility from discard', 'Add to hand'],
      validation: ['discard pile contains >= 1 utility card'],
      uiPrompts: ['Pick a utility card from the discard pile'],
      aiHeuristic: 'pick_highest_value_utility',
    },
    copies: 1,
  },
];

// --- Animal Card Designs (8 unique) ---

const ANIMAL_DESIGNS: { design: CardDesignTemplate; copies: number }[] = [
  {
    design: {
      designId: 'crocodile',
      name: 'Crocodile',
      type: 'animal',
      description: 'Use one of opponent\'s utilities, then discard it.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Guard reaction window', 'Select 1 opponent utility', 'Use that utility once for free', 'Then discard it'],
      validation: ['opponent has >= 1 utility in play'],
      uiPrompts: ['Select opponent utility to use and discard'],
      aiHeuristic: 'target_best_opponent_utility',
    },
    copies: 5,
  },
  {
    design: {
      designId: 'parrot',
      name: 'Parrot',
      type: 'animal',
      description: 'Steal 1 ware from opponent\'s market.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Guard reaction window', 'Select 1 ware from opponent market', 'Move to your market'],
      validation: ['opponent has >= 1 ware in market'],
      uiPrompts: ['Select opponent ware to steal'],
      aiHeuristic: 'steal_highest_value_opponent_ware',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'hyena',
      name: 'Hyena',
      type: 'animal',
      description: 'View opponent\'s hand, take 1 card, give 1 card back.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Guard reaction window', 'View opponent hand', 'Take 1 card', 'Give 1 card'],
      validation: [],
      uiPrompts: ['Select card to take from opponent', 'Select card to give'],
      aiHeuristic: 'take_best_opponent_card_give_worst_own',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'snake',
      name: 'Snake',
      type: 'animal',
      description: 'Both players keep 1 utility and discard the rest.',
      interactionType: 'OPPONENT_SELECT',
      flowSteps: ['Guard reaction window', 'Both players keep 1 utility, discard rest'],
      validation: [],
      uiPrompts: ['Keep which utility? (discard the rest)'],
      aiHeuristic: 'keep_best_utility',
    },
    copies: 1,
  },
  {
    design: {
      designId: 'elephant',
      name: 'Elephant',
      type: 'animal',
      description: 'Pool all wares from both markets and draft them alternately.',
      interactionType: 'DRAFT',
      flowSteps: ['Guard reaction window', 'Pool all wares from both markets', 'Alternate picks, active first'],
      validation: [],
      uiPrompts: ['Pick 1 ware from the pool (your turn)'],
      aiHeuristic: 'draft_highest_value_ware_first',
    },
    copies: 1,
  },
  {
    design: {
      designId: 'ape',
      name: 'Ape',
      type: 'animal',
      description: 'Pool all hand cards from both players and draft them alternately.',
      interactionType: 'DRAFT',
      flowSteps: ['Guard reaction window', 'Pool all hand cards', 'Alternate picks, active first'],
      validation: [],
      uiPrompts: ['Pick 1 card from the pool (your turn)'],
      aiHeuristic: 'draft_best_card_from_opponent_hand',
    },
    copies: 1,
  },
  {
    design: {
      designId: 'lion',
      name: 'Lion',
      type: 'animal',
      description: 'Pool all utilities from both players and draft them alternately (max 3 each).',
      interactionType: 'DRAFT',
      flowSteps: ['Guard reaction window', 'Pool all utilities', 'Alternate picks, active first (max 3 each)'],
      validation: [],
      uiPrompts: ['Pick 1 utility from the pool (your turn)'],
      aiHeuristic: 'always_guard_against_lion',
    },
    copies: 1,
  },
  {
    design: {
      designId: 'cheetah',
      name: 'Cheetah',
      type: 'animal',
      description: 'Opponent chooses: give you 2g, or let you draw 2 cards.',
      interactionType: 'OPPONENT_SELECT',
      flowSteps: ['Guard reaction window', 'Opponent chooses: give 2g OR active draws 2 cards'],
      validation: [],
      uiPrompts: ['Opponent: Give 2g or let them draw 2 cards?'],
      aiHeuristic: 'always_guard_against_cheetah',
    },
    copies: 1,
  },
];

// --- Utility Card Designs (10 unique) ---

const UTILITY_DESIGNS: { design: CardDesignTemplate; copies: number }[] = [
  {
    design: {
      designId: 'well',
      name: 'Well',
      type: 'utility',
      description: 'Pay 1g to draw 1 card.',
      interactionType: 'NONE',
      flowSteps: ['Pay 1g', 'Draw 1 card from deck'],
      validation: ['gold >= 1'],
      uiPrompts: ['Pay 1g to draw a card?'],
      aiHeuristic: 'always_use_if_gold_available',
    },
    copies: 3,
  },
  {
    design: {
      designId: 'drums',
      name: 'Drums',
      type: 'utility',
      description: 'Return 1 ware from your market to supply, then draw 1 card.',
      interactionType: 'WARE_RETURN',
      flowSteps: ['Return 1 ware from market to supply', 'Draw 1 card from deck'],
      validation: ['market has >= 1 ware'],
      uiPrompts: ['Select ware to return for a card draw'],
      aiHeuristic: 'return_lowest_value_ware',
    },
    copies: 3,
  },
  {
    design: {
      designId: 'throne',
      name: 'Throne',
      type: 'utility',
      description: 'Steal 1 opponent ware and give 1 of yours in return.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Select 1 ware from opponent market to steal', 'Select 1 ware from own market to give', 'Swap'],
      validation: ['opponent has >= 1 ware', 'active player has >= 1 ware'],
      uiPrompts: ['Select opponent ware to steal', 'Select own ware to give'],
      aiHeuristic: 'steal_max_value_give_min_value',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'boat',
      name: 'Boat',
      type: 'utility',
      description: 'Discard 1 hand card, then take 1 ware of any type from supply.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Discard 1 card from hand', 'Choose 1 ware type from supply', 'Add 1 to market'],
      validation: ['hand has >= 1 card', 'market has space', 'supply has chosen type'],
      uiPrompts: ['Select card to discard from hand', 'Choose ware type to receive'],
      aiHeuristic: 'discard_lowest_value_receive_highest',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'scale',
      name: 'Scale',
      type: 'utility',
      description: 'Draw 2 cards, keep 1 and give the other to opponent.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Draw 2 cards from deck', 'Keep 1, give other to opponent'],
      validation: ['deck has >= 2 cards'],
      uiPrompts: ['Keep which card? (other goes to opponent)'],
      aiHeuristic: 'keep_highest_value_card',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'mask_of_transformation',
      name: 'Mask of Transformation',
      type: 'utility',
      description: 'Before drawing: trade 1 hand card for the top card of the discard pile.',
      interactionType: 'DRAW_MODIFIER',
      flowSteps: ['Before normal draw: trade 1 hand card for top of discard pile'],
      validation: ['hand has >= 1 card', 'discard pile has >= 1 card'],
      uiPrompts: ['Trade hand card for top of discard?'],
      aiHeuristic: 'use_if_top_discard_above_average',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'supplies',
      name: 'Supplies',
      type: 'utility',
      description: 'Pay 1g or discard 1 card, then draw from deck until you find a ware card.',
      interactionType: 'BINARY_CHOICE',
      flowSteps: ['Pay 1g or discard 1 card from hand first', 'Then draw from deck until ware card found', 'Keep the ware card, discard non-wares'],
      validation: [],
      uiPrompts: ['Pay 1g or discard 1 card first?', 'Drawing until ware found...'],
      aiHeuristic: 'pay_if_gold_available_else_discard_lowest',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'kettle',
      name: 'Kettle',
      type: 'utility',
      description: 'Discard 1 or 2 cards from hand, then draw the same number.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Discard 1 or 2 cards from hand', 'Draw same number from deck'],
      validation: ['hand has >= 1 card'],
      uiPrompts: ['Select cards to discard (1-2)'],
      aiHeuristic: 'discard_lowest_value_card',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'leopard_statue',
      name: 'Leopard Statue',
      type: 'utility',
      description: 'Pay 2g to take 1 ware of any type from supply.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Pay 2g', 'Choose 1 ware type from supply', 'Add 1 to market'],
      validation: ['gold >= 2', 'market has space', 'supply has chosen type'],
      uiPrompts: ['Pay 2g. Choose ware type to receive'],
      aiHeuristic: 'buy_highest_value_ware',
    },
    copies: 2,
  },
  {
    design: {
      designId: 'weapons',
      name: 'Weapons',
      type: 'utility',
      description: 'Discard 1 card from hand to receive 2g.',
      interactionType: 'ACTIVE_SELECT',
      flowSteps: ['Discard 1 card from hand', 'Receive 2g'],
      validation: ['hand has >= 1 card'],
      uiPrompts: ['Select card to discard from hand for +2g'],
      aiHeuristic: 'discard_lowest_value_card',
    },
    copies: 2,
  },
];

// ============================================================================
// DECK COMPOSITION — Build all 110 DeckCardIds programmatically
// ============================================================================

interface DeckEntry {
  deckCardId: DeckCardId;
  design: CardDesignTemplate;
}

function buildDeckEntries(): DeckEntry[] {
  const entries: DeckEntry[] = [];

  const addDesign = (design: CardDesignTemplate, copies: number) => {
    for (let c = 1; c <= copies; c++) {
      entries.push({
        deckCardId: `${design.designId}_${c}`,
        design,
      });
    }
  };

  // Ware cards (40)
  for (const { design, copies } of WARE_DESIGNS) {
    addDesign(design, copies);
  }

  // Stand cards (5)
  addDesign(STAND_DESIGN.design, STAND_DESIGN.copies);

  // People cards (29)
  for (const { design, copies } of PEOPLE_DESIGNS) {
    addDesign(design, copies);
  }

  // Animal cards (14)
  for (const { design, copies } of ANIMAL_DESIGNS) {
    addDesign(design, copies);
  }

  // Utility cards (22)
  for (const { design, copies } of UTILITY_DESIGNS) {
    addDesign(design, copies);
  }

  return entries;
}

const DECK_ENTRIES = buildDeckEntries();

// ============================================================================
// MASTER DATABASE — 110 CardDefinition entries
// ============================================================================

function buildCardDatabase(): Map<DeckCardId, CardDefinition> {
  const db = new Map<DeckCardId, CardDefinition>();
  for (const entry of DECK_ENTRIES) {
    const def: CardDefinition = {
      id: entry.deckCardId,
      designId: entry.design.designId,
      name: entry.design.name,
      type: entry.design.type,
      description: entry.design.description,
      interactionType: entry.design.interactionType,
      wares: entry.design.wares,
      flowSteps: entry.design.flowSteps,
      validation: entry.design.validation,
      uiPrompts: entry.design.uiPrompts,
      aiHeuristic: entry.design.aiHeuristic,
    };
    db.set(entry.deckCardId, def);
  }
  return db;
}

const CARD_DB = buildCardDatabase();

// ============================================================================
// ALL_DECK_CARD_IDS — flat array of all 110 DeckCardIds
// ============================================================================

export const ALL_DECK_CARD_IDS: DeckCardId[] = DECK_ENTRIES.map(e => e.deckCardId);

// Validate count at module load
if (ALL_DECK_CARD_IDS.length !== 110) {
  throw new Error(`Expected 110 deck card IDs, got ${ALL_DECK_CARD_IDS.length}`);
}

// ============================================================================
// DECK_COMPOSITION — for reference / deck building
// ============================================================================

export const DECK_COMPOSITION: { designId: CardDesignId; copies: number }[] = [
  ...WARE_DESIGNS.map(w => ({ designId: w.design.designId, copies: w.copies })),
  { designId: STAND_DESIGN.design.designId, copies: STAND_DESIGN.copies },
  ...PEOPLE_DESIGNS.map(p => ({ designId: p.design.designId, copies: p.copies })),
  ...ANIMAL_DESIGNS.map(a => ({ designId: a.design.designId, copies: a.copies })),
  ...UTILITY_DESIGNS.map(u => ({ designId: u.design.designId, copies: u.copies })),
];

// ============================================================================
// Lookup Functions
// ============================================================================

/**
 * Check if a string is a valid DeckCardId.
 */
export function isValidDeckCardId(id: string): boolean {
  return CARD_DB.has(id);
}

/**
 * Get a card definition by its DeckCardId. Throws if ID is not found.
 */
export function getCard(id: DeckCardId): CardDefinition {
  const card = CARD_DB.get(id);
  if (!card) {
    throw new Error(`Card not found: ${id}`);
  }
  return card;
}

/**
 * Get the design ID from a DeckCardId.
 */
export function getDesignId(id: DeckCardId): CardDesignId {
  return getCard(id).designId;
}

/**
 * Get all card definitions matching a given type.
 */
export function getCardsByType(type: CardType): CardDefinition[] {
  const results: CardDefinition[] = [];
  for (const def of CARD_DB.values()) {
    if (def.type === type) {
      results.push(def);
    }
  }
  return results;
}

/**
 * Check if a DeckCardId's design matches any of the given design IDs.
 */
export function isDesign(deckCardId: DeckCardId, ...designIds: CardDesignId[]): boolean {
  const card = CARD_DB.get(deckCardId);
  if (!card) return false;
  return designIds.includes(card.designId);
}
