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
//
// usage: start a server (PORT=3031 MONGODB_URI= npx tsx src/multiplayer/server.ts)
//        npx tsx scripts/cast-fuzz.ts [games=10] [seed=7000] [url=ws://127.0.0.1:3031/ws]
// ============================================================================

import WebSocket from 'ws';
import type { GameAction, InteractionResponse, GameState } from '../src/engine/types.ts';
import { WARE_TYPES } from '../src/engine/types.ts';
import type { PublicGameState, PrivateGameState } from '../src/multiplayer/types.ts';
import { getCard } from '../src/engine/cards/CardDatabase.ts';
import { getFallbackInteractionResponses } from '../src/ai/RandomAI.ts';
import { createRng } from '../src/utils/rng.ts';

const GAMES = Number(process.argv[2] ?? 10);
const SEED = Number(process.argv[3] ?? 7000);
const URL = process.argv[4] ?? 'ws://127.0.0.1:3031/ws';
const STEP_CAP = 4000;

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
  h.send({ type: 'CREATE_ROOM', mode: 'pvp' });
  await h.waitFor(() => h.inbox.some((m) => m.type === 'ROOM_CREATED'));
  const code = h.inbox.find((m) => m.type === 'ROOM_CREATED')!.code as string;
  h.close();
  return code;
}

/** Best-effort GameState from one phone's view — enough for fallback responses. */
function synthetic(pub: PublicGameState, priv: PrivateGameState, slot: 0 | 1): GameState {
  return {
    currentPlayer: pub.currentPlayer, phase: pub.phase, actionsLeft: pub.actionsLeft, turn: pub.turn,
    pendingResolution: priv.pendingResolution, pendingGuardReaction: pub.pendingGuardReaction, pendingWareCardReaction: pub.pendingWareCardReaction,
    wareSupply: pub.wareSupply, discardPile: pub.discardPile, deck: Array(pub.deckCount).fill('unknown_1'),
    turnModifiers: pub.turnModifiers, endgame: pub.endgame, log: pub.log, drawnCard: priv.drawnCard,
    players: [0, 1].map((p) => ({ ...pub.players[p], hand: p === slot ? priv.hand : [] })) as unknown as GameState['players'],
  } as unknown as GameState;
}

