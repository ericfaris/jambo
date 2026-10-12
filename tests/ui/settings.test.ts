import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_STORAGE_KEYS,
  readPreferences,
  writePreference,
  clearPreferences,
  applyDocumentPreferences,
} from '../../src/ui/preferences.ts';
import type { Preferences } from '../../src/ui/preferences.ts';
import { SettingsPanel } from '../../src/ui/SettingsPanel.tsx';

let stored: Record<string, string>;
let attrs: Record<string, string>;

beforeEach(() => {
  stored = {};
  attrs = {};
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (k: string) => stored[k] ?? null,
      setItem: (k: string, v: string) => { stored[k] = v; },
      removeItem: (k: string) => { delete stored[k]; },
    },
    location: { hostname: 'jambo.example' },
    dispatchEvent: () => true,
  });
  vi.stubGlobal('document', {
    documentElement: {
      setAttribute: (k: string, v: string) => { attrs[k] = v; },
      removeAttribute: (k: string) => { delete attrs[k]; },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('preferences storage', () => {
  it('a fresh browser gets the defaults', () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it('reads the keys the app has always written (no settings lost on upgrade)', () => {
    Object.assign(stored, {
      'jambo.volume': '80',
      'jambo.muted': 'true',
      'jambo.traderVoices': 'false',
      'jambo.animationSpeed': 'fast',
      'jambo.aiSpeed': 'brisk',
      'jambo.highContrast': 'true',
      'jambo.ambientMotion': 'false',
      'jambo.logPinned': 'true',
      'jambo.devTelemetry': 'true',
      'jambo.uxDebugCounters': 'false',
    });
    expect(readPreferences()).toEqual<Preferences>({
      volume: 80,
      muted: true,
      traderVoices: false,
      animationSpeed: 'fast',
      aiSpeed: 'brisk',
      highContrast: true,
      ambientMotion: false,
      logPinned: true,
      devTelemetry: true,
      uxDebug: false,
    });
  });

  it('ignores garbage values', () => {
    Object.assign(stored, { 'jambo.volume': '999', 'jambo.animationSpeed': 'warp', 'jambo.aiSpeed': 'ludicrous' });
    const prefs = readPreferences();
    expect(prefs.volume).toBe(50);
    expect(prefs.animationSpeed).toBe('normal');
    expect(prefs.aiSpeed).toBe('normal');
  });

  it('write → read round-trips every preference', () => {
    const changed: Preferences = {
      volume: 35, muted: true, traderVoices: false, animationSpeed: 'fast', aiSpeed: 'relaxed',
      highContrast: true, ambientMotion: false, logPinned: true, devTelemetry: true, uxDebug: false,
    };
    for (const key of Object.keys(changed) as (keyof Preferences)[]) {
      writePreference(key, changed[key]);
    }
    expect(readPreferences()).toEqual(changed);
  });

  it('clearing restores the defaults and drops the retired log key', () => {
    stored['jambo.showGameLog'] = 'true';
    writePreference('highContrast', true);
    writePreference('volume', 10);
    writePreference('aiSpeed', 'brisk');
    clearPreferences();
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(stored).toEqual({});
  });

  it('every non-audio preference has a storage key', () => {
    const audio = new Set(['volume', 'muted']);
    for (const key of Object.keys(DEFAULT_PREFERENCES)) {
      if (audio.has(key)) continue;
      expect(PREFERENCE_STORAGE_KEYS).toHaveProperty(key);
    }
  });

  it('survives blocked storage', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage { throw new Error('blocked'); },
      location: { hostname: 'x' },
    });
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(() => writePreference('highContrast', true)).not.toThrow();
    expect(() => clearPreferences()).not.toThrow();
  });
});

describe('applyDocumentPreferences', () => {
  it('reflects pace, contrast and motion on <html>', () => {
    applyDocumentPreferences({ ...DEFAULT_PREFERENCES, animationSpeed: 'fast', aiSpeed: 'brisk', highContrast: true, ambientMotion: false });
    expect(attrs).toEqual({ 'data-anim-speed': 'fast', 'data-ai-speed': 'brisk', 'data-contrast': 'high', 'data-ambient': 'off' });
    applyDocumentPreferences(DEFAULT_PREFERENCES);
    expect(attrs).toEqual({ 'data-anim-speed': 'normal', 'data-ai-speed': 'normal' });
  });

  it('is a no-op without a DOM', () => {
    vi.stubGlobal('document', undefined);
    expect(() => applyDocumentPreferences(DEFAULT_PREFERENCES)).not.toThrow();
  });
});

describe('SettingsPanel', () => {
  const render = (overrides: Partial<Parameters<typeof SettingsPanel>[0]> = {}) => renderToStaticMarkup(createElement(SettingsPanel, {
    prefs: { ...DEFAULT_PREFERENCES },
    setPref: () => {},
    resetPrefs: () => {},
    showAiOptions: true,
    showLogPin: true,
    ...overrides,
  }));

  it('shows every player-facing setting where an AI opponent applies (main menu, solo)', () => {
    const html = render();
    for (const label of ['Volume', 'Trader voices', 'Animations', 'AI pace', 'High contrast', 'Ambient motion', 'Dock the action log', 'Reset to defaults']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('Relaxed');
    expect(html).toContain('Brisk');
  });

  it('hotseat / Cast hide the AI-only and log options', () => {
    const html = render({ showAiOptions: false, showLogPin: false });
    expect(html).not.toContain('Trader voices');
    expect(html).not.toContain('AI pace');
    expect(html).not.toContain('Dock the action log');
    expect(html).toContain('High contrast');
    expect(html).toContain('Volume');
  });

  it('switches and segments report their state accessibly', () => {
    const html = render({ prefs: { ...DEFAULT_PREFERENCES, highContrast: true, animationSpeed: 'fast' } });
    expect(html).toMatch(/role="switch" aria-checked="true"[^>]*>.*?High contrast/);
    expect(html).toMatch(/role="radio" aria-checked="true"[^>]*>Fast</);
    expect(html).toMatch(/role="radio" aria-checked="false"[^>]*>Normal</);
  });

  it('a muted volume reads as Off and disables the slider', () => {
    const html = render({ prefs: { ...DEFAULT_PREFERENCES, muted: true } });
    expect(html).toContain('>Off<');
    expect(html).toMatch(/<input[^>]*type="range"[^>]*disabled/);
    expect(html).toContain('aria-label="Unmute audio"');
  });

  it('developer switches stay hidden off localhost', () => {
    expect(render()).not.toContain('Telemetry overlay');
    vi.stubGlobal('window', { location: { hostname: 'localhost' }, localStorage: { getItem: () => null } });
    expect(render()).toContain('Telemetry overlay');
  });

  it('compact mode drops the hints but keeps the controls', () => {
    const html = render({ compact: true });
    expect(html).toContain('settings-panel-compact');
    expect(html).toContain('High contrast');
  });

  it('renders surface-specific sections', () => {
    const html = render({ extraSections: createElement('div', null, 'TV tools') });
    expect(html).toContain('TV tools');
  });
});
