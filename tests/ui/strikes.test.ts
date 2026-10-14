import { describe, it, expect } from 'vitest';
import { planStrikes, pruneChips, pruneMarks, strikeMarks, strikeOwnsFlight } from '../../src/ui/strikes.ts';
import type { StrikeView } from '../../src/ui/strikes.ts';
import type { GameLogEntry, WareType } from '../../src/engine/types.ts';

type Seat = StrikeView['players'][0];
const seat = (over: Partial<Seat> = {}): Seat => ({ utilities: [], market: [null, null, null, null, null, null], gold: 20, hand: [], ...over });
const util = (cardId: string) => ({ cardId, designId: cardId.replace(/_\d+$/, ''), usedThisTurn: false }) as Seat['utilities'][number];
const view = (p0: Seat, p1: Seat, log: GameLogEntry[]): StrikeView => ({ players: [p0, p1], log });
const entry = (player: 0 | 1, action: string, details?: string, card?: string): GameLogEntry => ({ turn: 3, player, action, details, card } as GameLogEntry);

describe('planStrikes', () => {
  it('Crocodile bites the utility it discarded', () => {
    const prev = view(seat(), seat({ utilities: [util('well_1')] }), []);
    const next = view(seat(), seat(), [entry(0, 'CROCODILE_CLEANUP', "Discarded opponent's well_1 after Crocodile use")]);
    expect(planStrikes(prev, next)).toEqual([{ kind: 'bite', cardId: 'well_1', victim: 1 }]);
  });

  it('Hyena gnaws the card it took, from either seat', () => {
    const prev = view(seat(), seat(), []);
    const next = view(seat(), seat(), [entry(1, 'HYENA_SWAP', 'Took guard_2, gave well_1')]);
    expect(planStrikes(prev, next)).toEqual([{ kind: 'gnaw', cardId: 'guard_2', victim: 0, taker: 1 }]);
    const alone = view(seat(), seat(), [entry(0, 'HYENA_SWAP', 'Took guard_2; no eligible card to give')]);
    expect(planStrikes(prev, alone)[0]).toMatchObject({ cardId: 'guard_2', taker: 0, victim: 1 });
    // nothing taken: no strike
    expect(planStrikes(prev, view(seat(), seat(), [entry(0, 'HYENA_SWAP', 'Opponent has no cards to take')]))).toEqual([]);
  });

  it('Parrot pecks the stolen ware between the two exact slots', () => {
    const m = (...w: (WareType | null)[]) => [...w, ...Array(6 - w.length).fill(null)];
    const prev = view(seat({ market: m('tea') }), seat({ market: m('silk', 'tea') }), []);
    const next = view(seat({ market: m('tea', 'tea') }), seat({ market: m('silk') }), [entry(0, 'PARROT_STEAL', 'Stole tea from opponent')]);
    expect(planStrikes(prev, next)).toEqual([{ kind: 'peck', ware: 'tea', victim: 1, fromIndex: 1, thief: 0, toIndex: 1 }]);
  });

  it('Snake poisons every utility that left, once, and knows what was kept', () => {
    const prev = view(seat({ utilities: [util('drums_1'), util('well_1')] }), seat({ utilities: [util('scale_1'), util('boat_1')] }), []);
    const next = view(seat({ utilities: [util('well_1')] }), seat({ utilities: [util('boat_1')] }), [
      entry(0, 'SNAKE_KEEP', 'Active player kept well_1'),
      entry(0, 'SNAKE_COMPLETE', 'Opponent kept boat_1'),
    ]);
    expect(planStrikes(prev, next)).toEqual([{ kind: 'venom', cardIds: ['drums_1', 'scale_1'], owners: [0, 1], kept: ['well_1', 'boat_1'] }]);
    // the first keep: only that side's kept card glows; the other may still be choosing
    const half = view(seat({ utilities: [util('well_1')] }), seat({ utilities: [util('scale_1'), util('boat_1')] }), [entry(0, 'SNAKE_KEEP', 'Active player kept well_1')]);
    expect(planStrikes(prev, half)).toEqual([{ kind: 'venom', cardIds: ['drums_1'], owners: [0], kept: ['well_1'] }]);
  });

  it('Cheetah claws only when gold was paid', () => {
    const prev = view(seat(), seat(), []);
    expect(planStrikes(prev, view(seat(), seat(), [entry(1, 'CHEETAH_EFFECT', 'Opponent gave 2g')]))).toEqual([{ kind: 'claw', coins: 2, victim: 0, payee: 1 }]);
    expect(planStrikes(prev, view(seat(), seat(), [entry(1, 'CHEETAH_EFFECT', 'Active player drew 2 cards')]))).toEqual([]);
  });

  it('a Guard turns the strike into a clang', () => {
    const next = view(seat(), seat(), [entry(0, 'GUARD_PLAYED', 'Guard cancelled Parrot', 'guard_1')]);
    expect(planStrikes(view(seat(), seat(), []), next)).toEqual([{ kind: 'guard', guardCard: 'guard_1', defender: 0 }]);
  });

  it('ignores old entries and draft animals', () => {
    const old = [entry(0, 'CROCODILE_CLEANUP', "Discarded opponent's well_1 after Crocodile use")];
    expect(planStrikes(view(seat(), seat(), old), view(seat(), seat(), old))).toEqual([]);
    const draft = view(seat(), seat(), [entry(0, 'PLAY_ANIMAL', 'Played Elephant', 'elephant_1'), entry(0, 'DRAFT_COMPLETE', 'Draft done')]);
    expect(planStrikes(view(seat(), seat(), []), draft)).toEqual([]);
  });

  it('a hidden card id (online redaction) still gnaws, face down', () => {
    const next = view(seat(), seat(), [entry(1, 'HYENA_SWAP', 'Took __hidden__, gave well_1')]);
    expect(planStrikes(view(seat(), seat(), []), next)[0]).toMatchObject({ kind: 'gnaw', cardId: null });
  });
});

