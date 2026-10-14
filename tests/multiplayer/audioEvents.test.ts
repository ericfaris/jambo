import { describe, it, expect } from 'vitest';
import { detectAudioEvent, detectOutcomeSounds, DUCKING_SOUNDS, goldGained } from '../../src/multiplayer/audioEvents.ts';
import { createTestState, toPlayPhase, withUtility } from '../helpers/testHelpers.ts';
import { AUDIO_FILES, coinClinks, newActionSounds } from '../../src/ui/useAudioEvents.ts';
import type { TaggedAction } from '../../src/hooks/useGameStore.ts';
import type { GameAction } from '../../src/engine/types.ts';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

describe('detectAudioEvent', () => {
  it('maps every sound-worthy action', () => {
    expect(detectAudioEvent({ type: 'DRAW_CARD' })).toBe('card-draw');
    expect(detectAudioEvent({ type: 'KEEP_CARD' })).toBe('card-keep');
    expect(detectAudioEvent({ type: 'DISCARD_DRAWN' })).toBe('card-discard');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' })).toBe('coin-out');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'sell' })).toBe('coin');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'parrot_1' })).toBe('parrot');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'shaman_1' })).toBe('card-play');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'well_1' })).toBe('card-play');
    expect(detectAudioEvent({ type: 'END_TURN' })).toBe('turn-end');
    expect(detectAudioEvent({ type: 'GUARD_REACTION', play: true })).toBe('guard');
  });

  it('stays quiet for everything else', () => {
    expect(detectAudioEvent({ type: 'GUARD_REACTION', play: false })).toBeNull();
    expect(detectAudioEvent({ type: 'SKIP_DRAW' })).toBeNull();
    expect(detectAudioEvent({ type: 'CANCEL_ACTION' })).toBeNull();
    expect(detectAudioEvent({ type: 'ACTIVATE_UTILITY', utilityIndex: 0 })).toBeNull();
  });
});

