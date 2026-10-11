// ============================================================================
// Game story — what happened, for the endgame screen. Built by replaying the
// recorded actions from the seeded starting state (the engine is
// deterministic), because the log doesn't record gold totals.
// ============================================================================

import type { DeckCardId, GameAction, GameState } from '../engine/types.ts';
import { processAction } from '../engine/GameEngine.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';

export interface GoldPoint {
  /** 0 = the start; then one point per finished turn (and the final state). */
  turn: number;
  gold: [number, number];
}

export interface Payday {
  player: 0 | 1;
  cardId: DeckCardId;
  gold: number;
  turn: number;
}

export interface CardTally {
  cardId: DeckCardId;
  /** Net gold this card design brought its player across the game. */
  gold: number;
  plays: number;
}

export interface GameStory {
  timeline: GoldPoint[];
  /** The turn whose owner gained the most ground on the other player. */
  biggestSwing: { turn: number; player: 0 | 1; gain: number } | null;
  /** Each player's single biggest gold gain from one card play (incl. its resolution). */
  bestPayday: [Payday | null, Payday | null];
  /** Each player's most profitable card design, net of what it cost. */
  mvp: [CardTally | null, CardTally | null];
  /** Turn on which someone reached 60g, if they did. */
  triggerTurn: number | null;
}

interface Attribution {
  player: 0 | 1;
  cardId: DeckCardId;
  turn: number;
  gold: number;
}

/** Which card a gold change belongs to: the card being played or resolved. */
function attributionFor(before: GameState, action: GameAction, current: Attribution | null): Attribution | null {
  switch (action.type) {
    case 'PLAY_CARD':
      return { player: before.currentPlayer, cardId: action.cardId, turn: before.turn, gold: 0 };
    case 'ACTIVATE_UTILITY': {
      const u = before.players[before.currentPlayer].utilities[action.utilityIndex];
      return u ? { player: before.currentPlayer, cardId: u.cardId, turn: before.turn, gold: 0 } : null;
    }
    case 'RESOLVE_INTERACTION':
    case 'GUARD_REACTION':
    case 'WARE_CARD_REACTION':
      // still resolving the card that started it
      return current;
    default:
      return null;
  }
}

export function buildGameStory(start: GameState, actions: readonly GameAction[]): GameStory {
  const timeline: GoldPoint[] = [{ turn: 0, gold: [start.players[0].gold, start.players[1].gold] }];
  const tallies: [Map<string, CardTally>, Map<string, CardTally>] = [new Map(), new Map()];
  const best: [Payday | null, Payday | null] = [null, null];
  let biggestSwing: GameStory['biggestSwing'] = null;
  let triggerTurn: number | null = null;
  let current: Attribution | null = null;
  let turnStart: [number, number] = [start.players[0].gold, start.players[1].gold];

  const closeAttribution = () => {
    if (!current) return;
    const { player, cardId, gold, turn } = current;
    const design = getCard(cardId).designId;
    const t = tallies[player].get(design) ?? { cardId, gold: 0, plays: 0 };
    tallies[player].set(design, { cardId: t.cardId, gold: t.gold + gold, plays: t.plays + 1 });
    if (gold > 0 && (!best[player] || gold > best[player]!.gold)) best[player] = { player, cardId, gold, turn };
    current = null;
  };

  let s = start;
  for (const action of actions) {
    const before = s;
    try {
      s = processAction(s, action);
    } catch {
      break; // a replay that no longer applies — tell the story so far
    }
    const next = attributionFor(before, action, current);
    if (next !== current) {
      closeAttribution();
      current = next;
    }
    if (current) {
      current.gold += s.players[current.player].gold - before.players[current.player].gold;
    }
    if (triggerTurn === null && s.endgame) triggerTurn = before.turn + 1;

    if (action.type === 'END_TURN') {
      closeAttribution();
      const owner = before.currentPlayer;
      const other: 0 | 1 = owner === 0 ? 1 : 0;
      const gold: [number, number] = [s.players[0].gold, s.players[1].gold];
      const gain = (gold[owner] - turnStart[owner]) - (gold[other] - turnStart[other]);
      if (gain > 0 && (!biggestSwing || gain > biggestSwing.gain)) biggestSwing = { turn: before.turn + 1, player: owner, gain };
      timeline.push({ turn: before.turn + 1, gold });
      turnStart = gold;
    }
  }
  closeAttribution();
  const last = timeline[timeline.length - 1];
  const final: [number, number] = [s.players[0].gold, s.players[1].gold];
  if (last.gold[0] !== final[0] || last.gold[1] !== final[1]) timeline.push({ turn: s.turn + 1, gold: final });

  const mvpOf = (m: Map<string, CardTally>): CardTally | null => {
    let top: CardTally | null = null;
    for (const t of m.values()) if (t.gold > 0 && (!top || t.gold > top.gold)) top = t;
    return top;
  };

  return { timeline, biggestSwing, bestPayday: best, mvp: [mvpOf(tallies[0]), mvpOf(tallies[1])], triggerTurn };
}
