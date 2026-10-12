import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TRADERS, traderFor, traderReaction, portraitUrl, barkUrl, BIG_SWING_GOLD } from '../../src/ai/traders.ts';
import type { BarkEvent, TraderMood } from '../../src/ai/traders.ts';
import { TraderPortrait } from '../../src/ui/TraderPortrait.tsx';
import { shouldBark, planBark, EMPTY_BARK_MEMORY, BARK_COOLDOWN_MS, SAME_EVENT_GAP_MS, LINE_BUSY_MS, MAX_SAYS_PER_TAKE } from '../../src/ui/useTrader.ts';
import { traderChatter, waresPhrase, CHATTER } from '../../src/ai/traderChatter.ts';
import { getAiActionDescription } from '../../src/ai/aiActionDescriptions.ts';
import type { GameAction } from '../../src/engine/types.ts';
import { createTestState } from '../helpers/testHelpers.ts';
import type { GameLogEntry, GameState } from '../../src/engine/types.ts';

const EVENTS: BarkEvent[] = ['greet', 'big-sale', 'rival-sale', 'attack', 'blocked', 'win', 'lose'];
const MOODS: TraderMood[] = ['neutral', 'pleased', 'annoyed'];

describe('the four traders', () => {
  it('one per difficulty, each distinct, Swahili-named', () => {
    expect(traderFor('easy').name).toBe('Kito');
    expect(traderFor('medium').name).toBe('Amara');
    expect(traderFor('hard').name).toBe('Baraka');
    expect(traderFor('expert').name).toBe('Mama Zawadi');
    expect(new Set(Object.values(TRADERS).map((t) => t.id)).size).toBe(4);
  });

  it('every portrait expression and voiced line ships, web-sized', () => {
    for (const t of Object.values(TRADERS)) {
      for (const m of MOODS) {
        const f = `public${portraitUrl(t, m)}`;
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size).toBeLessThan(60_000);
      }
      for (const e of EVENTS) {
        expect(t.lines[e].length, `${t.id} ${e}`).toBeGreaterThan(0);
        t.lines[e].forEach((line, take) => {
          const f = `public${barkUrl(t, e, take)}`;
          expect(existsSync(f), f).toBe(true);
          expect(statSync(f).size).toBeGreaterThan(5_000);
          expect(statSync(f).size).toBeLessThan(120_000);
          expect(line.length).toBeGreaterThan(5);
        });
      }
      // the lines said most often have a second take
      expect(t.lines.attack.length).toBeGreaterThan(1);
      expect(t.lines['big-sale'].length).toBeGreaterThan(1);
    }
  });

  it('the portrait stacks all three expressions and shows only the current one', () => {
    const html = renderToStaticMarkup(createElement(TraderPortrait, { trader: traderFor('hard'), mood: 'annoyed' }));
    expect(html.match(/<img /g)).toHaveLength(3);
    expect(html).toContain('data-mood="annoyed"');
    expect(html).toMatch(/baraka-annoyed\.webp" alt="" draggable="false" style="opacity:1"/);
  });
});