describe('strikes own their flights', () => {
  it('skips the plain ware / coin / card flight a strike animates itself', () => {
    const peck = { kind: 'peck', ware: 'tea', victim: 1, fromIndex: 1, thief: 0, toIndex: 2 } as const;
    expect(strikeOwnsFlight([peck], { kind: 'ware', from: { type: 'slot', player: 1, index: 1 }, to: { type: 'slot', player: 0, index: 2 } })).toBe(true);
    expect(strikeOwnsFlight([peck], { kind: 'ware', from: { type: 'supply' }, to: { type: 'slot', player: 0, index: 3 } })).toBe(false);
    const claw = { kind: 'claw', coins: 2, victim: 0, payee: 1 } as const;
    expect(strikeOwnsFlight([claw], { kind: 'coin', from: { type: 'gold', player: 0 }, to: { type: 'gold', player: 1 } })).toBe(true);
    expect(strikeOwnsFlight([], { kind: 'coin', from: { type: 'gold', player: 0 }, to: { type: 'gold', player: 1 } })).toBe(false);
  });
});

describe('damage marks last while in sight', () => {
  it('a bite/venom mark lives in the discard pile; a gnaw only in your own hand', () => {
    expect(strikeMarks({ kind: 'bite', cardId: 'well_1', victim: 1 }, 0)).toEqual([{ cardId: 'well_1', damage: 'bite', where: 'discard' }]);
    expect(strikeMarks({ kind: 'gnaw', cardId: 'guard_1', victim: 1, taker: 0 }, 0)).toEqual([{ cardId: 'guard_1', damage: 'gnaw', where: 'hand' }]);
    // the opponent took it: out of sight, no mark
    expect(strikeMarks({ kind: 'gnaw', cardId: 'guard_1', victim: 0, taker: 1 }, 0)).toEqual([]);
  });

  it('heals once the card leaves where it was left', () => {
    const marks = new Map([['well_1', { damage: 'bite', where: 'discard' }], ['guard_1', { damage: 'gnaw', where: 'hand' }]] as const);
    expect([...pruneMarks(marks, ['well_1'], ['guard_1']).keys()]).toEqual(['well_1', 'guard_1']);
    expect([...pruneMarks(marks, [], ['guard_1']).keys()]).toEqual(['guard_1']);
    expect([...pruneMarks(marks, ['well_1'], []).keys()]).toEqual(['well_1']);
  });

  it('a pecked ware keeps its chip only in the same slot', () => {
    const chips = [{ player: 0, index: 2, ware: 'tea' }] as const;
    expect(pruneChips(chips, [[null, null, 'tea'], []])).toHaveLength(1);
    expect(pruneChips(chips, [[null, null, null], []])).toHaveLength(0);
    expect(pruneChips(chips, [[null, null, 'silk'], []])).toHaveLength(0);
  });
});

describe('the board while a strike plays', () => {
  it('the discard pile skips every card still in a strike', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CenterRow } = await import('../../src/ui/CenterRow.tsx');
    const { createTestState } = await import('../helpers/testHelpers.ts');
    const s = { ...createTestState(), discardPile: ['drums_1', 'scale_1', 'well_1'] };
    const html = renderToStaticMarkup(createElement(CenterRow, { state: s, dispatch: () => {}, heldDiscardCards: ['drums_1', 'scale_1'] }));
    expect(html).toContain('/assets/cards/well.png');
    expect(html).not.toContain('/assets/cards/drums.png');
  });

  it('a damaged card face carries its cut-out class and overlays; a held one keeps its spot empty', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { CardFace } = await import('../../src/ui/CardFace.tsx');
    const { CardDamageContext } = await import('../../src/ui/cardDamage.tsx');
    const bitten = renderToStaticMarkup(createElement(CardFace, { cardId: 'well_1', damage: 'bite' }));
    expect(bitten).toContain('card-damage-bite');
    expect(bitten).toContain('card-damage-torn');
    const venom = renderToStaticMarkup(createElement(CardFace, { cardId: 'drums_1', damage: 'venom' }));
    expect(venom).toContain('card-damage-fangs');
    // from the board's context
    const value = { marks: new Map([['guard_1', { damage: 'gnaw', where: 'hand' }]]), hidden: new Set(['well_2']), chips: [] } as never;
    const gnawed = renderToStaticMarkup(createElement(CardDamageContext.Provider, { value }, createElement(CardFace, { cardId: 'guard_1' })));
    expect(gnawed).toContain('card-damage-gnaw');
    const held = renderToStaticMarkup(createElement(CardDamageContext.Provider, { value }, createElement(CardFace, { cardId: 'well_2' })));
    expect(held).toContain('visibility:hidden');
    // the strike's own overlay is never hidden
    const overlay = renderToStaticMarkup(createElement(CardDamageContext.Provider, { value }, createElement(CardFace, { cardId: 'well_2', strikeOverlay: true })));
    expect(overlay).not.toContain('visibility:hidden');
    // no context: clean
    expect(renderToStaticMarkup(createElement(CardFace, { cardId: 'guard_1' }))).not.toContain('card-damage');
  });
});
