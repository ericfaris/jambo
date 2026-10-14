// ============================================================================
// Animal strikes — the target of an animal attack takes visible damage on the
// table before it moves (2026-10-13). Pure planner; StrikeLayer.tsx animates
// the result and the board keeps the marks (card-damage context) while the
// damaged thing stays in sight.
//
//   Crocodile  bite out of the used utility's corner → discard
//   Hyena      gnawed top edge + slobber on the card taken → taker's hand
//   Snake      fang marks + venom on every discarded utility → discard
//   Parrot     a chip pecked from the stolen ware, feathers → thief's market
//   Cheetah    claw rakes across the 2 coins paid → payee's gold
//   Guard      the Guard card slides in, the strike clangs off
//
// Elephant, Ape and Lion pool everything into a draft: no single target, no
// strike.
// ============================================================================

import type { DeckCardId, GameLogEntry, PlayerState, WareType } from '../engine/types.ts';
import { isValidDeckCardId } from '../engine/cards/CardDatabase.ts';

/** A lasting mark on a card while it stays in sight. */
export type CardDamage = 'bite' | 'gnaw' | 'venom';

export type Strike =
  | { kind: 'bite'; cardId: DeckCardId; victim: 0 | 1 }
  | { kind: 'gnaw'; cardId: DeckCardId | null; victim: 0 | 1; taker: 0 | 1 }
  | { kind: 'venom'; cardIds: DeckCardId[]; owners: (0 | 1)[]; kept: DeckCardId[] }
  | { kind: 'peck'; ware: WareType; victim: 0 | 1; fromIndex: number; thief: 0 | 1; toIndex: number }
  | { kind: 'claw'; coins: number; victim: 0 | 1; payee: 0 | 1 }
  | { kind: 'guard'; guardCard: DeckCardId; defender: 0 | 1 };

/** What the planner reads from a state (GameState, or the online board state). */
export interface StrikeView {
  players: readonly [Pick<PlayerState, 'utilities' | 'market' | 'gold' | 'hand'>, Pick<PlayerState, 'utilities' | 'market' | 'gold' | 'hand'>];
  log: readonly GameLogEntry[];
}

const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);

function utilityIds(view: StrikeView, player: 0 | 1): DeckCardId[] {
  return view.players[player].utilities.map((u) => u.cardId);
}

/**
 * The strikes a state change carries, in log order. Reads only the log
 * entries added between `prev` and `next`, and the state change itself for
 * what left where.
 */
