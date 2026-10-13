/// <reference types="node" />
// ============================================================================
// Cast server protocol fuzzer — two simulated phones play PvP games over the
// real WebSocket server, choosing moves only from what a phone can see.
// Sends real moves plus deliberately bad ones (the server must reject them
// with ERROR, never crash or corrupt), randomly drops and rejoins a phone
// mid-game, and checks after every broadcast:
//   - both phones see identical public state
//   - the two private hands never overlap and match the public hand counts
//   - a phone that is waited on can always make progress (no stall)
//   - games reach GAME_OVER; a rematch starts a fresh game
// With kind=friend (Play a friend rooms) it also checks: ROOM_PLAYERS stays
// sane through every drop and rejoin, both seats get to go first, every
// GAME_OVER carries the story, and leaving mid-game (last game) ends it for
// the other phone with GAME_ABANDONED. Prints scenario coverage.
//
// usage: start a server (PORT=3031 MONGODB_URI= npx tsx src/multiplayer/server.ts)
//        npx tsx scripts/cast-fuzz.ts [games=10] [seed=7000] [url=ws://127.0.0.1:3031/ws] [kind=cast|friend]
// ============================================================================

import WebSocket from 'ws';
import type { GameAction } from '../src/engine/types.ts';
import type { PublicGameState, PrivateGameState, OnlineSeatView } from '../src/multiplayer/types.ts';
import { createRng } from '../src/utils/rng.ts';
import { candidateActions } from './lib/phonePolicy.ts';

const GAMES = Number(process.argv[2] ?? 10);
const SEED = Number(process.argv[3] ?? 7000);
const URL = process.argv[4] ?? 'ws://127.0.0.1:3031/ws';
const KIND: 'cast' | 'friend' = process.argv[5] === 'friend' ? 'friend' : 'cast';
const STEP_CAP = 4000;
const coverage = { guardsPlayed: 0, rainMakers: 0, drafts: 0, auctions: 0, cancels: 0, firstPlayers: new Set<number>() };

type Msg = Record<string, unknown> & { type: string };
const findings: string[] = [];
const finding = (s: string) => { findings.push(s); console.log('  !! ' + s); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Phone {
  ws!: WebSocket;
  slot: 0 | 1 | null = null;
  token: string | undefined;
  pub: PublicGameState | null = null;
  priv: PrivateGameState | null = null;
  seq = 0; // increments on every GAME_STATE
  errors: string[] = [];
  inbox: Msg[] = [];
  seats: [OnlineSeatView | null, OnlineSeatView | null] | null = null;
  constructor(public name: string) {}
  async open(): Promise<void> {
    this.ws = new WebSocket(URL);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as Msg;
      this.inbox.push(m);
      if (m.type === 'JOINED') { this.slot = m.playerSlot as 0 | 1; if (m.reconnectToken) this.token = m.reconnectToken as string; }
      if (m.type === 'GAME_STATE') { this.pub = m.public as PublicGameState; this.priv = m.private as PrivateGameState; this.seq++; }
      if (m.type === 'GAME_OVER') { this.pub = m.public as PublicGameState; this.seq++; }
      if (m.type === 'ERROR') this.errors.push(m.message as string);
      if (m.type === 'ROOM_PLAYERS') this.seats = m.seats as [OnlineSeatView | null, OnlineSeatView | null];
    });
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
  }
  send(m: object) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  async waitFor(pred: () => boolean, ms = 3000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred()) return true; await sleep(5); }
    return pred();
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function createRoom(): Promise<string> {
  const h = new Phone('host'); await h.open();
  h.send(KIND === 'friend' ? { type: 'CREATE_ROOM', mode: 'pvp', kind: 'friend' } : { type: 'CREATE_ROOM', mode: 'pvp' });
  await h.waitFor(() => h.inbox.some((m) => m.type === 'ROOM_CREATED'));
  const code = h.inbox.find((m) => m.type === 'ROOM_CREATED')!.code as string;
  h.close();
  return code;
}

