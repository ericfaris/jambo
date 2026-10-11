// ============================================================================
// Trader chatter — what each named trader says (in the speech bubble) as
// they make an ordinary move. Text only; voiced lines live in traders.ts.
// Never names a hidden card: a kept draw stays "this one".
// ============================================================================

import type { GameAction, GameState } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import type { Trader } from './traders.ts';

export type ChatterKey =
  | 'draw' | 'keep' | 'discard' | 'skipDraw'
  | 'buy' | 'sell' | 'play' | 'utility' | 'endTurn' | 'think'
  | 'guard' | 'noGuard' | 'rainMaker' | 'noRainMaker';

/** `{card}` is the (face-up) card's name; `{wares}` / `{Wares}` what a ware card trades. */
export const CHATTER: Record<Trader['id'], Record<ChatterKey, readonly string[]>> = {
  kito: {
    draw: ["Ooh, what's on top?", 'Let’s see, let’s see…'],
    keep: ['I’ll keep this one!', 'Ooh, a good one. Mine!'],
    discard: ['Nope, not that one.', 'Hmm, no thanks.'],
    skipDraw: ['I think I have enough cards. Right?'],
    buy: ['Buying {wares}! Is that a good price?', 'Some {wares}, please!'],
    sell: ['Selling {wares}! Gold, here I come!', 'My {wares}, sold! I think.'],
    play: ['Here goes my {card}!', 'Let’s try the {card}!'],
    utility: ['Using my {card}!'],
    endTurn: ['Your turn! Go easy on me.', 'Done! Your move.'],
    think: ['Umm… let me think…', 'Which one, which one…'],
    guard: ['Guard! Ha, not today!'],
    noGuard: ['Okay… go ahead.'],
    rainMaker: ['I’ll grab that card, thanks!'],
    noRainMaker: ['I’ll let that one go.'],
  },
  amara: {
    draw: ['Let us see what the loom gives.', 'One more thread.'],
    keep: ['This one stays.', 'Yes. This will do nicely.'],
    discard: ['Not this thread.', 'No, not today.'],
    skipDraw: ['I have what I need.'],
    buy: ['A little {wares}, at a fair price.', 'Buying {wares}. Slowly, slowly.'],
    sell: ['My {wares}. Sold, and sold well.', 'Time to sell the {wares}.'],
    play: ['Now, the {card}.', 'I will play the {card}.'],
    utility: ['My {card}, if you please.'],
    endTurn: ['Your turn, friend.', 'Take your time. Your move.'],
    think: ['Hm. Let me consider.', 'Patience…'],
    guard: ['My Guard says no.'],
    noGuard: ['Go on, then.'],
    rainMaker: ['I will take that card back to my stall.'],
    noRainMaker: ['Keep it. I have enough.'],
  },
  baraka: {
    draw: ['What treasure is on top today?', 'Another card, another coin.'],
    keep: ['Ahh, this one I keep.', 'Mine. A bargain.'],
    discard: ['Worthless. Next!', 'Bah. Not even for half price.'],
    skipDraw: ['My hand is full of riches already.'],
    buy: ['{Wares}! I buy low…', 'A fine deal on {wares}.'],
    sell: ['…and I sell high! {Wares}!', 'The {wares}, sold. To me, the profit!'],
    play: ['Behold, the {card}!', 'For you, my friend: the {card}.'],
    utility: ['My trusty {card}.'],
    endTurn: ['Your move, my friend.', 'The stall is yours. Spend wisely.'],
    think: ['Let me count…', 'Hmm, the numbers, the numbers…'],
    guard: ['Not so fast! My Guard!'],
    noGuard: ['Fine, fine. Proceed.'],
    rainMaker: ['That card? I’ll take it, free of charge.'],
    noRainMaker: ['Keep your scraps.'],
  },
  zawadi: {
    draw: ['Let us see what the market offers.', 'The deck has more to tell.'],
    keep: ['This one I keep.', 'Good. This has a purpose.'],
    discard: ['Not this one.', 'Back to the pile.'],
    skipDraw: ['I have what I need, child.'],
    buy: ['Some {wares}, for later.', '{Wares}. Everything in its season.'],
    sell: ['The {wares}. The right time to sell.', 'Now I sell the {wares}.'],
    play: ['The {card}. Watch closely.', 'Now, the {card}.'],
    utility: ['My {card}.'],
    endTurn: ['Your turn, child.', 'Go on. Show me.'],
    think: ['Mm. Let me see…', 'One moment.'],
    guard: ['No, child. My Guard stands here.'],
    noGuard: ['Let it come.'],
    rainMaker: ['That card will serve me better.'],
    noRainMaker: ['Let it rest.'],
  },
};

function chatterKey(action: GameAction): { key: ChatterKey; cardId?: string } {
  switch (action.type) {
    case 'DRAW_CARD': return { key: 'draw' };
    case 'KEEP_CARD': return { key: 'keep' };
    case 'DISCARD_DRAWN': return { key: 'discard' };
    case 'SKIP_DRAW': return { key: 'skipDraw' };
    case 'PLAY_CARD': {
      const card = getCard(action.cardId);
      if (card.type === 'ware') return { key: action.wareMode === 'buy' ? 'buy' : 'sell', cardId: action.cardId };
      return { key: 'play', cardId: action.cardId };
    }
    case 'ACTIVATE_UTILITY': return { key: 'utility' };
    case 'END_TURN': return { key: 'endTurn' };
    case 'GUARD_REACTION': return { key: action.play ? 'guard' : 'noGuard' };
    case 'WARE_CARD_REACTION': return { key: action.play ? 'rainMaker' : 'noRainMaker' };
    default: return { key: 'think' };
  }
}

/** "trinkets", "salt and tea", "fruit, hides and silk", "a bit of everything". */
export function waresPhrase(types: readonly string[]): string {
  const unique = [...new Set(types)];
  if (unique.length >= 6) return 'a bit of everything';
  if (unique.length === 1) return unique[0];
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
}

/**
 * What `trader` says as they make `action` in `state`. Takes rotate with the
 * log length, so back-to-back moves don't repeat word for word.
 */
export function traderChatter(trader: Pick<Trader, 'id'>, action: GameAction, state: GameState): string {
  const { key, cardId } = chatterKey(action);
  const takes = CHATTER[trader.id][key];
  const line = takes[state.log.length % takes.length];
  let name = cardId ? getCard(cardId).name : '';
  if (action.type === 'ACTIVATE_UTILITY') {
    const u = state.players[state.currentPlayer].utilities[action.utilityIndex];
    name = u ? getCard(u.cardId).name : 'utility';
  }
  const types = cardId ? getCard(cardId).wares?.types : undefined;
  const wares = types ? waresPhrase(types) : name;
  return line
    .replace('{card}', name)
    .replace('{wares}', wares)
    .replace('{Wares}', wares.charAt(0).toUpperCase() + wares.slice(1));
}
