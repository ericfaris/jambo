/// <reference types="node" />
// ============================================================================
// Engine fuzzer — plays many headless games with random legal moves (and
// adversarial garbage responses) and checks, after every action:
//   - rules invariants (checkInvariants) and extra sanity bounds
//   - the engine never mutates its input state (immutability rule)
//   - every action getValidActions() offers is accepted by the engine
//   - a pending decision always has at least one accepted response (no stall)
//   - an accepted garbage response never corrupts the state
//   - endgame rules: ≥60g at turn end triggers; exactly one final turn; GAME_OVER after it
//   - state survives a JSON round-trip (autosave) and the game replays identically
//   - public/private state split never leaks the other player's hand
//
// usage: npx tsx scripts/fuzz.ts [games=500] [seedBase=900000] [maxSteps=6000]
// Exit code 1 if any finding. Findings include seed + step for reproduction.
// ============================================================================

import type { GameAction, GameState, InteractionResponse, WareType } from '../src/engine/types.ts';
import { WARE_TYPES, CONSTANTS } from '../src/engine/types.ts';
import { processAction } from '../src/engine/GameEngine.ts';
import { getValidActions, validateAction } from '../src/engine/validation/actionValidator.ts';
import { checkInvariants } from '../src/engine/validation/invariants.ts';
import { getResponder } from '../src/engine/responder.ts';
import { getRandomInteractionResponse, getFallbackInteractionResponses } from '../src/ai/RandomAI.ts';
import { createReplayLog, createStartingState, replayToState } from '../src/persistence/replayLog.ts';
import { extractPublicState, extractPrivateState } from '../src/multiplayer/stateSplitter.ts';
import { canCancelAction } from '../src/engine/cancelAction.ts';
import { createRng } from '../src/utils/rng.ts';

const [GAMES, SEED_BASE, MAX_STEPS] = [
  Number(process.argv[2] ?? 500),
  Number(process.argv[3] ?? 900000),
  Number(process.argv[4] ?? 6000),
];

interface Finding { kind: string; seed: number; step: number; msg: string }
const findings: Finding[] = [];
const seenKinds = new Map<string, number>();
function report(kind: string, seed: number, step: number, msg: string) {
  const key = `${kind}:${msg.slice(0, 120)}`;
  seenKinds.set(key, (seenKinds.get(key) ?? 0) + 1);
  if ((seenKinds.get(key) ?? 0) <= 3) findings.push({ kind, seed, step, msg });
}

/** Process without letting a thrown error hide a mutation of the input. */
function tryAction(state: GameState, action: GameAction): { ok: true; next: GameState } | { ok: false; error: string; mutated: boolean } {
  const before = JSON.stringify(state);
  try {
    const next = processAction(state, action);
    if (JSON.stringify(state) !== before) return { ok: false, error: 'input state mutated by a successful action', mutated: true };
    return { ok: true, next };
  } catch (e) {
    return { ok: false, error: (e as Error).message, mutated: JSON.stringify(state) !== before };
  }
}

function pick<T>(rng: () => number, xs: readonly T[]): T { return xs[Math.floor(rng() * xs.length)]; }

/** Random, mostly-nonsense response — the engine may reject it, but must never accept corruption. */
function garbageResponse(rng: () => number, state: GameState): InteractionResponse {
  const p = state.players[getResponder(state)];
  const anyCard = () => pick(rng, [...p.hand, ...state.deck.slice(0, 3), ...state.discardPile.slice(0, 2), 'bogus_card_1']);
  const idx = () => Math.floor(rng() * 12) - 2; // includes -2..-1 and past-the-end
  switch (Math.floor(rng() * 15)) {
    case 0: return { type: 'SELECT_WARE', wareIndex: idx() };
    case 1: return { type: 'SELECT_WARE_TYPE', wareType: pick(rng, [...WARE_TYPES, 'gold' as WareType]) };
    case 2: return { type: 'SELECT_CARD', cardId: anyCard() };
    case 3: return { type: 'SELECT_CARDS', cardIds: [anyCard(), anyCard()] };
    case 4: return { type: 'SELECT_WARES', wareIndices: [idx(), idx(), idx()] };
    case 5: return { type: 'AUCTION_BID', amount: Math.floor(rng() * 40) - 5 };
    case 6: return { type: 'AUCTION_PASS' };
    case 7: return { type: 'BINARY_CHOICE', choice: (rng() < 0.5 ? 0 : 1) };
    case 8: return { type: 'DECK_PEEK_PICK', cardIndex: idx() };
    case 9: return { type: 'DISCARD_PICK', cardId: anyCard() };
    case 10: return { type: 'SELL_WARES', wareIndices: [idx(), idx()] };
    case 11: return { type: 'RETURN_WARE', wareIndex: idx() };
    case 12: return { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: [idx(), idx()] };
    case 13: return { type: 'OPPONENT_CHOICE', choice: (rng() < 0.5 ? 0 : 1) };
    default: return { type: 'SELECT_UTILITY', utilityIndex: idx() };
  }
}

