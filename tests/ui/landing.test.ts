import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MainMenu } from '../../src/ui/screens/MainMenu.tsx';
import { PreGameSetupModal } from '../../src/ui/screens/PreGameSetupModal.tsx';
import {
  DEMO_SALE, FAN_CARDS, FAN_DEMO_INDEX, LANDING_PITCH, LAST_TRADER_STORAGE_KEY,
  playerRecord, readLastTrader, statsLine, writeLastTrader,
} from '../../src/ui/screens/landing.ts';
import { getCard, isValidDeckCardId } from '../../src/engine/cards/CardDatabase.ts';
import type { AuthSession } from '../../src/ui/useAuthSession.ts';

const noop = () => {};
const signedOut = { authUser: null, avatarUrl: null, avatarLabel: 'U', isLoading: false, authError: null, logout: async () => {}, refresh: async () => {} } as unknown as AuthSession;
const signedIn = { ...signedOut, authUser: { name: 'Ada Lovelace', email: 'a@example.com', picture: '' } } as unknown as AuthSession;

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

function menu(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(createElement(MainMenu, {
    onSelectOption: noop, onPlayTrader: noop, onPassAndPlay: noop, onPlayFriend: noop, onJoinTv: noop, onTutorial: noop,
    auth: signedOut, resumeLabel: null, onResume: noop, onAbandon: noop,
    ...overrides,
  }));
}

describe('landing page helpers', () => {
  it('remembers the last trader, defaulting to Amara (medium) and ignoring junk', () => {
    const s = memoryStorage();
    expect(readLastTrader(s)).toBe('medium');
    writeLastTrader('expert', s);
    expect(readLastTrader(s)).toBe('expert');
    s.setItem(LAST_TRADER_STORAGE_KEY, 'grandmaster');
    expect(readLastTrader(s)).toBe('medium');
    expect(readLastTrader(null)).toBe('medium');
  });

  it('never shows a 0-0 record to a new visitor', () => {
    expect(statsLine(null)).toBeNull();
    expect(statsLine({ wins: 0, losses: 0, winRate: 0, gamesPlayed: 0 } as never)).toBeNull();
    expect(statsLine({ wins: 3, losses: 1, winRate: 0.75, gamesPlayed: 4 } as never)).toBe('3–1 · 75% won · 4 games');
    expect(statsLine({ wins: 1, losses: 0, winRate: 1, gamesPlayed: 1 } as never)).toBe('1–0 · 100% won · 1 game');
  });

  it('splits the record into labelled parts for the ledger beside the greeting', () => {
    expect(playerRecord(null)).toBeNull();
    expect(playerRecord({ wins: 0, losses: 0, winRate: 0, gamesPlayed: 0 } as never)).toBeNull();
    expect(playerRecord({ wins: 17, losses: 16, winRate: 17 / 33, gamesPlayed: 33 } as never))
      .toEqual({ wins: 17, losses: 16, pct: 52, games: '33 games' });
    expect(playerRecord({ wins: 1, losses: 0, winRate: 1, gamesPlayed: 1 } as never)?.games).toBe('1 game');
  });

  it('the hero fan holds real cards, and the sale demo matches its card', () => {
    for (const id of FAN_CARDS) expect(isValidDeckCardId(id)).toBe(true);
    const demo = getCard(FAN_CARDS[FAN_DEMO_INDEX]);
    expect(demo.wares?.types).toEqual(Array(DEMO_SALE.count).fill(DEMO_SALE.ware));
    expect(demo.wares?.sellPrice).toBe(DEMO_SALE.gold);
  });

  it('the pitch states the real win condition', () => {
    expect(LANDING_PITCH).toContain('60 gold');
  });
});

