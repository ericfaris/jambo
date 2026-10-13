import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AUDIO_FILES } from '../../src/ui/useAudioEvents.ts';

// public/design-system.html renders the app's real classes from the app's
// own stylesheets. These checks keep it from drifting into page-only copies.

const root = resolve(__dirname, '../..');
const html = readFileSync(resolve(root, 'public/design-system.html'), 'utf-8');
const sheets = [...html.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map((m) => m[1]!);
const css = sheets.filter((p) => existsSync(resolve(root, p))).map((p) => readFileSync(resolve(root, p), 'utf-8')).join('\n');
// Component source, for hook classes the markup carries without a rule of their own
const componentSource = [...readdirRecursive(resolve(root, 'src'))].filter((f) => f.endsWith('.tsx')).map((f) => readFileSync(f, 'utf-8')).join('\n');

function* readdirRecursive(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) yield* readdirRecursive(path);
    else yield path;
  }
}

function classTokens(): Set<string> {
  const tokens = new Set<string>();
  const add = (list: string) => {
    for (const t of list.split(/\s+/)) {
      // skip template pieces (`${…}`) and page chrome
      if (!t || t.includes('$') || t.includes('{') || t.startsWith('ds-')) continue;
      tokens.add(t);
    }
  };
  for (const m of html.matchAll(/class="([^"]*)"/g)) add(m[1]!);
  for (const m of html.matchAll(/className\s*=\s*'([^']*)'/g)) add(m[1]!);
  for (const m of html.matchAll(/className\s*=\s*"([^"]*)"/g)) add(m[1]!);
  return tokens;
}

describe('design-system showcase', () => {
  it('links stylesheets that exist', () => {
    expect(sheets.length).toBeGreaterThan(1);
    for (const p of sheets) expect(existsSync(resolve(root, p)), p).toBe(true);
  });

  it('uses only real app classes — styled in its CSS or emitted by its components', () => {
    const word = (c: string) => c.replace(/-/g, '\\-');
    const missing = [...classTokens()].filter((c) => !new RegExp(`\\.${word(c)}(?![\\w-])`).test(css)
      && !new RegExp(`(?<![\\w-])${word(c)}(?![\\w-])`).test(componentSource));
    expect(missing).toEqual([]);
  });

  it('has a section for every 2026-10-12 surface and the friend game', () => {
    for (const id of ['ds-board-1012', 'ds-coins', 'ds-utility-states', 'ds-spotlight', 'ds-flights', 'ds-resolve', 'ds-draw', 'ds-tilt', 'ds-settings', 'ds-landing', 'ds-tutorial', 'ds-ceremony', 'ds-friend']) {
      expect(html, id).toContain(`id="${id}"`);
    }
  });

  it('lists every sound effect the game plays', () => {
    const list = html.slice(html.indexOf('const sfxEvents'), html.indexOf('];', html.indexOf('const sfxEvents')));
    const listed = [...list.matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
    expect(listed).toEqual(Object.keys(AUDIO_FILES));
    for (const file of Object.values(AUDIO_FILES)) expect(existsSync(resolve(root, 'public', file.replace(/^\//, ''))), file).toBe(true);
  });

  it('plays the ambience bed the game uses', () => {
    expect(html).toContain('/audio/Market_Ambience_Bed.mp3');
  });
});
