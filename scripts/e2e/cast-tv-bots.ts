/// <reference types="node" />
// ============================================================================
// Cast TV playtest — the phones. Plays Cast games over the real WebSocket
// server at a human pace so the TV (scripts/e2e/cast-tv.py) gets to animate
// every move. Moves come only from what a phone can see (phonePolicy).
//
// Prints one JSON line per event on stdout for the TV harness:
//   {"event":"room","code","token","mode"}     once the room exists
//   {"event":"checkpoint","n"}                  the phones pause here (CHECKPOINT_MS)
//   {"event":"gameover","turn","gold"}          a game reached GAME_OVER
//   {"event":"rematch"}                         both seats voted; a fresh game starts
//   {"event":"done","findings"}                 last line
//
// usage: npx tsx scripts/e2e/cast-tv-bots.ts <ai|pvp> [games=1] [seed=9100] [paceMs=650] [url=ws://127.0.0.1:3031/ws]
// ============================================================================

import WebSocket from 'ws';
import type { GameAction } from '../../src/engine/types.ts';
import type { PublicGameState, PrivateGameState } from '../../src/multiplayer/types.ts';
import { createRng } from '../../src/utils/rng.ts';
import { candidateActions } from '../lib/phonePolicy.ts';

const MODE: 'ai' | 'pvp' = process.argv[2] === 'ai' ? 'ai' : 'pvp';
const GAMES = Number(process.argv[3] ?? 1);
const SEED = Number(process.argv[4] ?? 9100);
const PACE_MS = Number(process.argv[5] ?? 650);
const URL = process.argv[6] ?? 'ws://127.0.0.1:3031/ws';
const STEP_CAP = 3000;
/** A checkpoint every N moves: the phones hold still so the TV can be compared with the server. */
const CHECKPOINT_EVERY = 14;
const CHECKPOINT_MS = 4500;

type Msg = Record<string, unknown> & { type: string };
const findings: string[] = [];
const emit = (o: object) => console.log(JSON.stringify(o));
const finding = (s: string) => { findings.push(s); emit({ event: 'finding', text: s }); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Phone {
  ws!: WebSocket;
  slot: 0 | 1 | null = null;
  pub: PublicGameState | null = null;
  priv: PrivateGameState | null = null;
  seq = 0;
  errors: string[] = [];
  inbox: Msg[] = [];
  constructor(public name: string) {}
  async open(): Promise<void> {
    this.ws = new WebSocket(URL);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as Msg;
      this.inbox.push(m);
      if (m.type === 'JOINED') this.slot = m.playerSlot as 0 | 1;
      if (m.type === 'GAME_STATE') { this.pub = m.public as PublicGameState; this.priv = m.private as PrivateGameState; this.seq++; }
      if (m.type === 'GAME_OVER') { this.pub = m.public as PublicGameState; this.seq++; }
      if (m.type === 'ERROR') this.errors.push(m.message as string);
    });
    await new Promise<void>((res, rej) => { this.ws.once('open', () => res()); this.ws.once('error', rej); });
  }
  send(m: object) { if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m)); }
  async waitFor(pred: () => boolean, ms = 3000): Promise<boolean> {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (pred()) return true; await sleep(10); }
    return pred();
  }
  close() { try { this.ws.close(); } catch { /* */ } }
}

async function main() {
  const rng = createRng(SEED);
  // The phone that creates a Cast room stays in it, like the real host phone
  const A = new Phone('A');
  await A.open();
  A.send({ type: 'CREATE_ROOM', mode: MODE, aiDifficulty: 'medium' });
  await A.waitFor(() => A.inbox.some((m) => m.type === 'ROOM_CREATED'));
  const created = A.inbox.find((m) => m.type === 'ROOM_CREATED')!;
  const code = created.code as string;
  emit({ event: 'room', code, token: created.castAccessToken, mode: MODE });
  // Give the TV a moment to sync before anyone joins
  await sleep(4000);

  A.send({ type: 'JOIN_ROOM', code, role: 'player' });
  const phones: Phone[] = [A];
  if (MODE === 'pvp') {
    const B = new Phone('B');
    await B.open();
    B.send({ type: 'JOIN_ROOM', code, role: 'player' });
    phones.push(B);
  }
  const started = await A.waitFor(() => !!A.pub && phones.every((p) => p.slot !== null), 8000);
  if (!started) { finding('game never started'); emit({ event: 'done', findings }); process.exit(1); }

  let checkpoint = 0;
  for (let g = 0; g < GAMES; g++) {
    let steps = 0, moves = 0;
    while (steps++ < STEP_CAP) {
      const pub = A.pub!;
      if (pub.phase === 'GAME_OVER') break;
      const waiting = pub.pendingGuardReaction?.targetPlayer ?? pub.pendingWareCardReaction?.targetPlayer ?? pub.waitingOnPlayer ?? pub.currentPlayer;
      const ph = phones.find((p) => p.slot === waiting);
      if (!ph) {
        // the server's AI holds this decision: wait for it to move
        const seq0 = A.seq;
        const moved = await A.waitFor(() => A.seq > seq0, 15000);
        if (!moved) { finding(`AI STALL: no move from the server AI in 15s (turn ${pub.turn}, pending ${pub.pendingResolutionType})`); break; }
        continue;
      }
      let progressed = false;
      for (const action of candidateActions(ph.pub!, ph.priv!, ph.slot!, rng).slice(0, 160) as GameAction[]) {
        const seq0 = ph.seq, err0 = ph.errors.length;
        ph.send({ type: 'GAME_ACTION', action });
        await ph.waitFor(() => ph.seq > seq0 || ph.errors.length > err0, 2000);
        if (ph.seq > seq0 && ph.errors.length === err0) { progressed = true; break; }
        await ph.waitFor(() => ph.seq > seq0, 30);
      }
      if (!progressed) { finding(`STALL: ${ph.name} (seat ${ph.slot}) could not act; phase ${pub.phase} pending ${pub.pendingResolutionType}`); break; }
      moves++;
      if (moves % CHECKPOINT_EVERY === 0) {
        emit({ event: 'checkpoint', n: ++checkpoint });
        await sleep(CHECKPOINT_MS);
      } else {
        await sleep(PACE_MS);
      }
    }
    const over = A.pub?.phase === 'GAME_OVER';
    if (!over) { finding(`game ${g}: no GAME_OVER after ${steps} steps`); break; }
    emit({ event: 'gameover', game: g, turn: A.pub!.turn, gold: A.pub!.players.map((p) => p.gold) });
    await sleep(6000); // the TV shows the result
    if (g < GAMES - 1) {
      for (const p of phones) p.send({ type: 'REQUEST_REMATCH' });
      const fresh = await A.waitFor(() => A.pub?.phase !== 'GAME_OVER' && A.pub?.turn === 1, 6000);
      if (!fresh) { finding(`game ${g}: rematch did not start a new game`); break; }
      emit({ event: 'rematch' });
      await sleep(3000);
    }
  }
  emit({ event: 'done', findings });
  for (const p of phones) p.close();
  process.exit(findings.length ? 1 : 0);
}

void main();
