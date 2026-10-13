import { describe, it, expect } from 'vitest';
import { toBoardState, responderFromPublic, hasPendingFromPublic, HIDDEN_CARD_ID, friendWaitingHint, resolutionStatusMessage } from '../../src/ui/onlineView.ts';
import { splitState } from '../../src/multiplayer/stateSplitter.ts';
import { getResponder } from '../../src/engine/responder.ts';
import { validatePlayCard, validateActivateUtility } from '../../src/engine/validation/actionValidator.ts';
import { computeHandHints } from '../../src/ui/handHints.ts';
import { computeUtilityHints } from '../../src/ui/utilityHints.ts';
import { keepAndPlayOptions } from '../../src/ui/uiHints.ts';
import { snapshotForFlights, planFlights } from '../../src/ui/flights.ts';
import type { FlightSnapshot } from '../../src/ui/flights.ts';
import { getCard } from '../../src/engine/cards/CardDatabase.ts';
import type { GameState } from '../../src/engine/types.ts';
import { forEachRandomGameState } from '../helpers/randomGames.ts';
import { createInitialState } from '../../src/engine/GameState.ts';

describe('toBoardState — the friend board sees what the server sends, nothing more', () => {
  it('over 30 random games, every state, both seats: equals the real state where it can, placeholders where it cannot', () => {
    const problems: string[] = [];
    let compared = 0;
    let lastSnap: [FlightSnapshot | null, FlightSnapshot | null] = [null, null];
    forEachRandomGameState(30, 71000, ({ game, step, state }) => {
      if (step === 0) lastSnap = [null, null];
      for (const slot of [0, 1] as const) {
        const { public: pub, private: priv } = splitState(state, slot);
        const board = toBoardState(pub, priv, slot);
        const ctx = `game ${game} step ${step} slot ${slot}`;
        const opp = (1 - slot) as 0 | 1;
        const fail = (msg: string) => problems.push(`${ctx}: ${msg}`);

        // shape
        if (board.players[slot].hand !== priv.hand) fail('own hand not from the private view');
        if (board.players[opp].hand.length !== state.players[opp].hand.length) fail('opponent hand length');
        if (board.players[opp].hand.some((id) => id !== HIDDEN_CARD_ID)) fail('opponent hand not hidden');
        if (board.deck.length !== state.deck.length || board.deck.some((id) => id !== HIDDEN_CARD_ID)) fail('deck');
        for (const p of [0, 1] as const) {
          if (board.players[p].gold !== state.players[p].gold) fail(`gold ${p}`);
          if (JSON.stringify(board.players[p].market) !== JSON.stringify(state.players[p].market)) fail(`market ${p}`);
          if (JSON.stringify(board.players[p].utilities) !== JSON.stringify(state.players[p].utilities)) fail(`utilities ${p}`);
        }
        if (board.phase !== state.phase || board.turn !== state.turn || board.currentPlayer !== state.currentPlayer || board.actionsLeft !== state.actionsLeft) fail('turn fields');
        if (board.log.length !== state.log.length) fail('log length');

        // who acts
        const expectedResponder = state.phase === 'GAME_OVER' ? null : getResponder(state);
        if (responderFromPublic(pub) !== expectedResponder) fail(`responder ${responderFromPublic(pub)} vs ${expectedResponder}`);
        if (hasPendingFromPublic(pub) !== !!(state.pendingResolution || state.pendingGuardReaction || state.pendingWareCardReaction)) fail('pending');

        // the board's own validation reaches the same verdicts
        const myMove = state.phase !== 'GAME_OVER' && state.currentPlayer === slot && !hasPendingFromPublic(pub);
        if (myMove) {
          compared++;
          for (const cardId of state.players[slot].hand) {
            const modes = getCard(cardId).type === 'ware' ? (['buy', 'sell'] as const) : ([undefined] as const);
            for (const mode of modes) {
              const real = validatePlayCard(state, cardId, mode);
              const seen = validatePlayCard(board, cardId, mode);
              if (real.valid !== seen.valid || real.reason !== seen.reason) fail(`validatePlayCard ${cardId} ${mode ?? ''}: ${real.reason} vs ${seen.reason}`);
            }
          }
          state.players[slot].utilities.forEach((_, i) => {
            const real = validateActivateUtility(state, i);
            const seen = validateActivateUtility(board, i);
            if (real.valid !== seen.valid || real.reason !== seen.reason) fail(`validateActivateUtility ${i}: ${real.reason} vs ${seen.reason}`);
          });
          if (JSON.stringify([...(computeHandHints(state, slot) ?? new Map())]) !== JSON.stringify([...(computeHandHints(board, slot) ?? new Map())])) fail('hand hints');
          if (JSON.stringify([...(computeUtilityHints(state, slot) ?? new Map())]) !== JSON.stringify([...(computeUtilityHints(board, slot) ?? new Map())])) fail('utility hints');
          if (JSON.stringify(keepAndPlayOptions(state, slot)) !== JSON.stringify(keepAndPlayOptions(board, slot))) fail('keep & play');
        }

        // flights plan from consecutive boards, and never fly a hidden card face up
        const snap = snapshotForFlights(board);
        const prev = lastSnap[slot];
        if (prev) {
          try {
            const flights = planFlights(prev, snap);
            if (flights.some((f) => f.cardId === HIDDEN_CARD_ID)) fail('a hidden card flew face up');
          } catch (e) {
            fail(`planFlights threw ${(e as Error).message}`);
          }
        }
        lastSnap[slot] = snap;
      }
    });
    expect(compared).toBeGreaterThan(500);
    expect(problems.slice(0, 12)).toEqual([]);
  }, 60_000);
});

describe('waiting copy', () => {
  const pubOf = (state: GameState, slot: 0 | 1) => splitState(state, slot).public;
  it('names the friend while they hold the decision, and is silent on your own move', () => {
    const s = createInitialState(9);
    const mover = s.currentPlayer;
    const other = (1 - mover) as 0 | 1;
    expect(friendWaitingHint(pubOf(s, other), other, 'sam')).toBe('sam is drawing…');
    expect(friendWaitingHint(pubOf(s, mover), mover, 'sam')).toBeNull();
    const guard = { ...s, pendingGuardReaction: { animalCard: 'parrot_1', targetPlayer: other } };
    expect(friendWaitingHint(pubOf(guard, mover), mover, 'sam')).toBe('sam may answer with a Guard…');
  });
  it('the Cast phone copy is unchanged', () => {
    expect(resolutionStatusMessage('OPPONENT_DISCARD')).toBe('Opponent is choosing cards to discard...');
    expect(resolutionStatusMessage('DRAFT')).toBe('Resolving draft picks...');
  });
});
