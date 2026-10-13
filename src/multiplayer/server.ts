// ============================================================================
// Cast Mode — WebSocket Server
// Runs the authoritative game engine; clients send actions, receive split state.
// Usage: npm run server (tsx src/multiplayer/server.ts)
// ============================================================================

import { isAuctionBidding } from '../engine/responder.ts';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { createInitialState } from '../engine/GameState.ts';
import { createStartingState } from '../persistence/replayLog.ts';
import { buildGameStory } from '../ui/gameStory.ts';
import type { GameStory } from '../ui/gameStory.ts';
import { processAction } from '../engine/GameEngine.ts';
import { getAiActionByDifficulty } from '../ai/difficulties/index.ts';
import { getAiActionDescription } from '../ai/aiActionDescriptions.ts';
import { extractAiTurnFeatures } from '../ai/telemetry/extract.ts';
import { getAiTelemetryEnabled, getAiTelemetrySampleRate, shouldSampleTelemetryGame } from '../ai/telemetry/config.ts';
import { getValidActions } from '../engine/validation/actionValidator.ts';
import { extractPublicState, extractPrivateState } from './stateSplitter.ts';
import { detectAudioEvent } from './audioEvents.ts';
import { PLAYER_RECONNECT_GRACE_MS, ROOM_IDLE_TIMEOUT_MS, isRoomAbandoned, canCreateRoom, MAX_MESSAGE_BYTES } from './roomLifecycle.ts';
import type { GameState, GameAction } from '../engine/types.ts';
import { CONSTANTS } from '../engine/types.ts';
import type {
  ClientMessage,
  ServerMessage,
  RoomMode,
  RoomKind,
  PlayerSlot,
  AudioEvent,
} from './types.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import { loadLocalEnv } from './loadEnv.ts';
import { handleAuthApi } from './auth.ts';
import { isPasswordAuthReady, logMissingAuthConfig } from './authCore.ts';
import { PASSWORD_MIN_LENGTH } from './accountRules.ts';
import { getTurnstileSiteKey } from './turnstile.ts';
import { handleStatsApi } from './statsApi.ts';
import { resolveCastPublicRoom, toCastPublicRoomPayload, validateCastRoomAccess } from './castApi.ts';
import { recordAiDecision, recordAiGameSummary } from './aiTelemetryStore.ts';
import { contentTypeFor } from './mimeTypes.ts';
import { getSession } from './authStore.ts';
import { resolveSessionIdentity, seatProfileId, GUEST_IDENTITY } from './onlineIdentity.ts';
import type { SessionIdentity } from './onlineIdentity.ts';
import { seatViews, onlineGameResults, onlineAbandon, randomFirstPlayer } from './friendRoom.ts';
import type { SeatIdentity, SeatPair } from './friendRoom.ts';
import { recordCompletedGame, recordAbandonedGame } from './statsStore.ts';

loadLocalEnv();

// --- Room ---

interface Connection {
  ws: WebSocket;
  playerSlot: PlayerSlot;
  reconnectToken?: string;
}

interface ReservedPlayerSlot {
  slot: PlayerSlot;
  reconnectToken: string;
  expiresAt: number;
}

interface Room {
  code: string;
  castAccessToken: string;
  mode: RoomMode;
  /** 'friend' = Play a friend: no TV, each player sees the full board. */
  kind: RoomKind;
  aiDifficulty: AIDifficulty;
  state: GameState | null;
  connections: Connection[];
  reservedSlots: ReservedPlayerSlot[];
  rematchVotes: Set<PlayerSlot>;
  lastActivity: number;
  telemetryGameId: string | null;
  telemetryStartedAt: number | null;
  telemetryDecisionIndex: number;
  telemetrySampled: boolean;
  // --- Friend rooms only ---
  identities: SeatPair<SeatIdentity>;
  /** Seats that left for good (Leave, or the reconnect window ran out). */
  leftSlots: Set<PlayerSlot>;
  /** Fires when a disconnected seat's reconnect window runs out. */
  seatTimers: Map<PlayerSlot, ReturnType<typeof setTimeout>>;
  /** Increments with every new game (rematches), so each tab tosses the coin once. */
  gameNumber: number;
  /** The seeded start and every action — the endgame story is replayed from them. */
  startingState: GameState | null;
  actions: GameAction[];
  story: GameStory | null;
  resultRecorded: boolean;
  /** Seats whose abandon is already logged for this game. */
  abandonLogged: Set<PlayerSlot>;
}

const rooms = new Map<string, Room>();
const castRoomStreams = new Map<string, Set<import('node:http').ServerResponse>>();
const AI_TELEMETRY_ENABLED = getAiTelemetryEnabled();
const AI_TELEMETRY_SAMPLE_RATE = getAiTelemetrySampleRate();
const AI_SCHEMA_VERSION = 1;
const AI_VERSION = process.env['AI_VERSION'] ?? process.env['npm_package_version'] ?? 'dev';
const ENGINE_VERSION = process.env['ENGINE_VERSION'] ?? process.env['npm_package_version'] ?? 'dev';

// --- Helpers ---

