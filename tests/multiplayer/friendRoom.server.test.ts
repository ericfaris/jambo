// Friend rooms end to end over the real WebSocket server (spawned — server.ts
// listens on import). A short reconnect window keeps the timeout cases fast.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import type { PublicGameState, PrivateGameState, OnlineSeatView, ServerMessage } from '../../src/multiplayer/types.ts';
import { chooseAction } from '../../scripts/lib/phonePolicy.ts';
import { createRng } from '../../src/utils/rng.ts';

const GRACE_MS = 1500;
let server: ChildProcess;
let url = '';
const dataDir = mkdtempSync(join(tmpdir(), 'jambo-friend-server-'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, '127.0.0.1', () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

class Client {
  ws!: WebSocket;
  inbox: ServerMessage[] = [];
  slot: 0 | 1 | null = null;
  token: string | undefined;
  pub: PublicGameState | null = null;
  priv: PrivateGameState | null = null;
  seats: [OnlineSeatView | null, OnlineSeatView | null] | null = null;
  seq = 0;
  async open(): Promise<this> {
    this.ws = new WebSocket(url);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as ServerMessage;
      this.inbox.push(m);
      if (m.type === 'JOINED') { this.slot = m.playerSlot; if (m.reconnectToken) this.token = m.reconnectToken; }
      if (m.type === 'GAME_STATE') { this.pub = m.public; this.priv = m.private; this.seq++; }
      if (m.type === 'GAME_OVER') { this.pub = m.public; this.seq++; }
      if (m.type === 'ROOM_PLAYERS') this.seats = m.seats;
    });
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
    return this;
  }
  send(m: object): void { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  last<T extends ServerMessage['type']>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return [...this.inbox].reverse().find((m) => m.type === type) as Extract<ServerMessage, { type: T }> | undefined;
  }
  async waitFor(pred: () => boolean, ms = 3000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred()) return true; await sleep(5); }
    return pred();
  }
  async waitForMessage<T extends ServerMessage['type']>(type: T, ms = 3000, pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true) {
    let found: Extract<ServerMessage, { type: T }> | undefined;
    await this.waitFor(() => {
      found = this.inbox.find((m) => m.type === type && pred(m as Extract<ServerMessage, { type: T }>)) as Extract<ServerMessage, { type: T }> | undefined;
      return !!found;
    }, ms);
    return found;
  }
  close(): void { try { this.ws.close(); } catch { /* */ } }
}

async function createFriendRoom(): Promise<{ host: Client; code: string }> {
  const host = await new Client().open();
  host.send({ type: 'CREATE_ROOM', mode: 'pvp', kind: 'friend' });
  const created = await host.waitForMessage('ROOM_CREATED');
  const code = created!.code;
  host.send({ type: 'JOIN_ROOM', code, role: 'player' });
  await host.waitForMessage('JOINED');
  return { host, code };
}

async function startedGame(): Promise<{ host: Client; guest: Client; code: string }> {
  const { host, code } = await createFriendRoom();
  const guest = await new Client().open();
  guest.send({ type: 'JOIN_ROOM', code, role: 'player' });
  await host.waitFor(() => !!host.pub && !!guest.pub && guest.slot !== null);
  return { host, guest, code };
}

beforeAll(async () => {
  const port = await freePort();
  url = `ws://127.0.0.1:${port}/ws`;
  server = spawn(join(process.cwd(), 'node_modules/.bin/tsx'), ['src/multiplayer/server.ts'], {
    env: { ...process.env, PORT: String(port), MONGODB_URI: '', JAMBO_DATA_DIR: dataDir, STATIC_DIR: dataDir, JAMBO_RECONNECT_GRACE_MS: String(GRACE_MS) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 20_000);
    server.stdout!.on('data', (chunk: Buffer) => {
      if (String(chunk).includes('running')) { clearTimeout(timer); resolve(); }
    });
    server.on('exit', (code) => reject(new Error(`server exited ${code}`)));
  });
}, 30_000);

