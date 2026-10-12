import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BACKGROUND_MUSIC, MARKET_AMBIENCE, AMBIENCE_BASE_VOLUME, TRACK_GAP_MS, startBackgroundMusic } from '../../src/ui/useBackgroundMusic.ts';

const root = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf-8');
const mp3sIn = (source: string) => [...source.matchAll(/'(?:\/audio\/)?([\w,-]+\.mp3)'/g)].map((m) => m[1]);

describe('background music playlist', () => {
  const tracks = BACKGROUND_MUSIC.map((p) => p.replace('/audio/', ''));

  it('includes the ElevenLabs track', () => {
    expect(tracks).toContain('Golden_Hour_Kalimba.mp3');
  });

  it('every track exists in public/audio', () => {
    for (const t of tracks) expect(existsSync(resolve(root, 'public/audio', t)), t).toBe(true);
  });

  it('the Cast TV receiver plays the same tracks', () => {
    const receiver = read('receiver/caf/receiver-app.js');
    const list = receiver.slice(receiver.indexOf('TV_MUSIC_PLAYLIST'), receiver.indexOf('];', receiver.indexOf('TV_MUSIC_PLAYLIST')));
    expect(mp3sIn(list)).toEqual(tracks);
  });

  it('the Cast TV receiver uses the same ambience file, level and gap', () => {
    const receiver = read('receiver/caf/receiver-app.js');
    expect(receiver).toContain(`TV_AMBIENCE_URL = '${MARKET_AMBIENCE}'`);
    expect(receiver).toContain(`TV_AMBIENCE_VOLUME = ${AMBIENCE_BASE_VOLUME}`);
    expect(receiver).toContain(`TV_TRACK_GAP_MS = ${TRACK_GAP_MS}`);
    expect(read('receiver/caf/index.html')).toContain('id="bgAmbience"');
  });

  it('the design-system showcase lists the same tracks', () => {
    const html = read('public/design-system.html');
    const list = html.slice(html.indexOf('const bgmTracks'), html.indexOf('];', html.indexOf('const bgmTracks')));
    expect(mp3sIn(list)).toEqual(tracks);
  });
});

class FakeAudio {
  src = '';
  loop = false;
  volume = 1;
  paused = true;
  style: Record<string, string> = {};
  private handlers = new Map<string, () => void>();
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  remove() {}
  addEventListener(type: string, fn: () => void) { this.handlers.set(type, fn); }
  removeEventListener(type: string) { this.handlers.delete(type); }
  fire(type: string) { this.paused = type === 'ended' ? true : this.paused; this.handlers.get(type)?.(); }
}

describe('startBackgroundMusic', () => {
  let created: FakeAudio[];
  let windowListeners: Map<string, (e: Event) => void>;
  let stored: Record<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    created = [];
    windowListeners = new Map();
    stored = {};
    vi.stubGlobal('document', {
      createElement: () => { const a = new FakeAudio(); created.push(a); return a; },
      body: { appendChild: () => {} },
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    vi.stubGlobal('window', {
      localStorage: { getItem: (k: string) => stored[k] ?? null },
      addEventListener: (t: string, fn: (e: Event) => void) => windowListeners.set(t, fn),
      removeEventListener: (t: string) => windowListeners.delete(t),
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: number) => clearTimeout(id),
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const start = async () => {
    const stop = startBackgroundMusic();
    await vi.advanceTimersByTimeAsync(0); // let play() promises settle
    const [music, ambience] = created;
    return { stop: stop!, music, ambience };
  };

  it('loops the market ambience alongside the music', async () => {
    const { stop, music, ambience } = await start();
    expect(ambience.src).toBe(MARKET_AMBIENCE);
    expect(ambience.loop).toBe(true);
    expect(ambience.paused).toBe(false);
    expect(music.paused).toBe(false);
    expect(ambience.volume).toBeCloseTo(0.5 * AMBIENCE_BASE_VOLUME);
    stop();
  });

  it('waits TRACK_GAP_MS between songs while the ambience keeps playing', async () => {
    const { stop, music, ambience } = await start();
    const first = music.src;
    music.fire('ended');
    await vi.advanceTimersByTimeAsync(TRACK_GAP_MS - 1);
    expect(music.src).toBe(first);
    expect(ambience.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(music.src).not.toBe(first);
    expect(music.paused).toBe(false);
    stop();
  });

  it('volume changes and ducking move the ambience with the music', async () => {
    const { stop, ambience } = await start();
    windowListeners.get('jambo-music-duck')!(new CustomEvent('jambo-music-duck', { detail: 1000 }));
    expect(ambience.volume).toBeCloseTo(0.5 * AMBIENCE_BASE_VOLUME * 0.5);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ambience.volume).toBeCloseTo(0.5 * AMBIENCE_BASE_VOLUME);
    stored['jambo.muted'] = 'true';
    windowListeners.get('jambo-volume-change')!(new Event('jambo-volume-change'));
    expect(ambience.volume).toBe(0);
    stop();
  });

  it('cleanup stops the ambience and cancels a pending next track', async () => {
    const { stop, music, ambience } = await start();
    const first = music.src;
    music.fire('ended');
    stop();
    expect(ambience.paused).toBe(true);
    expect(ambience.src).toBe('');
    await vi.advanceTimersByTimeAsync(TRACK_GAP_MS);
    expect(music.src).toBe('');
    expect(music.src).not.toBe(first);
  });

  it('ambience file exists in public/audio', () => {
    const file = resolve(root, 'public', MARKET_AMBIENCE.slice(1));
    expect(existsSync(file)).toBe(true);
  });
});