describe('sound effect files', () => {
  it.each(Object.entries(AUDIO_FILES))('%s → %s exists and is a small, non-empty clip', (_event, url) => {
    const file = resolve('public', url.replace(/^\//, ''));
    expect(existsSync(file)).toBe(true);
    const size = statSync(file).size;
    expect(size).toBeGreaterThan(2_000);
    expect(size).toBeLessThan(150_000); // short SFX, web-sized
  });
});

describe('newActionSounds (solo/hotseat)', () => {
  const tag = (action: GameAction): TaggedAction => ({ player: 0, playerLabel: 'Player', action });
  const log = [
    tag({ type: 'DRAW_CARD' }),
    tag({ type: 'KEEP_CARD' }),
    tag({ type: 'PLAY_CARD', cardId: 'ware_3k_1', wareMode: 'buy' }),
    tag({ type: 'SKIP_DRAW' }),
    tag({ type: 'END_TURN' }),
  ];

  it('plays only actions added since the last render', () => {
    expect(newActionSounds(log, 4)).toEqual(['turn-end']);
    expect(newActionSounds(log, 5)).toEqual([]);
  });

  it('plays every sound in a batch once, in order', () => {
    expect(newActionSounds(log, 0)).toEqual(['card-draw', 'card-keep', 'coin-out', 'turn-end']);
  });

  it('keeping a drawn card plays the keep cue, not a second draw', () => {
    expect(newActionSounds(log, 0).filter((e) => e === 'card-draw')).toHaveLength(1);
    expect(newActionSounds(log, 1)).toEqual(['card-keep', 'coin-out', 'turn-end']);
  });
});

describe('sound pass 2', () => {
  it('every animal has its own call', () => {
    const ids = ['parrot_1', 'elephant_1', 'snake_1', 'hyena_1', 'crocodile_1', 'ape_1', 'lion_1', 'cheetah_1'];
    const sounds = ids.map((cardId) => detectAudioEvent({ type: 'PLAY_CARD', cardId }));
    expect(new Set(sounds).size).toBe(8);
    expect(sounds).not.toContain('attack');
  });

  it('a utility activation names its utility when the prior state is known', () => {
    let s = toPlayPhase(createTestState());
    s = withUtility(s, 0, 'drums_1', 'drums');
    s = withUtility(s, 0, 'throne_1', 'throne');
    expect(detectAudioEvent({ type: 'ACTIVATE_UTILITY', utilityIndex: 0 }, s)).toBe('drums');
    // utilities without a sound of their own fall back to the card tap
    expect(detectAudioEvent({ type: 'ACTIVATE_UTILITY', utilityIndex: 1 }, s)).toBe('card-play');
    expect(detectAudioEvent({ type: 'ACTIVATE_UTILITY', utilityIndex: 7 }, s)).toBeNull();
  });

  it('outcomes: gavel, final turn, and win/lose from the viewer\'s seat', () => {
    const base = createTestState();
    const auction = { ...base, log: [...base.log, { turn: 3, player: 1 as const, action: 'AUCTION_WON', details: 'Won the auction' }] };
    expect(detectOutcomeSounds(base, auction, 0)).toEqual(['gavel']);

    const triggered = { ...base, phase: 'PLAY' as const, endgame: { triggerPlayer: 1 as const, finalTurnPlayer: 0 as const, isFinalTurn: false } };
    const final = { ...triggered, endgame: { ...triggered.endgame, isFinalTurn: true } };
    expect(detectOutcomeSounds(triggered, final, 0)).toEqual(['final-turn']);

    const players = [{ ...base.players[0], gold: 70 }, { ...base.players[1], gold: 61 }] as typeof base.players;
    const over = { ...final, phase: 'GAME_OVER' as const, players };
    expect(detectOutcomeSounds(final, over, 0)).toEqual(['win']);
    expect(detectOutcomeSounds(final, over, 1)).toEqual(['lose']);
    expect(detectOutcomeSounds(final, over, null)).toEqual(['win']);
    expect(detectOutcomeSounds(over, over, 0)).toEqual([]);
  });

  it('big moments duck the music; table taps never do', () => {
    expect(DUCKING_SOUNDS.has('lion')).toBe(true);
    expect(DUCKING_SOUNDS.has('win')).toBe(true);
    expect(DUCKING_SOUNDS.has('ware-land')).toBe(false);
    expect(DUCKING_SOUNDS.has('coin-out')).toBe(false);
  });
});

describe('Cast phones and TV hear the outcomes too', () => {
  it('works from the public state stream (win/lose per seat, TV always the flourish)', async () => {
    const { extractPublicState } = await import('../../src/multiplayer/stateSplitter.ts');
    const base = createTestState();
    const final = { ...base, phase: 'PLAY' as const, endgame: { triggerPlayer: 1 as const, finalTurnPlayer: 0 as const, isFinalTurn: true } };
    const players = [{ ...base.players[0], gold: 58 }, { ...base.players[1], gold: 64 }] as typeof base.players;
    const over = { ...final, phase: 'GAME_OVER' as const, players, log: [...final.log, { turn: 9, player: 0 as const, action: 'GAME_OVER', details: 'Game has ended' }] };
    const a = extractPublicState(final);
    const b = extractPublicState(over);
    expect(detectOutcomeSounds(a, b, 1)).toEqual(['win']);
    expect(detectOutcomeSounds(a, b, 0)).toEqual(['lose']);
    expect(detectOutcomeSounds(a, b, null)).toEqual(['win']);
  });
});

describe('end-of-turn gold bonus is heard', () => {
  it('ending a turn with 2+ actions to spare plays the coin sound (any player, from the real engine)', async () => {
    const { processAction } = await import('../../src/engine/GameEngine.ts');
    const spare = { ...toPlayPhase(createTestState()), actionsLeft: 3 };
    const ended = processAction(spare, { type: 'END_TURN' });
    expect(ended.players[spare.currentPlayer].gold).toBe(spare.players[spare.currentPlayer].gold + 1);
    expect(detectOutcomeSounds(spare, ended, 0)).toContain('coin');
    expect(detectOutcomeSounds(spare, ended, 1)).toContain('coin'); // the opponent's bonus too
    // the turn-end sound still plays alongside it
    expect(detectAudioEvent({ type: 'END_TURN' })).toBe('turn-end');
  });

  it('no bonus, no coin', async () => {
    const { processAction } = await import('../../src/engine/GameEngine.ts');
    const spent = { ...toPlayPhase(createTestState()), actionsLeft: 1 };
    expect(detectOutcomeSounds(spent, processAction(spent, { type: 'END_TURN' }), 0)).not.toContain('coin');
  });
});

describe('coin sound scales with the gold received', () => {
  const purses = (a: number, b: number) => ({ players: [{ gold: a }, { gold: b }] as const });

  it('counts gold that came into either purse, never gold paid out', () => {
    expect(goldGained(purses(20, 20), purses(38, 20))).toBe(18);
    expect(goldGained(purses(20, 20), purses(17, 21))).toBe(1);
    expect(goldGained(purses(20, 20), purses(18, 22))).toBe(2);
    expect(goldGained(null, purses(30, 20))).toBe(0);
  });

  it('a small payout is a single clink', () => {
    expect(coinClinks(0)).toHaveLength(1);
    expect(coinClinks(1)).toHaveLength(1); // end-of-turn bonus
    expect(coinClinks(3)).toHaveLength(1);
  });

  it('bigger payouts repeat longer, up to a cap', () => {
    expect(coinClinks(10)).toHaveLength(4); // cheapest sell
    expect(coinClinks(18)).toHaveLength(6); // a 6-ware sell
    expect(coinClinks(22)).toHaveLength(7); // with Wise Man
    expect(coinClinks(100)).toHaveLength(7);
    const lengths = [1, 4, 7, 10, 13, 16, 19].map((g) => coinClinks(g).length);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
  });

  it('starts at once, then spaces the clinks out and lets them trail off', () => {
    const clinks = coinClinks(18);
    expect(clinks[0]).toEqual({ delayMs: 0, gain: 1, rate: 1 });
    for (let i = 1; i < clinks.length; i++) {
      expect(clinks[i].delayMs).toBeGreaterThan(clinks[i - 1].delayMs);
      expect(clinks[i].gain).toBeLessThan(clinks[i - 1].gain);
      expect(clinks[i].gain).toBeGreaterThan(0);
      expect(clinks[i].rate).toBeGreaterThan(0.9);
      expect(clinks[i].rate).toBeLessThan(1.15);
    }
  });
});

describe('sound pass 3', () => {
  it('Drummer and the Small Market Stand have their own sounds; other people keep the tap', () => {
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'drummer_1' })).toBe('drummer');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'small_market_stand_1' })).toBe('market-stand');
    expect(detectAudioEvent({ type: 'PLAY_CARD', cardId: 'shaman_1' })).toBe('card-play');
  });

  it('a Supplies search that finds a ware plays the find cue; finding nothing stays quiet', () => {
    const base = createTestState();
    const found = { ...base, log: [...base.log, { turn: 3, player: 0 as const, action: 'SUPPLIES_PAY', details: 'Paid 1g, found', card: 'ware_3k_1' as const }] };
    expect(detectOutcomeSounds(base, found, 0)).toEqual(['card-found']);
    const drawn = { ...base, log: [...base.log, { turn: 3, player: 1 as const, action: 'SUPPLIES_DRAW', details: 'found', card: 'ware_3k_1' as const }] };
    expect(detectOutcomeSounds(base, drawn, 0)).toEqual(['card-found']);
    const none = { ...base, log: [...base.log, { turn: 3, player: 0 as const, action: 'SUPPLIES_PAY', details: 'no ware card left to find' }] };
    expect(detectOutcomeSounds(base, none, 0)).toEqual([]);
  });

  it('the find cue survives the public (Cast / online) log', async () => {
    const { extractPublicState } = await import('../../src/multiplayer/stateSplitter.ts');
    const base = createTestState();
    const found = { ...base, log: [...base.log, { turn: 3, player: 0 as const, action: 'SUPPLIES_DRAW', details: 'Discarded guard_1, revealed cards until a ware card: found ware_3k_1', card: 'ware_3k_1' as const }] };
    expect(detectOutcomeSounds(extractPublicState(base), extractPublicState(found), 1)).toEqual(['card-found']);
  });
});

describe('msSinceSfx', () => {
  it('reports how long ago a sound started, Infinity if never', async () => {
    const { msSinceSfx, playSfx } = await import('../../src/ui/useAudioEvents.ts');
    expect(msSinceSfx('lion')).toBe(Infinity);
    const before = Date.now();
    playSfx('lion'); // no Audio in tests: recorded, nothing plays
    expect(msSinceSfx('lion', before + 500)).toBeGreaterThanOrEqual(0);
    expect(msSinceSfx('lion', before + 500)).toBeLessThanOrEqual(500);
  });
});