afterAll(() => {
  server?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('friend rooms over the real server', () => {
  it('1. creating one sends no cast token; the host joins as a connected guest', async () => {
    const host = await new Client().open();
    host.send({ type: 'CREATE_ROOM', mode: 'ai', kind: 'friend' }); // mode is forced to pvp
    const created = await host.waitForMessage('ROOM_CREATED');
    expect(created).toBeDefined();
    expect(created!.castAccessToken).toBeUndefined();
    host.send({ type: 'JOIN_ROOM', code: created!.code, role: 'player' });
    const joined = await host.waitForMessage('JOINED');
    expect(joined).toMatchObject({ kind: 'friend', mode: 'pvp', playerSlot: 0 });
    expect(joined!.castAccessToken).toBeUndefined();
    await host.waitFor(() => !!host.seats);
    expect(host.seats![0]).toMatchObject({ name: 'Guest', signedIn: false, status: 'connected', graceMsLeft: null });
    expect(host.seats![1]).toBeNull();
    host.close();
  });

  it('2. the friend joins: both get the game as game 1, hands private, either seat may start', async () => {
    const firsts = new Set<number>();
    for (let i = 0; i < 12; i++) {
      const { host, guest } = await startedGame();
      const gs = host.last('GAME_STATE')!;
      expect(gs.gameNumber).toBe(1);
      expect(guest.last('GAME_STATE')!.gameNumber).toBe(1);
      expect(host.priv!.hand.filter((id) => guest.priv!.hand.includes(id))).toEqual([]);
      expect(host.pub!.players[1].handCount).toBe(guest.priv!.hand.length);
      expect(guest.pub!.players[0].handCount).toBe(host.priv!.hand.length);
      firsts.add(host.pub!.currentPlayer);
      host.close(); guest.close();
    }
    expect([...firsts].sort()).toEqual([0, 1]);
  }, 20_000);

  it('3. a dropped friend shows as reconnecting, and rejoins the same seat within the window', async () => {
    const { host, guest, code } = await startedGame();
    const slot = guest.slot;
    const token = guest.token;
    guest.close();
    await host.waitFor(() => host.seats?.[1]?.status === 'reconnecting');
    const seat = host.seats![1]!;
    expect(seat.graceMsLeft).toBeGreaterThan(0);
    expect(seat.graceMsLeft).toBeLessThanOrEqual(GRACE_MS);
    const back = await new Client().open();
    back.send({ type: 'JOIN_ROOM', code, role: 'player', reconnectToken: token });
    await back.waitFor(() => back.slot !== null && !!back.pub);
    expect(back.slot).toBe(slot);
    await host.waitFor(() => host.seats?.[1]?.status === 'connected');
    expect(host.seats![1]!.status).toBe('connected');
    // the game carries on past the old window
    await sleep(GRACE_MS + 300);
    expect(host.last('GAME_ABANDONED')).toBeUndefined();
    host.close(); back.close();
  }, 10_000);

  it('4. a friend who never comes back ends the game for the other; the room is gone', async () => {
    const { host, guest, code } = await startedGame();
    guest.close();
    const abandoned = await host.waitForMessage('GAME_ABANDONED', GRACE_MS + 2000);
    expect(abandoned).toEqual({ type: 'GAME_ABANDONED', leaver: 1, reason: 'timeout' });
    const late = await new Client().open();
    late.send({ type: 'JOIN_ROOM', code, role: 'player', reconnectToken: guest.token });
    const err = await late.waitForMessage('ERROR');
    expect(err?.message).toBe('Room not found');
    host.close(); late.close();
  }, 10_000);

  it('5. leaving mid-game tells the other player at once', async () => {
    const { host, guest } = await startedGame();
    guest.send({ type: 'LEAVE_ROOM' });
    const abandoned = await host.waitForMessage('GAME_ABANDONED', 1000);
    expect(abandoned).toEqual({ type: 'GAME_ABANDONED', leaver: 1, reason: 'left' });
    host.close(); guest.close();
  });

  it('6. a host who leaves the lobby deletes the room', async () => {
    const { host, code } = await createFriendRoom();
    host.send({ type: 'LEAVE_ROOM' });
    await sleep(100);
    const friend = await new Client().open();
    friend.send({ type: 'JOIN_ROOM', code, role: 'player' });
    expect((await friend.waitForMessage('ERROR'))?.message).toBe('Room not found');
    host.close(); friend.close();
  });

  it('7. a third player cannot join a running game', async () => {
    const { host, guest, code } = await startedGame();
    const third = await new Client().open();
    third.send({ type: 'JOIN_ROOM', code, role: 'player' });
    expect((await third.waitForMessage('ERROR'))?.message).toMatch(/^Room is full/);
    host.close(); guest.close(); third.close();
  });

  it('8. Cast rooms are unchanged: cast token, kind cast, seat 0 first, no ROOM_PLAYERS', async () => {
    const tv = await new Client().open();
    tv.send({ type: 'CREATE_ROOM', mode: 'ai', aiDifficulty: 'easy' });
    const created = await tv.waitForMessage('ROOM_CREATED');
    expect(created!.castAccessToken).toEqual(expect.any(String));
    tv.send({ type: 'JOIN_ROOM', code: created!.code, role: 'player' });
    const joined = await tv.waitForMessage('JOINED');
    expect(joined).toMatchObject({ kind: 'cast', castAccessToken: created!.castAccessToken });
    await tv.waitFor(() => !!tv.pub);
    expect(tv.pub!.currentPlayer).toBe(0);
    expect(tv.last('GAME_STATE')!.gameNumber).toBeUndefined();

    const pvp = await new Client().open();
    pvp.send({ type: 'CREATE_ROOM', mode: 'pvp' });
    const code = (await pvp.waitForMessage('ROOM_CREATED'))!.code;
    pvp.send({ type: 'JOIN_ROOM', code, role: 'player' });
    const other = await new Client().open();
    other.send({ type: 'JOIN_ROOM', code, role: 'player' });
    await pvp.waitFor(() => !!pvp.pub && !!other.pub);
    other.close();
    await sleep(150);
    expect([...tv.inbox, ...pvp.inbox, ...other.inbox].some((m) => m.type === 'ROOM_PLAYERS' || m.type === 'GAME_ABANDONED')).toBe(false);
    tv.close(); pvp.close();
  });

  it('9. guests leave no stats behind', () => {
    expect(existsSync(join(dataDir, 'stats.json'))).toBe(false);
    expect(existsSync(join(dataDir, 'abandons.json'))).toBe(false);
  });

  it('10. a full game reaches GAME_OVER with its story; a rematch is game 2', async () => {
    const { host, guest } = await startedGame();
    const rng = createRng(4711);
    const bySlot = () => (host.slot === 0 ? [host, guest] : [guest, host]) as [Client, Client];
    let steps = 0;
    while (host.pub!.phase !== 'GAME_OVER' && steps++ < 3000) {
      const pub = host.pub!;
      const who = pub.waitingOnPlayer ?? pub.currentPlayer;
      const phone = bySlot()[who];
      await phone.waitFor(() => phone.pub?.log.length === pub.log.length && !!phone.priv);
      const action = chooseAction(phone.pub!, phone.priv!, who, rng, { endTurnRate: 0.3 });
      expect(action).not.toBeNull();
      const seq = host.seq;
      const errors = phone.inbox.filter((m) => m.type === 'ERROR').length;
      phone.send({ type: 'GAME_ACTION', action });
      await host.waitFor(() => host.seq > seq || phone.inbox.filter((m) => m.type === 'ERROR').length > errors, 2000);
    }
    expect(host.pub!.phase).toBe('GAME_OVER');
    const over = await host.waitForMessage('GAME_OVER');
    expect(over!.story?.timeline.length).toBeGreaterThanOrEqual(2);
    host.send({ type: 'REQUEST_REMATCH' });
    guest.send({ type: 'REQUEST_REMATCH' });
    await host.waitFor(() => host.last('GAME_STATE')?.gameNumber === 2 && host.pub!.phase !== 'GAME_OVER');
    expect(host.last('GAME_STATE')!.gameNumber).toBe(2);
    host.close(); guest.close();
  }, 25_000);
});