function candidates(ph: Phone, rng: () => number): GameAction[] {
  return candidateActions(ph.pub!, ph.priv!, ph.slot!, rng);
}

function check(a: Phone, b: Phone, ctx: string) {
  if (!a.pub || !b.pub || !a.priv || !b.priv) return;
  if (a.pub.log.length !== b.pub.log.length) return; // mid-broadcast; compare once both caught up
  const strip = (p: PublicGameState) => JSON.stringify({ ...p, canCancel: undefined, waitingOnPlayer: undefined });
  if (strip(a.pub) !== strip(b.pub)) finding(`${ctx}: phones disagree on public state (turn ${a.pub.turn})`);
  const overlap = a.priv.hand.filter((id) => b.priv!.hand.includes(id));
  if (overlap.length) finding(`${ctx}: both hands contain ${overlap.join(',')}`);
  for (const ph of [a, b]) {
    if (ph.slot !== null && ph.pub!.players[ph.slot].handCount !== ph.priv!.hand.length) {
      finding(`${ctx}: ${ph.name} hand ${ph.priv!.hand.length} != public handCount ${ph.pub!.players[ph.slot].handCount}`);
    }
  }
}

async function playGame(g: number) {
  const rng = createRng(SEED + g);
  const code = await createRoom();
  const A = new Phone('A'), B = new Phone('B');
  for (const ph of [A, B]) { await ph.open(); ph.send({ type: 'JOIN_ROOM', code, role: 'player' }); }
  await A.waitFor(() => !!A.pub && !!B.pub && A.slot !== null && B.slot !== null, 5000);
  if (!A.pub) { finding(`game ${g}: never started`); return; }
  coverage.firstPlayers.add(A.pub.currentPlayer);
  let steps = 0, rejected = 0, reconnects = 0;
  const leaveAt = KIND === 'friend' && g === GAMES - 1 ? 40 + Math.floor(rng() * 40) : -1;
  const bySlot = () => (A.slot === 0 ? [A, B] : [B, A]) as [Phone, Phone];

  while (steps++ < STEP_CAP) {
    const pub = A.pub!;
    if (pub.phase === 'GAME_OVER') break;
    const waiting = pub.pendingGuardReaction?.targetPlayer ?? pub.pendingWareCardReaction?.targetPlayer ?? pub.waitingOnPlayer ?? pub.currentPlayer;
    const ph = bySlot()[waiting];

    // friend rooms: the last game ends with a player leaving mid-game
    if (steps === leaveAt) {
      const other = ph === A ? B : A;
      ph.send({ type: 'LEAVE_ROOM' });
      const told = await other.waitFor(() => other.inbox.some((m) => m.type === 'GAME_ABANDONED'), 3000);
      const msg = other.inbox.find((m) => m.type === 'GAME_ABANDONED');
      if (!told || msg?.leaver !== ph.slot || msg?.reason !== 'left') finding(`game ${g}: LEAVE_ROOM mid-game did not end it for the other phone (${JSON.stringify(msg)})`);
      console.log(`game ${g}: ${ph.name} left at step ${steps} → ${other.name} told ${JSON.stringify(msg)}`);
      A.close(); B.close();
      return;
    }

    // random drop + rejoin of the acting phone
    if (rng() < 0.02) {
      const slot = ph.slot, token = ph.token;
      ph.close(); await sleep(30 + Math.floor(rng() * 200));
      await ph.open(); ph.slot = null;
      ph.send({ type: 'JOIN_ROOM', code, role: 'player', reconnectToken: token });
      const ok = await ph.waitFor(() => ph.slot !== null && !!ph.pub, 4000);
      if (!ok || ph.slot !== slot) { finding(`game ${g}: ${ph.name} rejoined as ${ph.slot}, expected ${slot}`); return; }
      reconnects++;
      if (KIND === 'friend') {
        const other = ph === A ? B : A;
        const sane = await other.waitFor(() => other.seats?.[slot!]?.status === 'connected' && other.seats?.[1 - slot!]?.status === 'connected', 2000);
        if (!sane) finding(`game ${g}: after ${ph.name} rejoined, ROOM_PLAYERS says ${JSON.stringify(other.seats)}`);
      }
    }

    let progressed = false;
    for (const action of candidates(ph, rng).slice(0, 160)) {
      const seq0 = ph.seq, err0 = ph.errors.length;
      ph.send({ type: 'GAME_ACTION', action });
      await ph.waitFor(() => ph.seq > seq0 || ph.errors.length > err0, 2000);
      if (ph.seq > seq0 && ph.errors.length === err0) {
        progressed = true;
        if (action.type === 'GUARD_REACTION' && action.play) coverage.guardsPlayed++;
        if (action.type === 'WARE_CARD_REACTION' && action.play) coverage.rainMakers++;
        if (action.type === 'CANCEL_ACTION') coverage.cancels++;
        if (action.type === 'RESOLVE_INTERACTION' && pub.pendingResolutionType === 'DRAFT') coverage.drafts++;
        if (action.type === 'RESOLVE_INTERACTION' && pub.pendingResolutionType === 'AUCTION') coverage.auctions++;
        break;
      }
      rejected++;
      await ph.waitFor(() => ph.seq > seq0, 30); // server resends state after an error
    }
    if (!progressed) {
      finding(`game ${g}: STALL — ${ph.name} (slot ${ph.slot}) could not act; phase ${pub.phase} pending ${pub.pendingResolutionType} last error "${ph.errors.at(-1)}"`);
      break;
    }
    await sleep(2);
    check(A, B, `game ${g} step ${steps}`);
  }
  const over = A.pub?.phase === 'GAME_OVER';
  if (!over) finding(`game ${g}: no GAME_OVER after ${steps} steps (turn ${A.pub?.turn})`);
  if (over && KIND === 'friend') {
    for (const ph of [A, B]) {
      await ph.waitFor(() => ph.inbox.some((m) => m.type === 'GAME_OVER'), 2000);
      const msg = ph.inbox.find((m) => m.type === 'GAME_OVER') as { story?: { timeline?: unknown[] } | null } | undefined;
      if (!msg?.story?.timeline?.length) finding(`game ${g}: ${ph.name} got GAME_OVER without a story`);
    }
  }

  const finalTurn = A.pub?.turn;
  // rematch: both vote → fresh game at turn 1
  if (over) {
    A.send({ type: 'REQUEST_REMATCH' }); B.send({ type: 'REQUEST_REMATCH' });
    const fresh = await A.waitFor(() => A.pub?.phase !== 'GAME_OVER' && A.pub?.turn === 1, 4000);
    if (!fresh) finding(`game ${g}: rematch did not start a new game`);
  }
  console.log(`game ${g}: ${over ? 'GAME_OVER' : 'unfinished'} turn ${finalTurn} steps ${steps} rejected ${rejected} reconnects ${reconnects} errors seen ${A.errors.length + B.errors.length}`);
  A.close(); B.close();
}

(async () => {
  for (let g = 0; g < GAMES; g++) await playGame(g);
  if (KIND === 'friend') {
    if (GAMES >= 6 && coverage.firstPlayers.size < 2) finding(`only seat ${[...coverage.firstPlayers].join()} ever went first`);
    console.log(`coverage: guards played ${coverage.guardsPlayed}, rain makers ${coverage.rainMakers}, draft picks ${coverage.drafts}, auction moves ${coverage.auctions}, cancels ${coverage.cancels}, first players ${[...coverage.firstPlayers].sort().join('+')}`);
  }
  console.log(`cast-fuzz${KIND === 'friend' ? ' (friend rooms)' : ''}: ${GAMES} games, findings: ${findings.length}`);
  process.exit(findings.length ? 1 : 0);
})();
