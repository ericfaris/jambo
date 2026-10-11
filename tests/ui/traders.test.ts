import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { TRADERS, traderFor, traderReaction, portraitUrl, barkUrl, BIG_SWING_GOLD } from '../../src/ai/traders.ts';
import type { BarkEvent, TraderMood } from '../../src/ai/traders.ts';
import { TraderPortrait } from '../../src/ui/TraderPortrait.tsx';
import { shouldBark, BARK_COOLDOWN_MS } from '../../src/ui/useTrader.ts';
import { createTestState } from '../helpers/testHelpers.ts';
import type { GameLogEntry, GameState } from '../../src/engine/types.ts';

const EVENTS: BarkEvent[] = ['greet', 'big-sale', 'attack', 'blocked', 'win', 'lose'];
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
        const f = `public${barkUrl(t, e)}`;
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size).toBeGreaterThan(5_000);
        expect(statSync(f).size).toBeLessThan(120_000);
        expect(t.lines[e].length).toBeGreaterThan(5);
      }
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
      .toEqual({ mood: 'annoyed', bark: null, lasting: false });
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