export function planStrikes(prev: StrikeView, next: StrikeView): Strike[] {
  if (next.log.length <= prev.log.length) return [];
  const fresh = next.log.slice(prev.log.length);
  const strikes: Strike[] = [];

  for (const entry of fresh) {
    switch (entry.action) {
      case 'GUARD_PLAYED': {
        if (entry.card) strikes.push({ kind: 'guard', guardCard: entry.card, defender: entry.player });
        break;
      }
      case 'CROCODILE_CLEANUP': {
        // "Discarded opponent's <id> after Crocodile use"
        const id = entry.details?.match(/Discarded opponent's (\S+) after/)?.[1];
        if (id && isValidDeckCardId(id)) strikes.push({ kind: 'bite', cardId: id, victim: other(entry.player) });
        break;
      }
      case 'HYENA_SWAP': {
        // "Took <id>, gave <id>" / "Took <id>; no eligible card to give"
        const id = entry.details?.match(/^Took (\S+?)[,;]/)?.[1] ?? null;
        if (!id) break;
        strikes.push({ kind: 'gnaw', cardId: isValidDeckCardId(id) ? id : null, victim: other(entry.player), taker: entry.player });
        break;
      }
      case 'PARROT_STEAL': {
        const ware = entry.details?.match(/^Stole (\w+) from/)?.[1] as WareType | undefined;
        if (!ware) break;
        const thief = entry.player;
        const victim = other(thief);
        const fromIndex = prev.players[victim].market.findIndex((w, i) => w === ware && next.players[victim].market[i] !== ware);
        const toIndex = next.players[thief].market.findIndex((w, i) => w === ware && prev.players[thief].market[i] !== ware);
        if (fromIndex >= 0 && toIndex >= 0) strikes.push({ kind: 'peck', ware, victim, fromIndex, thief, toIndex });
        break;
      }
      case 'SNAKE_KEEP':
      case 'SNAKE_COMPLETE': {
        const cardIds: DeckCardId[] = [];
        const owners: (0 | 1)[] = [];
        for (const p of [0, 1] as const) {
          const now = new Set(utilityIds(next, p));
          for (const id of utilityIds(prev, p)) {
            if (!now.has(id)) { cardIds.push(id); owners.push(p); }
          }
        }
        if (cardIds.length > 0) {
          // only the side(s) that just chose: the other may still be deciding
          const kept = ([0, 1] as const).filter((p) => owners.includes(p)).flatMap((p) => utilityIds(next, p));
          strikes.push({ kind: 'venom', cardIds, owners, kept });
        }
        break;
      }
      case 'CHEETAH_EFFECT': {
        const coins = Number(entry.details?.match(/gave (\d+)g/)?.[1] ?? 0);
        if (coins > 0) strikes.push({ kind: 'claw', coins: Math.min(coins, 3), victim: other(entry.player), payee: entry.player });
        break;
      }
      default:
        break;
    }
  }
  // two log entries can describe one snake (keep, then complete): one strike per card
  const seen = new Set<string>();
  return strikes.filter((s) => {
    if (s.kind !== 'venom') return true;
    const key = s.cardIds.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Strikes that animate the move themselves, so the plain flight for it is skipped. */
export function strikeOwnsFlight(
  strikes: readonly Strike[],
  flight: { kind: 'ware' | 'coin' | 'card'; from: { type: string; player?: 0 | 1; index?: number }; to: { type: string; player?: 0 | 1; index?: number } },
): boolean {
  return strikes.some((s) => {
    if (s.kind === 'peck') {
      return flight.kind === 'ware' && flight.from.type === 'slot' && flight.to.type === 'slot'
        && flight.from.player === s.victim && flight.from.index === s.fromIndex
        && flight.to.player === s.thief && flight.to.index === s.toIndex;
    }
    if (s.kind === 'claw') {
      return flight.kind === 'coin' && flight.from.type === 'gold' && flight.to.type === 'gold'
        && flight.from.player === s.victim && flight.to.player === s.payee;
    }
    if (s.kind === 'gnaw') {
      return flight.kind === 'card' && flight.from.type === 'hand' && flight.to.type === 'hand';
    }
    return false;
  });
}

/** The lasting mark a strike leaves on its card(s), and where it lives. */
export function strikeMarks(strike: Strike, viewer: 0 | 1): { cardId: DeckCardId; damage: CardDamage; where: 'discard' | 'hand' }[] {
  switch (strike.kind) {
    case 'bite': return [{ cardId: strike.cardId, damage: 'bite', where: 'discard' }];
    case 'venom': return strike.cardIds.map((cardId) => ({ cardId, damage: 'venom' as const, where: 'discard' as const }));
    // only your own hand is face up: a card the opponent took is out of sight
    case 'gnaw': return strike.cardId && strike.taker === viewer ? [{ cardId: strike.cardId, damage: 'gnaw', where: 'hand' }] : [];
    default: return [];
  }
}

export interface DamageMark { damage: CardDamage; where: 'discard' | 'hand' }

/** Keep a mark only while its card is still where it was left (it leaves sight → it heals). */
export function pruneMarks(
  marks: ReadonlyMap<DeckCardId, DamageMark>,
  discardPile: readonly DeckCardId[],
  viewerHand: readonly DeckCardId[],
): Map<DeckCardId, DamageMark> {
  const out = new Map<DeckCardId, DamageMark>();
  for (const [id, mark] of marks) {
    const stillThere = mark.where === 'discard' ? discardPile.includes(id) : viewerHand.includes(id);
    if (stillThere) out.set(id, mark);
  }
  return out;
}

/** A pecked ware keeps its chip while it sits in the same slot. */
export interface ChipMark { player: 0 | 1; index: number; ware: WareType }

export function pruneChips(chips: readonly ChipMark[], markets: readonly [(WareType | null)[], (WareType | null)[]]): ChipMark[] {
  return chips.filter((c) => markets[c.player][c.index] === c.ware);
}