function generateRoomCode(): string {
  let code: string;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function generateReconnectToken(): string {
  return randomBytes(16).toString('hex');
}

function generateCastAccessToken(): string {
  return randomBytes(24).toString('base64url');
}

function generateTelemetryGameId(): string {
  return `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`;
}

function initializeTelemetryForNewGame(room: Room): void {
  room.telemetryGameId = generateTelemetryGameId();
  room.telemetryStartedAt = Date.now();
  room.telemetryDecisionIndex = 0;
  room.telemetrySampled = AI_TELEMETRY_ENABLED && shouldSampleTelemetryGame(AI_TELEMETRY_SAMPLE_RATE);
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function findConnection(room: Room, ws: WebSocket): Connection | undefined {
  return room.connections.find(c => c.ws === ws);
}

function findRoom(ws: WebSocket): Room | undefined {
  for (const room of rooms.values()) {
    if (room.connections.some(c => c.ws === ws)) return room;
  }
  return undefined;
}

function findRooms(ws: WebSocket): Room[] {
  const matches: Room[] = [];
  for (const room of rooms.values()) {
    if (room.connections.some((connection) => connection.ws === ws)) {
      matches.push(room);
    }
  }
  return matches;
}

function getPlayerConnections(room: Room, slot: PlayerSlot): Connection[] {
  return room.connections.filter(c => c.playerSlot === slot);
}

function getPlayerCount(room: Room): number {
  const slots = new Set<PlayerSlot>();
  for (const c of room.connections) {
    slots.add(c.playerSlot);
  }
  return slots.size;
}

function getActivePlayerSlots(room: Room): Set<PlayerSlot> {
  const slots = new Set<PlayerSlot>();
  for (const c of room.connections) {
    slots.add(c.playerSlot);
  }
  return slots;
}

function clearExpiredReservations(room: Room): void {
  const now = Date.now();
  room.reservedSlots = room.reservedSlots.filter((reservation) => reservation.expiresAt > now);
}

function findReservationByToken(room: Room, reconnectToken: string): ReservedPlayerSlot | undefined {
  clearExpiredReservations(room);
  return room.reservedSlots.find((reservation) => reservation.reconnectToken === reconnectToken);
}

function reservePlayerSlot(room: Room, slot: PlayerSlot, reconnectToken: string): void {
  clearExpiredReservations(room);
  room.reservedSlots = [
    ...room.reservedSlots.filter((reservation) => reservation.slot !== slot),
    { slot, reconnectToken, expiresAt: Date.now() + PLAYER_RECONNECT_GRACE_MS },
  ];
}

function releaseReservedSlot(room: Room, slot: PlayerSlot): void {
  clearExpiredReservations(room);
  room.reservedSlots = room.reservedSlots.filter((reservation) => reservation.slot !== slot);
}

function getReservedSlots(room: Room): Set<PlayerSlot> {
  clearExpiredReservations(room);
  return new Set(room.reservedSlots.map((reservation) => reservation.slot));
}

function writeSseEvent(res: import('node:http').ServerResponse, eventName: string, payload: unknown): void {
  if (res.writableEnded) return;
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function addCastRoomStream(roomCode: string, res: import('node:http').ServerResponse): void {
  const listeners = castRoomStreams.get(roomCode) ?? new Set<import('node:http').ServerResponse>();
  listeners.add(res);
  castRoomStreams.set(roomCode, listeners);
}

function removeCastRoomStream(roomCode: string, res: import('node:http').ServerResponse): void {
  const listeners = castRoomStreams.get(roomCode);
  if (!listeners) return;
  listeners.delete(res);
  if (listeners.size === 0) {
    castRoomStreams.delete(roomCode);
  }
}

function broadcastCastRoomSnapshot(room: Room): void {
  const listeners = castRoomStreams.get(room.code);
  if (!listeners || listeners.size === 0) return;
  const payload = toCastPublicRoomPayload(room);
  for (const res of listeners) {
    writeSseEvent(res, 'room', payload);
  }
}

function closeCastRoomStreams(roomCode: string): void {
  const listeners = castRoomStreams.get(roomCode);
  if (!listeners) return;
  for (const res of listeners) {
    writeSseEvent(res, 'room_deleted', { roomCode });
    res.end();
  }
  castRoomStreams.delete(roomCode);
}

function getRequiredRematchSlots(room: Room): PlayerSlot[] {
  if (room.mode === 'ai') return [0];
  return [0, 1];
}

function broadcastRematchStatus(room: Room): void {
  const required = getRequiredRematchSlots(room);
  const votes = required.filter((slot) => room.rematchVotes.has(slot));
  for (const conn of room.connections) {
    send(conn.ws, { type: 'REMATCH_STATUS', votes, required });
  }
}

function removeConnectionFromRoom(
  room: Room,
  conn: Connection,
  options: { reserveSlot: boolean; reason: 'disconnect' | 'switch' | 'leave' },
): void {
  room.connections = room.connections.filter((connection) => connection.ws !== conn.ws);
  room.rematchVotes.delete(conn.playerSlot);
  const slotStillConnected = room.connections.some((connection) => connection.playerSlot === conn.playerSlot);

  // A friend who leaves mid-game (Leave, or this tab joined another room)
  // ends it for both: the other player is told, the leaver's abandon logged.
  if (room.kind === 'friend' && !options.reserveSlot && !slotStillConnected && isLiveGame(room)) {
    releaseReservedSlot(room, conn.playerSlot);
    room.leftSlots.add(conn.playerSlot);
    console.log(`[Room ${room.code}] Player ${conn.playerSlot} left mid-game`);
    closeFriendRoom(room, { leaver: conn.playerSlot, reason: 'left' });
    return;
  }

  if (options.reserveSlot && conn.reconnectToken) {
    reservePlayerSlot(room, conn.playerSlot, conn.reconnectToken);
    if (room.kind === 'friend') scheduleSeatExpiry(room, conn.playerSlot);
  } else {
    releaseReservedSlot(room, conn.playerSlot);
    if (room.kind === 'friend' && !slotStillConnected) {
      clearSeatTimer(room, conn.playerSlot);
      room.leftSlots.add(conn.playerSlot);
    }
  }
  room.lastActivity = Date.now();

  const disconnectReason = options.reason === 'disconnect' ? 'disconnected' : options.reason === 'leave' ? 'left' : 'left (joined another room)';
  console.log(`[Room ${room.code}] Player ${conn.playerSlot} ${disconnectReason}`);

  for (const other of room.connections) {
    send(other.ws, { type: 'PLAYER_DISCONNECTED', playerSlot: conn.playerSlot });
  }
  broadcastRematchStatus(room);
  broadcastRoomPlayers(room);
  broadcastCastRoomSnapshot(room);

  if (isRoomAbandoned(room.connections.length, room.reservedSlots, Date.now())) {
    deleteRoom(room);
    console.log(`[Room ${room.code}] Deleted (empty)`);
  } else if (room.connections.length === 0) {
    console.log(`[Room ${room.code}] Empty — holding for reconnect (${PLAYER_RECONNECT_GRACE_MS / 1000}s)`);
  }
}

// --- Friend rooms ---

function isLiveGame(room: Room): boolean {
  return room.state !== null && room.state.phase !== 'GAME_OVER';
}

/** Every path that removes a room goes through here, so no seat timer outlives it. */
function deleteRoom(room: Room): void {
  for (const timer of room.seatTimers.values()) clearTimeout(timer);
  room.seatTimers.clear();
  closeCastRoomStreams(room.code);
  if (rooms.get(room.code) === room) rooms.delete(room.code);
}

function clearSeatTimer(room: Room, slot: PlayerSlot): void {
  const timer = room.seatTimers.get(slot);
  if (timer) clearTimeout(timer);
  room.seatTimers.delete(slot);
}

function scheduleSeatExpiry(room: Room, slot: PlayerSlot): void {
  clearSeatTimer(room, slot);
  room.seatTimers.set(slot, setTimeout(() => expireFriendSeat(room, slot), PLAYER_RECONNECT_GRACE_MS));
}

function broadcastRoomPlayers(room: Room): void {
  if (room.kind !== 'friend') return;
  clearExpiredReservations(room);
  const seats = seatViews({
    identities: room.identities,
    connected: getActivePlayerSlots(room),
    reservations: room.reservedSlots,
    left: room.leftSlots,
    now: Date.now(),
  });
  for (const conn of room.connections) {
    send(conn.ws, { type: 'ROOM_PLAYERS', seats });
  }
}

/** A disconnected friend's reconnect window ran out. */
function expireFriendSeat(room: Room, slot: PlayerSlot): void {
  room.seatTimers.delete(slot);
  if (rooms.get(room.code) !== room) return; // already closed
  if (room.connections.some((connection) => connection.playerSlot === slot)) return; // came back
  releaseReservedSlot(room, slot);
  room.leftSlots.add(slot);
  console.log(`[Room ${room.code}] Player ${slot} did not come back`);
  if (isLiveGame(room)) {
    closeFriendRoom(room, { leaver: slot, reason: 'timeout' });
    return;
  }
  broadcastRoomPlayers(room);
  if (isRoomAbandoned(room.connections.length, room.reservedSlots, Date.now())) {
    deleteRoom(room);
    console.log(`[Room ${room.code}] Deleted (empty)`);
  }
}

/**
 * Ends a friend game nobody can finish: logs an abandon for the leaver and
 * any other seat that isn't here (both gone ⇒ both abandoned), tells whoever
 * is still connected, and closes the room.
 */
function closeFriendRoom(room: Room, { leaver, reason }: { leaver: PlayerSlot; reason: 'left' | 'timeout' }): void {
  const now = Date.now();
  const connected = getActivePlayerSlots(room);
  for (const slot of [0, 1] as const) {
    if (slot !== leaver && connected.has(slot)) continue;
    if (room.abandonLogged.has(slot)) continue;
    room.abandonLogged.add(slot);
    const abandon = onlineAbandon(room.state, slot, room.identities[slot], now);
    if (abandon) {
      void recordAbandonedGame(abandon).catch((error: unknown) => {
        console.error('[Stats] Online abandon write failed:', (error as Error).message);
      });
    }
  }
  for (const conn of room.connections) {
    if (conn.playerSlot !== leaver) send(conn.ws, { type: 'GAME_ABANDONED', leaver, reason });
  }
  room.connections = [];
  room.reservedSlots = [];
  deleteRoom(room);
  console.log(`[Room ${room.code}] Closed — player ${leaver} ${reason === 'left' ? 'left' : 'never came back'}`);
}

/** A new friend game (first or rematch): random first player, fresh story and records. */
function startFriendGame(room: Room): void {
  room.state = createStartingState(undefined, randomFirstPlayer());
  room.gameNumber += 1;
  room.startingState = room.state;
  room.actions = [];
  room.story = null;
  room.resultRecorded = false;
  room.abandonLogged.clear();
}

function friendStory(room: Room): GameStory | null {
  if (room.story) return room.story;
  if (!room.startingState) return null;
  try {
    room.story = buildGameStory(room.startingState, room.actions);
  } catch (error) {
    console.error(`[Room ${room.code}] Story failed:`, (error as Error).message);
    room.story = null;
  }
  return room.story;
}

function recordFriendResults(room: Room): void {
  if (room.resultRecorded || !room.state) return;
  room.resultRecorded = true;
  for (const result of onlineGameResults(room.state, room.identities, Date.now(), room.actions)) {
    void recordCompletedGame(result).catch((error: unknown) => {
      console.error('[Stats] Online result write failed:', (error as Error).message);
    });
  }
}

// --- Broadcast ---

function broadcastState(room: Room, audioEvent: AudioEvent | null, aiMessage: string | null = null): void {
  if (!room.state) return;

  const publicState = extractPublicState(room.state);
  broadcastCastRoomSnapshot(room);

  // Send to player connections (public + their private)
  for (const slot of [0, 1] as PlayerSlot[]) {
    const privateState = extractPrivateState(room.state, slot);
    for (const conn of getPlayerConnections(room, slot)) {
      const msg: ServerMessage = {
        type: 'GAME_STATE',
        public: publicState,
        private: privateState,
        audioEvent,
        aiMessage,
        ...gameNumberField(room),
      };
      send(conn.ws, msg);
    }
  }
}

function sendStateToConnection(room: Room, conn: Connection, audioEvent: AudioEvent | null = null, aiMessage: string | null = null): void {
  if (!room.state) return;

  const publicState = extractPublicState(room.state);
  const privateState = extractPrivateState(room.state, conn.playerSlot);

  send(conn.ws, {
    type: 'GAME_STATE',
    public: publicState,
    private: privateState,
    audioEvent,
    aiMessage,
    ...gameNumberField(room),
  });
}

function gameNumberField(room: Room): { gameNumber?: number } {
  return room.kind === 'friend' ? { gameNumber: room.gameNumber } : {};
}

// --- AI Loop ---

function scheduleAiTurn(room: Room): void {
  if (!room.state || room.mode !== 'ai') return;
  if (room.state.phase === 'GAME_OVER') return;

  // AI is player 1
  const aiSlot: PlayerSlot = 1;
  const needsAi = isWaitingForPlayer(room.state, aiSlot);
  if (!needsAi) return;

  setTimeout(() => {
    if (!room.state) return;
    // Re-check — state may have changed
    if (!isWaitingForPlayer(room.state, aiSlot)) return;

    const decisionState = room.state;
    const action = getAiActionByDifficulty(decisionState, room.aiDifficulty);
    if (!action) return;

    try {
      room.state = processAction(decisionState, action);
      room.lastActivity = Date.now();
      const audioEvent = detectAudioEvent(action, decisionState);
      const aiMessage = getAiActionDescription(action, room.state);
      broadcastState(room, audioEvent, aiMessage);

      if (room.telemetrySampled && room.telemetryGameId) {
        const candidates = getValidActions(decisionState).map((candidate) => ({ action: candidate }));
        const features = extractAiTurnFeatures(decisionState, aiSlot);
        const turnIndex = room.telemetryDecisionIndex;
        room.telemetryDecisionIndex += 1;

        void recordAiDecision({
          gameId: room.telemetryGameId,
          roomCode: room.code,
          aiDifficulty: room.aiDifficulty,
          aiPlayerSlot: aiSlot,
          turnIndex,
          features,
          candidates,
          chosen: action,
          schemaVersion: AI_SCHEMA_VERSION,
          aiVersion: AI_VERSION,
          engineVersion: ENGINE_VERSION,
          createdAt: Date.now(),
        }).catch((error: unknown) => {
          console.error('[AI telemetry] Decision write failed:', (error as Error).message);
        });
      }

      // Check game over
      if (room.state.phase === 'GAME_OVER') {
        broadcastGameOver(room);
        return;
      }

      // Continue AI loop
      scheduleAiTurn(room);
    } catch (e) {
      console.error('[AI] Action failed:', (e as Error).message);
      // Retry once more after a delay
      setTimeout(() => scheduleAiTurn(room), CONSTANTS.AI_ACTION_DELAY_MS);
    }
  }, CONSTANTS.AI_ACTION_DELAY_MS);
}

function isWaitingForPlayer(state: GameState, slot: PlayerSlot): boolean {
  if (state.phase === 'GAME_OVER') return false;

  // Guard reaction
  if (state.pendingGuardReaction) {
    return state.pendingGuardReaction.targetPlayer === slot;
  }

  // Ware card reaction
  if (state.pendingWareCardReaction) {
    return state.pendingWareCardReaction.targetPlayer === slot;
  }

  // Resolution
  const pr = state.pendingResolution;
  if (pr) {
    switch (pr.type) {
      case 'OPPONENT_DISCARD':
        return pr.targetPlayer === slot;
      case 'OPPONENT_CHOICE':
        return state.currentPlayer !== slot;
      case 'AUCTION':
        if (!isAuctionBidding(pr)) {
          return state.currentPlayer === slot;
        }
        return pr.nextBidder === slot;
      case 'DRAFT':
        return pr.currentPicker === slot;
      case 'UTILITY_KEEP':
        return (pr.step === 'ACTIVE_CHOOSE' && state.currentPlayer === slot) ||
               (pr.step === 'OPPONENT_CHOOSE' && state.currentPlayer !== slot);
      case 'CARRIER_WARE_SELECT':
        return pr.targetPlayer === slot;
      default:
        return state.currentPlayer === slot;
    }
  }

  // Normal turn
  return state.currentPlayer === slot;
}

function broadcastGameOver(room: Room): void {
  if (!room.state) return;
  const publicState = extractPublicState(room.state);
  const story = room.kind === 'friend' ? friendStory(room) : undefined;
  for (const conn of room.connections) {
    send(conn.ws, { type: 'GAME_OVER', public: publicState, ...(room.kind === 'friend' ? { story } : {}) });
  }
  if (room.kind === 'friend') recordFriendResults(room);

  if (room.mode === 'ai' && room.telemetrySampled && room.telemetryGameId && room.telemetryStartedAt !== null) {
    const state = room.state;
    const aiSlot: PlayerSlot = 1;
    const opponentSlot: PlayerSlot = 0;
    const aiGold = state.players[aiSlot].gold;
    const opponentGold = state.players[opponentSlot].gold;
    const winner: 0 | 1 | null = aiGold === opponentGold ? null : (aiGold > opponentGold ? aiSlot : opponentSlot);

    void recordAiGameSummary({
      gameId: room.telemetryGameId,
      roomCode: room.code,
      aiDifficulty: room.aiDifficulty,
      aiPlayerSlot: aiSlot,
      winner,
      aiGold,
      opponentGold,
      turnCount: state.turn,
      rngSeed: state.rngSeed,
      schemaVersion: AI_SCHEMA_VERSION,
      aiVersion: AI_VERSION,
      engineVersion: ENGINE_VERSION,
      startedAt: room.telemetryStartedAt,
      completedAt: Date.now(),
    }).catch((error: unknown) => {
      console.error('[AI telemetry] Game summary write failed:', (error as Error).message);
    });
  }

  room.telemetryGameId = null;
  room.telemetryStartedAt = null;
  room.telemetryDecisionIndex = 0;
  room.telemetrySampled = false;
}

// --- Game Start ---

function tryStartGame(room: Room): void {
  if (room.state) return; // already started
  const playerCount = getPlayerCount(room);

  if (room.mode === 'ai' && playerCount >= 1) {
    room.rematchVotes.clear();
    room.state = createInitialState();
    initializeTelemetryForNewGame(room);
    broadcastState(room, null);
    // AI is player 1 — if it's their turn first, start AI loop
    scheduleAiTurn(room);
  } else if (room.mode === 'pvp' && playerCount >= 2) {
    room.rematchVotes.clear();
    if (room.kind === 'friend') startFriendGame(room);
    else room.state = createInitialState();
    initializeTelemetryForNewGame(room);
    broadcastState(room, null);
  }
}

// --- Message Handlers ---

function handleCreateRoom(ws: WebSocket, requestedMode: RoomMode, aiDifficulty: AIDifficulty = 'medium', kind: RoomKind = 'cast'): void {
  // A friend game is always two people
  const mode: RoomMode = kind === 'friend' ? 'pvp' : requestedMode;
  if (!canCreateRoom(rooms.size)) {
    send(ws, { type: 'ERROR', message: 'The server is busy right now — please try again in a few minutes' });
    console.warn(`[Rooms] Refused CREATE_ROOM: ${rooms.size} live rooms`);
    return;
  }
  const code = generateRoomCode();
  const room: Room = {
    code,
    castAccessToken: generateCastAccessToken(),
    mode,
    aiDifficulty,
    state: null,
    connections: [],
    reservedSlots: [],
    rematchVotes: new Set<PlayerSlot>(),
    lastActivity: Date.now(),
    telemetryGameId: null,
    telemetryStartedAt: null,
    telemetryDecisionIndex: 0,
    telemetrySampled: false,
    kind,
    identities: [null, null],
    leftSlots: new Set<PlayerSlot>(),
    seatTimers: new Map(),
    gameNumber: 0,
    startingState: null,
    actions: [],
    story: null,
    resultRecorded: false,
    abandonLogged: new Set<PlayerSlot>(),
  };
  rooms.set(code, room);
  // A friend room has no TV, so its cast token never leaves the server
  send(ws, kind === 'friend' ? { type: 'ROOM_CREATED', code } : { type: 'ROOM_CREATED', code, castAccessToken: room.castAccessToken });
  broadcastCastRoomSnapshot(room);
  console.log(`[Room ${code}] Created (${kind === 'friend' ? 'friend' : `${mode} mode, ai=${aiDifficulty}`})`);
}

function handleJoinRoom(
  ws: WebSocket,
  code: string,
  reconnectToken?: string,
  identity: SessionIdentity = GUEST_IDENTITY,
  clientProfileId?: unknown,
): void {
  const room = rooms.get(code);
  if (!room) {
    send(ws, { type: 'ERROR', message: 'Room not found' });
    return;
  }

  clearExpiredReservations(room);

  // Skip if this connection is already in the room
  if (room.connections.some(c => c.ws === ws)) {
    for (const joinedRoom of findRooms(ws)) {
      if (joinedRoom.code === code) {
        continue;
      }
      const joinedConnection = findConnection(joinedRoom, ws);
      if (!joinedConnection) {
        continue;
      }
      removeConnectionFromRoom(joinedRoom, joinedConnection, { reserveSlot: false, reason: 'switch' });
    }
    return;
  }

  if (reconnectToken) {
    const duplicate = room.connections.find((connection) => connection.reconnectToken === reconnectToken && connection.ws !== ws);
    if (duplicate) {
      room.connections = room.connections.filter((connection) => connection !== duplicate);
      try {
        duplicate.ws.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  let playerSlot: PlayerSlot | null = null;
  let assignedReconnectToken = reconnectToken;

  const activeSlots = getActivePlayerSlots(room);
  const reservedSlots = getReservedSlots(room);

  if (assignedReconnectToken) {
    const reservation = findReservationByToken(room, assignedReconnectToken);
    if (reservation && !activeSlots.has(reservation.slot)) {
      playerSlot = reservation.slot;
      releaseReservedSlot(room, reservation.slot);
    }
  }

  if (!assignedReconnectToken) {
    assignedReconnectToken = generateReconnectToken();
  }

  if (playerSlot === null) {
    if (room.mode === 'ai') {
      // AI mode: only slot 0 available for human
      if (!activeSlots.has(0) && !reservedSlots.has(0)) {
        playerSlot = 0;
      }
    } else {
      // PvP: assign first available unreserved slot
      if (!activeSlots.has(0) && !reservedSlots.has(0)) {
        playerSlot = 0;
      } else if (!activeSlots.has(1) && !reservedSlots.has(1)) {
        playerSlot = 1;
      }
    }

    if (playerSlot === null) {
      send(ws, { type: 'ERROR', message: 'Room is full or reconnect slot is reserved' });
      return;
    }
  }

  for (const joinedRoom of findRooms(ws)) {
    if (joinedRoom.code === code) {
      continue;
    }
    const joinedConnection = findConnection(joinedRoom, ws);
    if (!joinedConnection) {
      continue;
    }
    removeConnectionFromRoom(joinedRoom, joinedConnection, { reserveSlot: false, reason: 'switch' });
  }

  const conn: Connection = {
    ws,
    playerSlot,
    reconnectToken: assignedReconnectToken,
  };
  room.connections.push(conn);
  room.lastActivity = Date.now();
  if (room.kind === 'friend') {
    // (Re)claimed seat: whoever sits here now, back from any "left" state
    room.identities[playerSlot] = {
      name: identity.name,
      avatarUrl: identity.avatarUrl,
      signedIn: identity.signedIn,
      profileId: seatProfileId(identity, clientProfileId),
    };
    clearSeatTimer(room, playerSlot);
    room.leftSlots.delete(playerSlot);
  }
  broadcastCastRoomSnapshot(room);

  send(ws, room.kind === 'friend' ? {
    type: 'JOINED',
    playerSlot,
    mode: room.mode,
    kind: room.kind,
    reconnectToken: assignedReconnectToken,
  } : {
    type: 'JOINED',
    playerSlot,
    mode: room.mode,
    kind: room.kind,
    reconnectToken: assignedReconnectToken,
    castAccessToken: room.castAccessToken,
  });
  console.log(`[Room ${code}] player joined as slot ${playerSlot}`);
  broadcastRoomPlayers(room);

  // Notify others about new player
  for (const other of room.connections) {
    if (other.ws !== ws) {
      send(other.ws, { type: 'PLAYER_JOINED', playerSlot });
    }
  }

  // Try to start the game
  tryStartGame(room);

  // If game already started (reconnection), send current state
  if (room.state) {
    const publicState = extractPublicState(room.state);
    const privateState = extractPrivateState(room.state, playerSlot);
    send(ws, { type: 'GAME_STATE', public: publicState, private: privateState, audioEvent: null, aiMessage: null, ...gameNumberField(room) });
    // Back on a finished friend game: the endgame screen and rematch votes too
    if (room.kind === 'friend' && room.state.phase === 'GAME_OVER') {
      send(ws, { type: 'GAME_OVER', public: publicState, story: friendStory(room) });
      broadcastRematchStatus(room);
    }
  }
}

function handleLeaveRoom(ws: WebSocket): void {
  for (const room of findRooms(ws)) {
    const conn = findConnection(room, ws);
    if (conn) removeConnectionFromRoom(room, conn, { reserveSlot: false, reason: 'leave' });
  }
}

function handleGameAction(ws: WebSocket, action: GameAction): void {
  const room = findRoom(ws);
  if (!room || !room.state) {
    send(ws, { type: 'ERROR', message: 'Not in an active game' });
    return;
  }

  const conn = findConnection(room, ws);
  if (!conn) {
    send(ws, { type: 'ERROR', message: 'Only players can send actions' });
    return;
  }

  // Verify it's this player's turn to act
  if (!isWaitingForPlayer(room.state, conn.playerSlot)) {
    send(ws, { type: 'ERROR', message: 'Not your turn' });
    sendStateToConnection(room, conn);
    return;
  }

  try {
    const before = room.state;
    room.state = processAction(room.state, action);
    room.lastActivity = Date.now();
    if (room.kind === 'friend') room.actions.push(action);

    const audioEvent = detectAudioEvent(action, before);
    broadcastState(room, audioEvent, null);

    // Check game over
    if (room.state.phase === 'GAME_OVER') {
      broadcastGameOver(room);
      return;
    }

    // After human action, check if AI needs to go
    if (room.mode === 'ai') {
      scheduleAiTurn(room);
    }
  } catch (e) {
    send(ws, { type: 'ERROR', message: (e as Error).message });
    sendStateToConnection(room, conn);
  }
}

function handleRematchRequest(ws: WebSocket): void {
  const room = findRoom(ws);
  if (!room || !room.state) {
    send(ws, { type: 'ERROR', message: 'Not in an active game' });
    return;
  }

  if (room.state.phase !== 'GAME_OVER') {
    send(ws, { type: 'ERROR', message: 'Rematch is only available after GAME_OVER' });
    return;
  }

  const conn = findConnection(room, ws);
  if (!conn) {
    send(ws, { type: 'ERROR', message: 'Only players can request a rematch' });
    return;
  }

  const required = getRequiredRematchSlots(room);
  if (!required.includes(conn.playerSlot)) {
    send(ws, { type: 'ERROR', message: 'This player cannot request a rematch' });
    return;
  }

  room.rematchVotes.add(conn.playerSlot);
  room.lastActivity = Date.now();
  broadcastRematchStatus(room);

  const allReady = required.every((slot) => room.rematchVotes.has(slot));
  if (!allReady) return;

  if (room.kind === 'friend') startFriendGame(room);
  else room.state = createInitialState();
  initializeTelemetryForNewGame(room);
  room.rematchVotes.clear();
  broadcastState(room, null, null);
  broadcastRematchStatus(room);

  if (room.mode === 'ai') {
    scheduleAiTurn(room);
  }
}

// --- Connection Handling ---

function handleDisconnect(ws: WebSocket): void {
  const joinedRooms = findRooms(ws);
  if (joinedRooms.length === 0) return;

  for (const room of joinedRooms) {
    const conn = findConnection(room, ws);
    if (!conn) {
      continue;
    }
    removeConnectionFromRoom(room, conn, { reserveSlot: true, reason: 'disconnect' });
  }
}

// --- Room Cleanup (abandoned rooms, and 1 hour inactivity) ---

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    clearExpiredReservations(room);
    if (room.kind === 'friend' && isLiveGame(room)) {
      // Safety net — a seat timer normally fires first: a seat that is
      // neither here nor held has run out of time
      const connected = getActivePlayerSlots(room);
      const held = getReservedSlots(room);
      const gone = ([0, 1] as const).find((slot) => !connected.has(slot) && !held.has(slot));
      if (gone !== undefined) {
        room.leftSlots.add(gone);
        closeFriendRoom(room, { leaver: gone, reason: 'timeout' });
        continue;
      }
    }
    if (isRoomAbandoned(room.connections.length, room.reservedSlots, now)) {
      // Everyone left and nobody came back within the reconnect window
      deleteRoom(room);
      console.log(`[Room ${code}] Deleted (reconnect window expired)`);
      continue;
    }
    if (now - room.lastActivity > ROOM_IDLE_TIMEOUT_MS) {
      for (const conn of room.connections) {
        send(conn.ws, { type: 'ERROR', message: 'Room expired due to inactivity' });
        conn.ws.close();
      }
      deleteRoom(room);
      console.log(`[Room ${code}] Expired (1h inactivity)`);
    }
  }
}, 60 * 1000);

// --- Start Server ---

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// --- Static File Serving ---

const STATIC_DIR = resolve(process.env['STATIC_DIR'] ?? join(import.meta.dirname ?? '.', '../../dist'));


function serveStaticFile(res: import('node:http').ServerResponse, filePath: string): boolean {
  try {
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      return false;
    }
    const ext = extname(filePath).toLowerCase();
    const contentType = contentTypeFor(ext);
    const content = readFileSync(filePath);

    // Cache hashed assets (contain content hash in filename) for 1 year
    const isHashedAsset = filePath.includes('/assets/') || filePath.includes('\\assets\\');
    res.setHeader('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
    res.setHeader('Content-Type', contentType);
    res.statusCode = 200;
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

function handleCastApi(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): boolean {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (!requestUrl.pathname.startsWith('/api/cast/')) {
    return false;
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/cast/public-room') {
    const codeRaw = requestUrl.searchParams.get('code') ?? '';
    const code = codeRaw.trim();
    const tokenRaw = requestUrl.searchParams.get('token') ?? '';
    const token = tokenRaw.trim();
    const result = resolveCastPublicRoom(rooms, code, token);
    res.statusCode = result.status;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(result.body));
    return true;
  }

  if (req.method === 'GET' && requestUrl.pathname === '/api/cast/stream-room') {
    const codeRaw = requestUrl.searchParams.get('code') ?? '';
    const tokenRaw = requestUrl.searchParams.get('token') ?? '';
    const access = validateCastRoomAccess(rooms, codeRaw, tokenRaw);
    if (!access.ok) {
      res.statusCode = access.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(access.body));
      return true;
    }

    const room = access.room;
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.write(': connected\n\n');
    addCastRoomStream(room.code, res);
    writeSseEvent(res, 'room', toCastPublicRoomPayload(room));

    const heartbeat = setInterval(() => {
      if (res.writableEnded) return;
      res.write(': keepalive\n\n');
    }, 20_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      removeCastRoomStream(room.code, res);
    };
    req.on('close', cleanup);
    return true;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Not found' }));
  return true;
}

function handleConfigApi(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse): boolean {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (requestUrl.pathname !== '/api/config') {
    return false;
  }

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return true;
  }

  res.statusCode = 200;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({
    castAppId: (process.env['VITE_CAST_APP_ID'] ?? '').trim() || null,
    turnstileSiteKey: getTurnstileSiteKey(),
    passwordAuth: isPasswordAuthReady(),
    passwordMinLength: PASSWORD_MIN_LENGTH,
  }));
  return true;
}

const server = createServer((req, res) => {
  // API routes
  if ((req.url ?? '').startsWith('/api/')) {
    if (handleCastApi(req, res)) {
      return;
    }
    if (handleConfigApi(req, res)) {
      return;
    }
    void handleStatsApi(req, res).then((handledStats) => {
      if (handledStats) {
        return true;
      }
      return handleAuthApi(req, res);
    }).then((handledAuth) => {
      if (handledAuth) {
        return;
      }
      if (res.headersSent) {
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Not found' }));
    }).catch((error: unknown) => {
      if (res.headersSent) {
        console.error('[HTTP] API error after response sent:', (error as Error).message);
        return;
      }
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Internal server error' }));
      console.error('[HTTP] API error:', (error as Error).message);
    });
    return;
  }

  // Static file serving
  const urlPath = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname;
  let decodedPath = urlPath;
  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    // Keep original path if decoding fails.
  }
  const safePath = decodedPath.replace(/\.\./g, ''); // prevent directory traversal

  // Try exact file match
  const filePath = join(STATIC_DIR, safePath);
  if (serveStaticFile(res, filePath)) return;

  // SPA fallback: serve index.html for all non-file routes
  const indexPath = join(STATIC_DIR, 'index.html');
  if (serveStaticFile(res, indexPath)) return;

  res.statusCode = 404;
  res.end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

server.on('upgrade', (req, socket, head) => {
  if (!(req.url ?? '').startsWith('/ws')) {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

function dispatchClientMessage(ws: WebSocket, msg: ClientMessage, identity: SessionIdentity): void {
  switch (msg.type) {
    case 'CREATE_ROOM':
      handleCreateRoom(ws, msg.mode, msg.aiDifficulty ?? 'medium', msg.kind === 'friend' ? 'friend' : 'cast');
      break;
    case 'JOIN_ROOM':
      handleJoinRoom(ws, msg.code, msg.reconnectToken, identity, msg.localProfileId);
      break;
    case 'GAME_ACTION':
      handleGameAction(ws, msg.action);
      break;
    case 'REQUEST_REMATCH':
      handleRematchRequest(ws);
      break;
    case 'LEAVE_ROOM':
      handleLeaveRoom(ws);
      break;
  }
}

// Heartbeat: a phone that dropped off Wi-Fi or went to sleep can leave a
// socket that looks open forever. Ping every 30 s; one that didn't answer the
// last ping is terminated, and the normal close path holds its seat.
const HEARTBEAT_MS = 30_000;
const awaitingPong = new WeakSet<WebSocket>();
setInterval(() => {
  for (const client of wss.clients) {
    if (awaitingPong.has(client)) {
      client.terminate();
      continue;
    }
    awaitingPong.add(client);
    try { client.ping(); } catch { /* closing anyway */ }
  }
}, HEARTBEAT_MS);

wss.on('connection', (ws: WebSocket, req: import('node:http').IncomingMessage) => {
  // Without an 'error' listener, one bad client frame (oversized, malformed,
  // invalid UTF-8) is an unhandled 'error' event and crashes the whole server,
  // ending every game. Log it; ws then closes just this socket and the normal
  // 'close' handler reserves the player's seat.
  ws.on('error', (err: Error & { code?: string }) => {
    console.warn(`[WS] Client socket error (${err.code ?? 'unknown'}): ${err.message}`);
  });
  ws.on('pong', () => awaitingPong.delete(ws));
  // Who this socket is (friend games show the name; stats need the profile):
  // the session cookie rides on the same-origin upgrade. Every message and the
  // close chain off this one promise, so they still run in arrival order; a
  // failed lookup just means "guest".
  const identityReady = resolveSessionIdentity(req.headers.cookie, getSession).catch(() => GUEST_IDENTITY);
  ws.on('message', (data: Buffer | string) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch (e) {
      send(ws, { type: 'ERROR', message: 'Invalid message' });
      console.error('[WS] Parse error:', (e as Error).message);
      return;
    }
    void identityReady.then((identity) => {
      try {
        dispatchClientMessage(ws, msg, identity);
      } catch (e) {
        send(ws, { type: 'ERROR', message: 'Invalid message' });
        console.error('[WS] Message error:', (e as Error).message);
      }
    });
  });

  ws.on('close', () => {
    void identityReady.then(() => handleDisconnect(ws));
  });
});

logMissingAuthConfig();

server.listen(PORT, () => {
  console.log(`Jambo Cast Server running on http://localhost:${PORT} (ws path: /ws)`);
});