describe('landing page', () => {
  it('a new visitor gets one gold Play button against the remembered trader, and all four traders', () => {
    const html = menu();
    expect(html).toContain('Play vs Amara');
    expect(html.match(/class="landing-cta"/g)).toHaveLength(1);
    for (const name of ['Kito', 'Amara', 'Baraka', 'Mama Zawadi']) expect(html).toContain(name);
    expect(html).not.toContain('Resume game');
    expect(html).not.toContain('win rate');
    expect(html).not.toContain('0-0');
  });

  it('a saved game takes the gold button; starting over is secondary', () => {
    const html = menu({ resumeLabel: 'vs Baraka (Hard) · turn 12' });
    expect(html).toContain('Resume game');
    expect(html).toContain('vs Baraka (Hard) · turn 12');
    expect(html).toContain('Abandon saved game');
    expect(html).toContain('New game vs Amara');
    expect(html.match(/class="landing-cta"/g)).toHaveLength(1);
  });

  it('names the modes by task: pass & play, join a TV game, and Play on TV only when Cast is set up', () => {
    const without = menu();
    expect(without).toContain('Pass &amp; play');
    expect(without).toContain('Join a TV game');
    expect(without).not.toContain('Play on TV');
    expect(without).not.toContain('Multiplayer');
    expect(menu({ onPlayOnTv: noop })).toContain('Play on TV');
  });

  it('offers Play a friend next to pass & play, even with a saved game (it never touches the save)', () => {
    for (const html of [menu(), menu({ resumeLabel: 'vs Baraka (Hard) · turn 12' })]) {
      const modes = html.slice(html.indexOf('landing-modes'));
      expect(modes).toContain('landing-sign-label">Play a friend<');
      expect(modes.indexOf('Pass &amp; play')).toBeLessThan(modes.indexOf('Play a friend'));
    }
  });

  it('has one place to sign in, and greets a signed-in player by first name', () => {
    const out = menu();
    expect(out.match(/>Sign in</g)).toHaveLength(1);
    expect(out).not.toContain('>Login<');
    const inn = menu({ auth: signedIn });
    expect(inn).toContain('Welcome back, Ada.');
    expect(inn).not.toContain('>Sign in<');
  });

  it('offers a sound toggle on the landing page', () => {
    expect(menu()).toMatch(/Sound (on|off)/);
  });

  it('how to play, settings and sound are labelled icon buttons', () => {
    const footer = menu().slice(menu().indexOf('landing-footer'));
    for (const label of ['How to play', 'Settings', 'Sound']) {
      expect(footer).toMatch(new RegExp(`class="landing-iconbtn"[^>]*aria-label="${label}"`));
    }
    expect(footer.match(/<svg/g)).toHaveLength(3);
    // no text links left in the footer
    expect(footer.slice(0, footer.indexOf('</nav>'))).not.toContain('landing-link');
  });

  it('the play modes are market signs, each with an icon and a hint', () => {
    const html = menu({ onPlayOnTv: noop });
    const signs = html.slice(html.indexOf('landing-signs'), html.indexOf('landing-footer'));
    expect(signs.match(/class="landing-sign"/g)).toHaveLength(4);
    expect(signs.match(/landing-sign-icon/g)).toHaveLength(4);
    for (const label of ['Pass &amp; play', 'Play a friend', 'Play on TV', 'Join a TV game']) {
      expect(signs).toContain(`landing-sign-label">${label}<`);
    }
    expect(signs.match(/landing-sign-hint/g)).toHaveLength(4);
  });

  it('holds its motion still while a modal is open', () => {
    expect(menu({ dimmed: true })).toContain('landing-dimmed');
    expect(menu()).not.toContain('landing-dimmed');
  });
});

describe('Play on TV setup', () => {
  it('asks only who you play against on the TV, and picks a trader for a computer game', () => {
    const html = renderToStaticMarkup(createElement(PreGameSetupModal, { aiDifficulty: 'medium', onCancel: noop, onStart: noop }));
    expect(html).toContain('vs a trader');
    expect(html).toContain('vs a friend');
    expect(html).toContain('Choose your trader');
    expect(html).toContain('Cast to TV');
    expect(html).not.toContain('This Device');
  });
});