describe('trader reactions', () => {
  const base = createTestState();
  const withGold = (s: GameState, g: [number, number]): GameState => ({ ...s, players: [{ ...s.players[0], gold: g[0] }, { ...s.players[1], gold: g[1] }] as GameState['players'] });
  const withLog = (s: GameState, ...entries: GameLogEntry[]): GameState => ({ ...s, log: [...s.log, ...entries] });

  it('pleased + "big sale" when the trader makes a big sale; annoyed when you do', () => {
    const prev = withGold(base, [20, 20]);
    expect(traderReaction(prev, withLog(withGold(base, [20, 20 + BIG_SWING_GOLD]), { turn: 1, player: 1, action: 'PLAY_WARE_SELL' }), 1))
      .toEqual({ mood: 'pleased', bark: 'big-sale', lasting: false });
    expect(traderReaction(prev, withLog(withGold(base, [32, 20]), { turn: 1, player: 0, action: 'PLAY_WARE_SELL' }), 1))
      .toEqual({ mood: 'annoyed', bark: 'rival-sale', lasting: false });
    // small moves pass without comment
    expect(traderReaction(prev, withLog(withGold(base, [20, 23]), { turn: 1, player: 1, action: 'PLAY_WARE_SELL' }), 1).mood).toBeNull();
  });

  it('attacks once (not again when a declined Guard re-logs the animal) and sulks at a Guard', () => {
    const attack = withLog(base, { turn: 1, player: 1, action: 'PLAY_ANIMAL', card: 'parrot_1' });
    expect(traderReaction(base, attack, 1)).toMatchObject({ mood: 'pleased', bark: 'attack' });
    const relog = withLog(attack, { turn: 1, player: 1, action: 'PLAY_ANIMAL', details: 'Played Parrot - awaiting resolution' });
    expect(traderReaction(attack, relog, 1).bark).toBeNull();
    const guard = withLog(attack, { turn: 1, player: 0, action: 'GUARD_PLAYED', card: 'guard_1' });
    expect(traderReaction(attack, guard, 1)).toMatchObject({ mood: 'annoyed', bark: 'blocked' });
  });

  it('game over: the trader’s win or loss, and the mood stays', () => {
    const final = { ...base, phase: 'PLAY' as const, endgame: { triggerPlayer: 1 as const, finalTurnPlayer: 0 as const, isFinalTurn: true } };
    const traderWins = { ...withGold(final, [50, 63]), phase: 'GAME_OVER' as const };
    expect(traderReaction(final, traderWins, 1)).toEqual({ mood: 'pleased', bark: 'win', lasting: true });
    const traderLoses = { ...withGold(final, [70, 63]), phase: 'GAME_OVER' as const };
    expect(traderReaction(final, traderLoses, 1)).toEqual({ mood: 'annoyed', bark: 'lose', lasting: true });
  });

  it('voiced lines respect a cooldown, except the moments that always speak', () => {
    expect(shouldBark('big-sale', 0, BARK_COOLDOWN_MS + 1)).toBe(true);
    expect(shouldBark('big-sale', 1000, 2000)).toBe(false);
    expect(shouldBark('attack', 1000, 2000)).toBe(false);
    for (const e of ['greet', 'win', 'lose', 'blocked'] as const) expect(shouldBark(e, 1000, 1001)).toBe(true);
  });
});

describe('the trader’s one voice (planBark)', () => {
  it('never talks over itself: an equal line waits, a Guard or the result cuts in', () => {
    const first = planBark(EMPTY_BARK_MEMORY, 'attack', 100_000, 2)!;
    expect(first).toMatchObject({ take: 0, interrupt: false });
    // the attack line is still playing when the Guard lands
    const guard = planBark(first.memory, 'blocked', 100_300, 1)!;
    expect(guard.interrupt).toBe(true);
    // …and nothing of lower or equal priority interrupts the Guard line
    expect(planBark(guard.memory, 'blocked', 100_400, 1)).toBeNull();
    expect(planBark({ ...guard.memory, lastAt: 0 }, 'big-sale', 100_500, 2)).toBeNull();
    const over = planBark(guard.memory, 'win', 100_600, 1)!;
    expect(over.interrupt).toBe(true);
  });

  it('rotates takes so the same line doesn’t come back, and spaces out repeats', () => {
    let mem = EMPTY_BARK_MEMORY;
    const takes: number[] = [];
    let now = 0;
    for (let i = 0; i < 4; i++) {
      now += SAME_EVENT_GAP_MS + 1;
      const p = planBark(mem, 'attack', now, 2)!;
      takes.push(p.take);
      mem = { ...p.memory, busyUntil: 0 };
    }
    expect(takes).toEqual([0, 1, 0, 1]);
    // another attack inside the same-event gap stays quiet even after the general cooldown
    expect(planBark(mem, 'attack', now + BARK_COOLDOWN_MS + 1, 2)).toBeNull();
    // a different line is fine then
    expect(planBark(mem, 'big-sale', now + BARK_COOLDOWN_MS + 1, 2)).not.toBeNull();
  });

  it('an everyday line wears out: each take at most twice a game', () => {
    let mem = EMPTY_BARK_MEMORY;
    let said = 0;
    for (let i = 1; i <= 6; i++) {
      const p = planBark(mem, 'rival-sale', i * (SAME_EVENT_GAP_MS + 1), 1);
      if (p) { said++; mem = { ...p.memory, busyUntil: 0 }; }
    }
    expect(said).toBe(MAX_SAYS_PER_TAKE);
    // the moments that always speak never wear out
    expect(planBark({ ...mem, said: { blocked: 99 } }, 'blocked', 10_000_000, 1)).not.toBeNull();
  });

  it('a line that never reports its end stops counting as "talking"', () => {
    const p = planBark(EMPTY_BARK_MEMORY, 'blocked', 0, 1)!;
    expect(planBark(p.memory, 'blocked', LINE_BUSY_MS + 1, 1)?.interrupt).toBe(false);
  });
});

