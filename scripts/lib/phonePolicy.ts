// ============================================================================
// Phone-side move policy — chooses moves for one seat from only what that
// seat's phone can see (PublicGameState + its PrivateGameState). Shared by
// the Cast/friend protocol fuzzer, the friend-room server test and the online
// E2E driver (the browser imports it through Vite), so: pure, no Node APIs.
// ============================================================================

import type { GameAction, InteractionResponse } from '../../src/engine/types.ts';
import { WARE_TYPES } from '../../src/engine/types.ts';
import type { PublicGameState, PrivateGameState } from '../../src/multiplayer/types.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';
import { getFallbackInteractionResponses, getRandomAiAction } from '../../src/ai/RandomAI.ts';
import { getValidActions } from '../../src/engine/validation/actionValidator.ts';
import { toBoardState, responderFromPublic } from '../../src/ui/onlineView.ts';

export type Rng = () => number;

function pick<T>(rng: Rng, xs: readonly T[]): T { return xs[Math.floor(rng() * xs.length)]!; }

/**
 * Many candidate moves, good and deliberately bad, in a random order — the
 * fuzzer sends them until the server accepts one (it must reject the rest
 * with ERROR, never crash or corrupt).
 */
export function candidateActions(pub: PublicGameState, priv: PrivateGameState, me: 0 | 1, rng: Rng): GameAction[] {
  const out: GameAction[] = [];
  const shuffle = <T>(xs: T[]) => xs.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (pub.pendingGuardReaction?.targetPlayer === me) return shuffle([{ type: 'GUARD_REACTION', play: true }, { type: 'GUARD_REACTION', play: false }]);
  if (pub.pendingWareCardReaction?.targetPlayer === me) return shuffle([{ type: 'WARE_CARD_REACTION', play: true }, { type: 'WARE_CARD_REACTION', play: false }]);
  if (priv.pendingResolution) {
    if (pub.canCancel && rng() < 0.05) out.push({ type: 'CANCEL_ACTION' });
    let fb: InteractionResponse[] = [];
    try { fb = getFallbackInteractionResponses(toBoardState(pub, priv, me)); } catch { /* partial view */ }
    const junk: InteractionResponse[] = [
      { type: 'SELECT_WARE_TYPE', wareType: 'gold' as never }, { type: 'SELECT_CARDS', cardIds: [priv.hand[0] ?? 'x', priv.hand[0] ?? 'x'] },
      { type: 'AUCTION_BID', amount: -1 }, { type: 'SELECT_WARE', wareIndex: 99 },
    ];
    for (const r of shuffle([...fb, pick(rng, junk), ...WARE_TYPES.map((w) => ({ type: 'SELECT_WARE_TYPE', wareType: w }) as InteractionResponse), { type: 'BINARY_CHOICE', choice: 0 }, { type: 'BINARY_CHOICE', choice: 1 }, { type: 'AUCTION_PASS' }, { type: 'AUCTION_BID', amount: 1 + Math.floor(rng() * 4) }] as InteractionResponse[])) {
      out.push({ type: 'RESOLVE_INTERACTION', response: r });
    }
    // every card id / index this phone can see in the decision
    const visible = new Set<string>(priv.hand);
    const scan = JSON.stringify([priv.pendingResolution, priv.revealedCards, priv.revealedHand, pub.discardPile.slice(0, 12)]);
    for (const m of scan.matchAll(/"([a-z]+(?:_[a-z0-9]+)*_\d+)"/g)) visible.add(m[1]!);
    for (const id of visible) {
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_CARD', cardId: id } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'DISCARD_PICK', cardId: id } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_CARDS', cardIds: [id] } });
    }
    const marketIdx = pub.players[me].market.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
    const oppIdx = pub.players[1 - me]!.market.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
    for (const i of [...marketIdx, ...oppIdx]) {
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_WARE', wareIndex: i } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'RETURN_WARE', wareIndex: i } });
    }
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELL_WARES', wareIndices: marketIdx } });
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_WARES', wareIndices: marketIdx.slice(0, 3) } });
    for (let i = 0; i < 6; i++) {
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'DECK_PEEK_PICK', cardIndex: i } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_UTILITY', utilityIndex: i } });
    }
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: priv.hand.map((_, i) => i).slice(0, Math.max(0, priv.hand.length - 3)) } });
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'OPPONENT_CHOICE', choice: 0 } }, { type: 'RESOLVE_INTERACTION', response: { type: 'OPPONENT_CHOICE', choice: 1 } });
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_CARD', cardId: '' } });
    return out;
  }
  if (pub.phase === 'DRAW') {
    return priv.drawnCard
      ? shuffle<GameAction>([{ type: 'KEEP_CARD' }, { type: 'DISCARD_DRAWN' }])
      : shuffle<GameAction>([{ type: 'DRAW_CARD' }, { type: 'SKIP_DRAW' }, { type: 'END_TURN' }]);
  }
  for (const id of priv.hand) {
    if (getCard(id).type === 'ware') out.push({ type: 'PLAY_CARD', cardId: id, wareMode: rng() < 0.5 ? 'buy' : 'sell' });
    else out.push({ type: 'PLAY_CARD', cardId: id });
  }
  pub.players[me].utilities.forEach((_, i) => out.push({ type: 'ACTIVATE_UTILITY', utilityIndex: i }));
  const end: GameAction = { type: 'END_TURN' };
  const shuffled = shuffle(out);
  return rng() < 0.18 ? [end, ...shuffled] : [...shuffled, end];
}

export interface ChooseOptions {
  /** Chance to back out of a cancellable resolution (exercises CANCEL_ACTION). */
  cancelRate?: number;
  /** Chance to end the turn instead of another play, so games finish. */
  endTurnRate?: number;
}

/**
 * One sensible move for this seat, or null when it isn't this seat's
 * decision. Reasoned on the synthesized board (toBoardState), exactly what the
 * online board's own validation sees; the server stays the judge.
 */
export function chooseAction(pub: PublicGameState, priv: PrivateGameState, me: 0 | 1, rng: Rng, options: ChooseOptions = {}): GameAction | null {
  const { cancelRate = 0.1, endTurnRate = 0.12 } = options;
  if (responderFromPublic(pub) !== me) return null;
  if (pub.pendingGuardReaction) return { type: 'GUARD_REACTION', play: rng() < 0.6 };
  if (pub.pendingWareCardReaction) return { type: 'WARE_CARD_REACTION', play: rng() < 0.6 };
  const board = toBoardState(pub, priv, me);
  if (priv.pendingResolution) {
    if (pub.canCancel && pub.currentPlayer === me && rng() < cancelRate) return { type: 'CANCEL_ACTION' };
    try {
      const action = getRandomAiAction(board, rng);
      if (action) return action;
    } catch { /* fall through to a fallback response */ }
    const fallback = getFallbackInteractionResponses(board)[0];
    return { type: 'RESOLVE_INTERACTION', response: fallback ?? { type: 'SELECT_CARD', cardId: '' } };
  }
  let valid: GameAction[] = [];
  try { valid = getValidActions(board); } catch { valid = []; }
  if (valid.length === 0) return pub.phase === 'PLAY' ? { type: 'END_TURN' } : { type: 'SKIP_DRAW' };
  const endTurn = valid.find((a) => a.type === 'END_TURN');
  if (endTurn && rng() < endTurnRate) return endTurn;
  return pick(rng, valid);
}