function sanity(s: GameState): string[] {
  const out: string[] = [];
  if (s.actionsLeft < 0 || s.actionsLeft > CONSTANTS.MAX_ACTIONS) out.push(`actionsLeft=${s.actionsLeft}`);
  for (const pl of [0, 1] as const) {
    const p = s.players[pl];
    if (p.utilities.length > CONSTANTS.MAX_UTILITIES) out.push(`p${pl} has ${p.utilities.length} utilities`);
    // (duplicate utility designs ARE legal: "A player may have more than one of
    //  the same utility card in his play area" — rulebook)
    if (p.market.length < CONSTANTS.MARKET_SLOTS) out.push(`p${pl} market shrank to ${p.market.length}`);
  }
  for (const w of WARE_TYPES) if (s.wareSupply[w] < 0) out.push(`supply ${w}=${s.wareSupply[w]}`);
  if (s.cancellableAction && !s.pendingResolution) out.push('cancellableAction without a pending resolution');
  if (s.phase === 'GAME_OVER' && !s.endgame) out.push('GAME_OVER without endgame state');
  return out;
}

function leakCheck(s: GameState): string[] {
  const out: string[] = [];
  const pub = JSON.stringify(extractPublicState(s));
  for (const slot of [0, 1] as const) {
    const other = (1 - slot) as 0 | 1;
    const priv = extractPrivateState(s, slot);
    const mine = new Set(priv.hand);
    for (const id of s.players[other].hand) {
      // a card id can legitimately be in this player's own private view only if it's also theirs (it can't be)
      if (mine.has(id)) out.push(`slot ${slot} private hand contains opponent card ${id}`);
    }
  }
  if (/"hand":\s*\[/.test(pub)) out.push('public state contains a hand array');
  return out;
}

let totalSteps = 0, gameOvers = 0, capped = 0, garbageAccepted = 0, cancels = 0;
const start = Date.now();

for (let g = 0; g < GAMES; g++) {
  const seed = SEED_BASE + g;
  const rng = createRng(seed ^ 0x5bd1e995);
  let s = createStartingState(seed, (g % 2) as 0 | 1);
  const actions: GameAction[] = [];
  let lastCp = s.currentPlayer;
  let finalTurnsTaken = 0;

  for (let step = 0; step < MAX_STEPS; step++) {
    if (s.phase === 'GAME_OVER') { gameOvers++; break; }
    totalSteps++;

    // 1) Occasionally throw garbage at a pending decision
    if (s.pendingResolution && rng() < 0.15) {
      const garbage = garbageResponse(rng, s);
      const g2 = tryAction(s, { type: 'RESOLVE_INTERACTION', response: garbage });
      if (!g2.ok && g2.mutated) report('MUTATION', seed, step, `rejected garbage mutated state: ${g2.error}`);
      if (g2.ok) {
        garbageAccepted++;
        const v = [...checkInvariants(g2.next).map((x) => x.message ?? JSON.stringify(x)), ...sanity(g2.next)];
        if (v.length) {
          const pr = s.pendingResolution as { type: string; step?: string; utilityDesign?: string };
          report('GARBAGE_CORRUPTS', seed, step, `${pr.type}/${pr.utilityDesign ?? ''}/${pr.step ?? ''} accepted ${JSON.stringify(garbage)}: ${v.join('; ')}`);
        }
      }
    }

    // 2) Choose a real move
    let action: GameAction | null = null;
    if (s.pendingResolution) {
      if (canCancelAction(s) && rng() < 0.05) {
        action = { type: 'CANCEL_ACTION' };
      } else {
        const candidates: InteractionResponse[] = [];
        const primary = getRandomInteractionResponse(s, rng);
        if (primary) candidates.push(primary);
        candidates.push(...getFallbackInteractionResponses(s));
        for (const c of candidates) {
          const r = tryAction(s, { type: 'RESOLVE_INTERACTION', response: c });
          if (!r.ok && r.mutated) report('MUTATION', seed, step, `rejected response mutated state: ${r.error}`);
          if (r.ok) { action = { type: 'RESOLVE_INTERACTION', response: c }; break; }
        }
        if (primary && action && JSON.stringify((action as { response: unknown }).response) !== JSON.stringify(primary)) {
          report('AI_RESPONSE_REJECTED', seed, step, `${s.pendingResolution.type}/${'step' in s.pendingResolution ? s.pendingResolution.step : ''}: random AI's first choice was rejected`);
        }
        if (!action) { report('STALL', seed, step, `no response resolves ${s.pendingResolution.type} (${candidates.length} tried)`); break; }
      }
    } else {
      const valid = getValidActions(s);
      if (valid.length === 0) { report('STALL', seed, step, `no valid actions (phase ${s.phase}, guard ${!!s.pendingGuardReaction}, rain ${!!s.pendingWareCardReaction})`); break; }
      // every offered action must be accepted (sample a few to keep it fast)
      for (const a of [pick(rng, valid), pick(rng, valid)]) {
        const r = tryAction(s, a);
        if (!r.ok) report(r.mutated ? 'MUTATION' : 'VALID_BUT_REJECTED', seed, step, `${JSON.stringify(a)}: ${r.error}`);
      }
      // bias toward ending the turn eventually so games finish
      const endTurn = valid.find((a) => a.type === 'END_TURN');
      action = endTurn && rng() < 0.12 ? endTurn : pick(rng, valid);
    }

    if (action.type === 'CANCEL_ACTION') cancels++;
    const r = tryAction(s, action);
    if (!r.ok) { report(r.mutated ? 'MUTATION' : 'CHOSEN_REJECTED', seed, step, `${JSON.stringify(action)}: ${r.error}`); break; }
    const prev = s;
    s = r.next;
    actions.push(action);

    const v = [...checkInvariants(s).map((x) => x.message ?? JSON.stringify(x)), ...sanity(s)];
    if (v.length) { report('INVARIANT', seed, step, `${action.type}: ${v.join('; ')}`); break; }
    const leaks = leakCheck(s);
    if (leaks.length) report('LEAK', seed, step, leaks.join('; '));

    // Endgame rules, checked at each turn boundary
    if (s.currentPlayer !== lastCp || s.phase === 'GAME_OVER') {
      const ender = lastCp;
      if (!prev.endgame && s.phase !== 'GAME_OVER') {
        if (s.players[ender].gold >= CONSTANTS.ENDGAME_GOLD_THRESHOLD && !s.endgame) {
          report('ENDGAME_NOT_TRIGGERED', seed, step, `player ${ender} ended turn with ${s.players[ender].gold}g`);
        }
        if (s.endgame && s.endgame.triggerPlayer !== ender) report('ENDGAME_WRONG_TRIGGER', seed, step, JSON.stringify(s.endgame));
      }
      if (prev.endgame && s.endgame && prev.endgame.triggerPlayer !== s.endgame.triggerPlayer) {
        report('ENDGAME_RETRIGGERED', seed, step, `${JSON.stringify(prev.endgame)} -> ${JSON.stringify(s.endgame)}`);
      }
      if (prev.endgame && ender === prev.endgame.finalTurnPlayer) {
        finalTurnsTaken++;
        if (s.phase !== 'GAME_OVER') report('NO_GAME_OVER_AFTER_FINAL_TURN', seed, step, JSON.stringify(s.endgame));
      }
      if (s.phase === 'GAME_OVER' && finalTurnsTaken !== 1) report('FINAL_TURN_COUNT', seed, step, `final turns taken: ${finalTurnsTaken}`);
      lastCp = s.currentPlayer;
    }

    // Autosave round-trip (every 50 steps — JSON is the save format)
    if (step % 50 === 0) {
      const rt = JSON.parse(JSON.stringify(s)) as GameState;
      const r2 = getValidActions(rt).length === getValidActions(s).length;
      if (!r2) report('SAVE_ROUNDTRIP', seed, step, 'valid actions differ after JSON round-trip');
      if (checkInvariants(rt).length) report('SAVE_ROUNDTRIP', seed, step, 'invariants fail after JSON round-trip');
    }
    if (step === MAX_STEPS - 1) { capped++; report('TURN_CAP', seed, step, `game did not finish in ${MAX_STEPS} steps (turn ${s.turn})`); }
  }

  // Replay determinism: the action log must reproduce the final state
  try {
    const replayed = replayToState(createReplayLog(s, actions, (g % 2) as 0 | 1));
    if (JSON.stringify(replayed) !== JSON.stringify(s)) report('REPLAY_DIVERGES', seed, actions.length, 'replayToState(final log) != final state');
  } catch (e) {
    report('REPLAY_THROWS', seed, actions.length, (e as Error).message);
  }
  // validator/engine agreement on a stale action after game over
  if (s.phase === 'GAME_OVER' && validateAction(s, { type: 'END_TURN' }).valid) report('ACTS_AFTER_GAME_OVER', seed, actions.length, 'END_TURN valid after GAME_OVER');
}

const secs = ((Date.now() - start) / 1000).toFixed(1);
console.log(`fuzz: ${GAMES} games (seeds ${SEED_BASE}..${SEED_BASE + GAMES - 1}), ${totalSteps} steps, ${secs}s`);
console.log(`  finished ${gameOvers}, hit step cap ${capped}, garbage responses accepted ${garbageAccepted}, cancels ${cancels}`);
const byKind = new Map<string, number>();
for (const [k, n] of seenKinds) { const kind = k.split(':')[0]; byKind.set(kind, (byKind.get(kind) ?? 0) + n); }
console.log(`  findings by kind: ${byKind.size ? [...byKind].map(([k, n]) => `${k}=${n}`).join(', ') : 'none'}`);
for (const f of findings.slice(0, 40)) console.log(`  [${f.kind}] seed=${f.seed} step=${f.step} ${f.msg.slice(0, 300)}`);
const hard = [...byKind.keys()].filter((k) => k !== 'AI_RESPONSE_REJECTED');
process.exit(hard.length ? 1 : 0);