describe('trader chatter', () => {
  const s = createTestState();
  const actions: GameAction[] = [
    { type: 'DRAW_CARD' }, { type: 'KEEP_CARD' }, { type: 'DISCARD_DRAWN' }, { type: 'SKIP_DRAW' }, { type: 'END_TURN' },
    { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' }, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' },
    { type: 'PLAY_CARD', cardId: 'parrot_1' }, { type: 'GUARD_REACTION', play: true }, { type: 'WARE_CARD_REACTION', play: false },
  ] as GameAction[];

  it('each trader has their own words for every move, never the generic line', () => {
    for (const t of Object.values(TRADERS)) {
      for (const a of actions) {
        const line = traderChatter(t, a, s);
        expect(line.length, `${t.id} ${a.type}`).toBeGreaterThan(3);
        expect(line).not.toMatch(/\{(card|wares|Wares)\}/);
        expect(line).not.toBe(getAiActionDescription(a, s));
      }
    }
  });

  it('names face-up cards, and never a card drawn in secret', () => {
    const baraka = traderFor('hard');
    expect(traderChatter(baraka, { type: 'PLAY_CARD', cardId: 'parrot_1' } as GameAction, s)).toContain('Parrot');
    for (const take of CHATTER.baraka.keep) expect(take).not.toContain('{card}');
    for (const take of CHATTER.baraka.draw) expect(take).not.toContain('{card}');
  });

  it('ware cards are talked about by what they trade, not the stall’s name', () => {
    const amara = traderFor('medium');
    const buy = traderChatter(amara, { type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' } as GameAction, s);
    expect(buy).toContain('trinkets');
    expect(buy).not.toContain('Stall');
    expect(waresPhrase(['salt', 'tea', 'salt'])).toBe('salt and tea');
    expect(waresPhrase(['fruit', 'hides', 'silk'])).toBe('fruit, hides and silk');
    expect(waresPhrase(['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'])).toBe('a bit of everything');
  });

  it('back-to-back moves get different takes', () => {
    const t = traderFor('expert');
    const a = { type: 'DRAW_CARD' } as GameAction;
    const one = traderChatter(t, a, s);
    const two = traderChatter(t, a, { ...s, log: [...s.log, { turn: 1, player: 1, action: 'DRAW_CARD' }] });
    expect(one).not.toBe(two);
  });
});

describe('the player\'s own avatar', () => {
  it('shows the Google photo in the same round frame as the trader', async () => {
    const { PlayerAvatar } = await import('../../src/ui/PlayerAvatar.tsx');
    const html = renderToStaticMarkup(createElement(PlayerAvatar, { avatarUrl: 'https://lh3.googleusercontent.com/a/x', label: 'E', active: true }));
    expect(html).toContain('trader-portrait');
    expect(html).toContain('player-avatar-active');
    expect(html).toContain('src="https://lh3.googleusercontent.com/a/x"');
    expect(html).toContain('referrerPolicy="no-referrer"');
  });
  it('falls back to the initial without a photo', async () => {
    const { PlayerAvatar } = await import('../../src/ui/PlayerAvatar.tsx');
    const html = renderToStaticMarkup(createElement(PlayerAvatar, { avatarUrl: null, label: 'E' }));
    expect(html).not.toContain('<img');
    expect(html).toContain('>E</span>');
  });
});