function candidates(ph: Phone, rng: () => number): GameAction[] {
  const pub = ph.pub!, priv = ph.priv!, me = ph.slot!;
  const out: GameAction[] = [];
  const shuffle = <T>(xs: T[]) => xs.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  if (pub.pendingGuardReaction?.targetPlayer === me) return shuffle([{ type: 'GUARD_REACTION', play: true }, { type: 'GUARD_REACTION', play: false }]);
  if (pub.pendingWareCardReaction?.targetPlayer === me) return shuffle([{ type: 'WARE_CARD_REACTION', play: true }, { type: 'WARE_CARD_REACTION', play: false }]);
  if (priv.pendingResolution) {
    if (pub.canCancel && rng() < 0.05) out.push({ type: 'CANCEL_ACTION' });
    let fb: InteractionResponse[] = [];
    try { fb = getFallbackInteractionResponses(synthetic(pub, priv, me)); } catch { /* partial state */ }
    const junk: InteractionResponse[] = [
      { type: 'SELECT_WARE_TYPE', wareType: 'gold' as never }, { type: 'SELECT_CARDS', cardIds: [priv.hand[0] ?? 'x', priv.hand[0] ?? 'x'] },
      { type: 'AUCTION_BID', amount: -1 }, { type: 'SELECT_WARE', wareIndex: 99 },
    ];
    for (const r of shuffle([...fb, pick(rng, junk), ...WARE_TYPES.map((w) => ({ type: 'SELECT_WARE_TYPE', wareType: w }) as InteractionResponse), { type: 'BINARY_CHOICE', choice: 0 }, { type: 'BINARY_CHOICE', choice: 1 }, { type: 'AUCTION_PASS' }, { type: 'AUCTION_BID', amount: 1 + Math.floor(rng() * 4) }])) {
      out.push({ type: 'RESOLVE_INTERACTION', response: r });
    }
    // every card id / index this phone can see in the decision
    const visible = new Set<string>(priv.hand);
    const scan = JSON.stringify([priv.pendingResolution, priv.revealedCards, priv.revealedHand, pub.discardPile.slice(0, 12)]);
    for (const m of scan.matchAll(/"([a-z]+(?:_[a-z0-9]+)*_\d+)"/g)) visible.add(m[1]);
    for (const id of visible) {
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_CARD', cardId: id } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'DISCARD_PICK', cardId: id } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_CARDS', cardIds: [id] } });
    }
    const marketIdx = pub.players[me].market.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
    const oppIdx = pub.players[1 - me].market.map((w, i) => (w ? i : -1)).filter((i) => i >= 0);
    for (const i of [...marketIdx, ...oppIdx]) {
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_WARE', wareIndex: i } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'RETURN_WARE', wareIndex: i } });
    }
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELL_WARES', wareIndices: marketIdx } });
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_WARES', wareIndices: marketIdx.slice(0, 3) } });
    for (let i = 0; i < 6; i++) {
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'DECK_PEEK_PICK', cardIndex: i } });
      out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_UTILITY', utilityIndex: i } });
    }
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'OPPONENT_DISCARD_SELECTION', cardIndices: priv.hand.map((_, i) => i).slice(0, Math.max(0, priv.hand.length - 3)) } });
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'OPPONENT_CHOICE', choice: 0 } }, { type: 'RESOLVE_INTERACTION', response: { type: 'OPPONENT_CHOICE', choice: 1 } });
    out.push({ type: 'RESOLVE_INTERACTION', response: { type: 'SELECT_CARD', cardId: '' } });
    return out;
  }
  if (pub.phase === 'DRAW') {
    return priv.drawnCard
      ? shuffle([{ type: 'KEEP_CARD' }, { type: 'DISCARD_DRAWN' }])
      : shuffle([{ type: 'DRAW_CARD' }, { type: 'SKIP_DRAW' }, { type: 'END_TURN' }]);
  }
  for (const id of priv.hand) {
    if (getCard(id).type === 'ware') out.push({ type: 'PLAY_CARD', cardId: id, wareMode: rng() < 0.5 ? 'buy' : 'sell' });
    else out.push({ type: 'PLAY_CARD', cardId: id });
  }
  pub.players[me].utilities.forEach((_, i) => out.push({ type: 'ACTIVATE_UTILITY', utilityIndex: i }));
  const end: GameAction = { type: 'END_TURN' };
  const shuffled = shuffle(out);
  return rng() < 0.18 ? [end, ...shuffled] : [...shuffled, end];
}
function pick<T>(rng: () => number, xs: T[]): T { return xs[Math.floor(rng() * xs.length)]; }

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
  let steps = 0, rejected = 0, reconnects = 0;
  const bySlot = () => (A.slot === 0 ? [A, B] : [B, A]) as [Phone, Phone];

  while (steps++ < STEP_CAP) {
    const pub = A.pub!;
    if (pub.phase === 'GAME_OVER') break;
    const waiting = pub.pendingGuardReaction?.targetPlayer ?? pub.pendingWareCardReaction?.targetPlayer ?? pub.waitingOnPlayer ?? pub.currentPlayer;
    const ph = bySlot()[waiting];

    // random drop + rejoin of the acting phone
    if (rng() < 0.02) {
      const slot = ph.slot, token = ph.token;
      ph.close(); await sleep(30 + Math.floor(rng() * 200));
      await ph.open(); ph.slot = null;
      ph.send({ type: 'JOIN_ROOM', code, role: 'player', reconnectToken: token });
      const ok = await ph.waitFor(() => ph.slot !== null && !!ph.pub, 4000);
      if (!ok || ph.slot !== slot) { finding(`game ${g}: ${ph.name} rejoined as ${ph.slot}, expected ${slot}`); return; }
      reconnects++;
    }

    let progressed = false;
    for (const action of candidates(ph, rng).slice(0, 160)) {
      const seq0 = ph.seq, err0 = ph.errors.length;
      ph.send({ type: 'GAME_ACTION', action });
      await ph.waitFor(() => ph.seq > seq0 || ph.errors.length > err0, 2000);
      if (ph.seq > seq0 && ph.errors.length === err0) { progressed = true; break; }
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

  // rematch: both vote → fresh game at turn 1
  if (over) {
    A.send({ type: 'REQUEST_REMATCH' }); B.send({ type: 'REQUEST_REMATCH' });
    const fresh = await A.waitFor(() => A.pub?.phase !== 'GAME_OVER' && A.pub?.turn === 1, 4000);
    if (!fresh) finding(`game ${g}: rematch did not start a new game`);
  }
  console.log(`game ${g}: ${over ? 'GAME_OVER' : 'unfinished'} turn ${A.pub?.turn} steps ${steps} rejected ${rejected} reconnects ${reconnects} errors seen ${A.errors.length + B.errors.length}`);
  A.close(); B.close();
}

(async () => {
  for (let g = 0; g < GAMES; g++) await playGame(g);
  console.log(`cast-fuzz: ${GAMES} games, findings: ${findings.length}`);
  process.exit(findings.length ? 1 : 0);
})();
