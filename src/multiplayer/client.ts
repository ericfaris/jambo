// ============================================================================
// Cast Mode — Client WebSocket Hook
// Manages WebSocket connection, sends/receives messages, reconnects.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ClientMessage,
  ServerMessage,
  PublicGameState,
  PrivateGameState,
  RoomMode,
  RoomKind,
  ConnectionRole,
  PlayerSlot,
  AudioEvent,
  OnlineSeatView,
} from './types.ts';
import type { GameAction } from '../engine/types.ts';
import type { AIDifficulty } from '../ai/difficulties/index.ts';
import type { GameStory } from '../ui/gameStory.ts';
import { getLocalProfileId } from '../persistence/localProfile.ts';
import { parseInviteHash } from '../ui/friendRoute.ts';

export type SeatViews = [OnlineSeatView | null, OnlineSeatView | null];
export interface AbandonNotice { leaver: PlayerSlot; reason: 'left' | 'timeout' }

export interface WebSocketGameState {
  connected: boolean;
  roomCode: string | null;
  castAccessToken: string | null;
  playerSlot: PlayerSlot | null;
  roomMode: RoomMode | null;
  /** 'friend' rooms render the full online board; 'cast' the phone controller. */
  roomKind: RoomKind | null;
  /** Friend rooms: who sits where, and whether they're here. */
  seats: SeatViews | null;
  /** When `seats` arrived — graceMsLeft counts down from here. */
  seatsReceivedAt: number | null;
  /** Friend rooms: the game ended because a player left or never came back. */
  abandoned: AbandonNotice | null;
  /** Friend rooms: the finished game's story, from the server. */
  story: GameStory | null;
  /** Friend rooms: which game of this room is on the table (rematches count up). */
  gameNumber: number | null;
  publicState: PublicGameState | null;
  privateState: PrivateGameState | null;
  audioEvent: AudioEvent | null;
  aiMessage: string | null;
  error: string | null;
  gameOver: boolean;
  playerJoined: PlayerSlot | null;
  playerDisconnected: PlayerSlot | null;
  rematchVotes: PlayerSlot[];
  rematchRequired: PlayerSlot[];
  createRoom: (mode: RoomMode, aiDifficulty?: AIDifficulty, kind?: RoomKind) => void;
  joinRoom: (code: string, role: ConnectionRole) => void;
  /** Leave for good (friend lobby Cancel, Leave game, Main menu after the game). */
  leaveRoom: () => Promise<void>;
  resetRoomState: () => void;
  sendAction: (action: GameAction) => void;
  requestRematch: () => void;
  clearError: () => void;
  clearAudioEvent: () => void;
}

/** The room this tab last joined, so a refresh can rejoin it (per tab). */
export const LAST_ROOM_STORAGE_KEY = 'jambo:lastRoom';

export interface LastRoom { code: string; role: ConnectionRole }

export function readLastRoom(): LastRoom | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_ROOM_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastRoom>;
    return typeof parsed.code === 'string' && parsed.role === 'player' ? { code: parsed.code, role: parsed.role } : null;
  } catch {
    return null;
  }
}

function writeLastRoom(room: LastRoom | null): void {
  try {
    if (room) window.sessionStorage.setItem(LAST_ROOM_STORAGE_KEY, JSON.stringify(room));
    else window.sessionStorage.removeItem(LAST_ROOM_STORAGE_KEY);
  } catch { /* storage unavailable — rejoin is best-effort */ }
}

/** Forget the remembered room, e.g. before deliberately leaving to the menu. */
export function forgetLastRoom(): void {
  writeLastRoom(null);
}

export function useWebSocketGame(): WebSocketGameState {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);

  const [connected, setConnected] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [castAccessToken, setCastAccessToken] = useState<string | null>(null);
  const [playerSlot, setPlayerSlot] = useState<PlayerSlot | null>(null);
  const [roomMode, setRoomMode] = useState<RoomMode | null>(null);
  const [roomKind, setRoomKind] = useState<RoomKind | null>(null);
  const [seats, setSeats] = useState<SeatViews | null>(null);
  const [seatsReceivedAt, setSeatsReceivedAt] = useState<number | null>(null);
  const [abandoned, setAbandoned] = useState<AbandonNotice | null>(null);
  const [story, setStory] = useState<GameStory | null>(null);
  const [gameNumber, setGameNumber] = useState<number | null>(null);
  // After GAME_ABANDONED the room is gone; the next "Room not found" is expected
  const suppressRoomNotFound = useRef(false);
  const [publicState, setPublicState] = useState<PublicGameState | null>(null);
  const [privateState, setPrivateState] = useState<PrivateGameState | null>(null);
  const [audioEvent, setAudioEvent] = useState<AudioEvent | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [playerJoined, setPlayerJoined] = useState<PlayerSlot | null>(null);
  const [playerDisconnected, setPlayerDisconnected] = useState<PlayerSlot | null>(null);
  const [rematchVotes, setRematchVotes] = useState<PlayerSlot[]>([]);
  const [rematchRequired, setRematchRequired] = useState<PlayerSlot[]>([]);

  // Pending join info for reconnection
  const pendingJoin = useRef<{ code: string; role: ConnectionRole; reconnectToken?: string } | null>(null);

  const getReconnectStorageKey = useCallback((code: string, role: ConnectionRole) => {
    return `jambo:reconnect:${code}:${role}`;
  }, []);

  const getCastTokenStorageKey = useCallback((code: string) => {
    return `jambo:castToken:${code}`;
  }, []);

  const sendRaw = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  const resetRoomState = useCallback(() => {
    pendingJoin.current = null;
    setRoomCode(null);
    setCastAccessToken(null);
    setPlayerSlot(null);
    setRoomMode(null);
    setRoomKind(null);
    setSeats(null);
    setSeatsReceivedAt(null);
    setAbandoned(null);
    setStory(null);
    setGameNumber(null);
    suppressRoomNotFound.current = false;
    setPublicState(null);
    setPrivateState(null);
    setAudioEvent(null);
    setAiMessage(null);
    setError(null);
    setGameOver(false);
    setPlayerJoined(null);
    setPlayerDisconnected(null);
    setRematchVotes([]);
    setRematchRequired([]);
  }, []);

  const handleMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case 'ROOM_CREATED':
        setRoomCode((current) => current ?? msg.code);
        if (msg.castAccessToken) {
          const token = msg.castAccessToken;
          setCastAccessToken((current) => current ?? token);
          window.sessionStorage.setItem(getCastTokenStorageKey(msg.code), token);
        }
        break;
      case 'JOINED':
        setPlayerSlot(msg.playerSlot);
        setRoomMode(msg.mode);
        setRoomKind(msg.kind ?? 'cast');
        if (msg.castAccessToken) {
          setCastAccessToken(msg.castAccessToken);
        }
        if (pendingJoin.current) {
          writeLastRoom({ code: pendingJoin.current.code, role: pendingJoin.current.role });
        }
        if (pendingJoin.current && msg.reconnectToken) {
          const key = getReconnectStorageKey(pendingJoin.current.code, pendingJoin.current.role);
          window.sessionStorage.setItem(key, msg.reconnectToken);
          pendingJoin.current = {
            ...pendingJoin.current,
            reconnectToken: msg.reconnectToken,
          };
        }
        break;
      case 'GAME_STATE':
        setPublicState(msg.public);
        setPrivateState(msg.private);
        setAudioEvent(msg.audioEvent);
        setAiMessage(msg.aiMessage);
        if (msg.gameNumber !== undefined) setGameNumber(msg.gameNumber);
        if (msg.public.phase !== 'GAME_OVER') {
          setGameOver(false);
          setStory(null);
          setRematchVotes([]);
          setRematchRequired([]);
        }
        break;
      case 'ROOM_PLAYERS':
        setSeats(msg.seats);
        setSeatsReceivedAt(Date.now());
        break;
      case 'GAME_ABANDONED':
        // The room is closed: never try to rejoin it
        writeLastRoom(null);
        pendingJoin.current = null;
        suppressRoomNotFound.current = true;
        setAbandoned({ leaver: msg.leaver, reason: msg.reason });
        break;
      case 'PLAYER_JOINED':
        setPlayerJoined(msg.playerSlot);
        break;
      case 'PLAYER_DISCONNECTED':
        setPlayerDisconnected(msg.playerSlot);
        break;
      case 'ERROR':
        if (msg.message === 'Room not found' && suppressRoomNotFound.current) break;
        if (msg.message === 'Room not found' || msg.message.startsWith('Room is full')) {
          // The remembered room is gone (expired, server restarted) or our
          // seat was given up after the reconnect window — stop retrying it
          writeLastRoom(null);
          pendingJoin.current = null;
          setRoomCode(null);
        }
        setError(msg.message);
        break;
      case 'REMATCH_STATUS':
        setRematchVotes(msg.votes);
        setRematchRequired(msg.required);
        break;
      case 'GAME_OVER':
        setPublicState(msg.public);
        setGameOver(true);
        if (msg.story !== undefined) setStory(msg.story);
        break;
    }
  }, [getReconnectStorageKey]);

  const connect = useCallback(() => {
    // Determine WebSocket URL (use /ws path for Vite proxy)
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    // Only the newest socket may touch state. A replaced one (StrictMode's
    // remount, a reconnect) must not flip `connected` while wsRef points at a
    // socket still connecting — sends would be dropped and never retried.
    const isCurrent = () => wsRef.current === ws;

    ws.onopen = () => {
      if (!isCurrent()) return;
      setConnected(true);
      reconnectAttempt.current = 0;

      // After a page refresh nothing is pending yet — rejoin the room this
      // tab was in, with its stored reconnect token (keeps the same seat).
      if (!pendingJoin.current) {
        const last = readLastRoom();
        // An invite link to a different room wins: its screen joins that one
        const invited = parseInviteHash(window.location.hash);
        if (last && (!invited || invited === last.code)) {
          const reconnectToken = window.sessionStorage.getItem(getReconnectStorageKey(last.code, last.role)) ?? undefined;
          const cachedCastToken = window.sessionStorage.getItem(getCastTokenStorageKey(last.code));
          if (cachedCastToken) setCastAccessToken((current) => current ?? cachedCastToken);
          pendingJoin.current = { ...last, reconnectToken };
          setRoomCode(last.code);
        }
      }

      // Re-join room on reconnect
      if (pendingJoin.current) {
        sendRaw({
          type: 'JOIN_ROOM',
          code: pendingJoin.current.code,
          role: pendingJoin.current.role,
          reconnectToken: pendingJoin.current.reconnectToken,
          localProfileId: getLocalProfileId(),
        });
      }
    };

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
      try {
        const msg = JSON.parse(event.data as string) as ServerMessage;
        handleMessage(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      // A socket closed on purpose (unmount) or already replaced: no reconnect
      if (!isCurrent()) return;
      setConnected(false);
      wsRef.current = null;

      // Exponential backoff reconnect
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000);
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      // onclose will fire after onerror
    };
  }, [handleMessage, sendRaw]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect]);

  const createRoom = useCallback((mode: RoomMode, aiDifficulty?: AIDifficulty, kind?: RoomKind) => {
    resetRoomState();
    sendRaw(kind ? { type: 'CREATE_ROOM', mode, aiDifficulty, kind } : { type: 'CREATE_ROOM', mode, aiDifficulty });
  }, [resetRoomState, sendRaw]);

  const joinRoom = useCallback((code: string, role: ConnectionRole) => {
    const key = getReconnectStorageKey(code, role);
    const reconnectToken = window.sessionStorage.getItem(key) ?? undefined;
    // Restore castAccessToken from sessionStorage so cast sync isn't interrupted
    // during the brief window before the server sends the JOINED response.
    const cachedCastToken = window.sessionStorage.getItem(getCastTokenStorageKey(code));
    if (cachedCastToken) {
      setCastAccessToken((current) => current ?? cachedCastToken);
    }
    pendingJoin.current = { code, role, reconnectToken };
    suppressRoomNotFound.current = false;
    setRoomCode(code);
    sendRaw({ type: 'JOIN_ROOM', code, role, reconnectToken, localProfileId: getLocalProfileId() });
  }, [getReconnectStorageKey, getCastTokenStorageKey, sendRaw]);

  const leaveRoom = useCallback(async () => {
    writeLastRoom(null);
    pendingJoin.current = null;
    suppressRoomNotFound.current = true;
    sendRaw({ type: 'LEAVE_ROOM' });
    // Let the message leave before the caller navigates away; if it's lost
    // anyway, the seat's reconnect window runs out to the same end.
    const ws = wsRef.current;
    const deadline = Date.now() + 500;
    while (ws && ws.readyState === WebSocket.OPEN && ws.bufferedAmount > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }, [sendRaw]);

  const sendAction = useCallback((action: GameAction) => {
    sendRaw({ type: 'GAME_ACTION', action });
  }, [sendRaw]);

  const requestRematch = useCallback(() => {
    sendRaw({ type: 'REQUEST_REMATCH' });
  }, [sendRaw]);

  const clearError = useCallback(() => setError(null), []);
  const clearAudioEvent = useCallback(() => setAudioEvent(null), []);

  return {
    connected,
    roomCode,
    castAccessToken,
    playerSlot,
    roomMode,
    roomKind,
    seats,
    seatsReceivedAt,
    abandoned,
    story,
    gameNumber,
    publicState,
    privateState,
    audioEvent,
    aiMessage,
    error,
    gameOver,
    playerJoined,
    playerDisconnected,
    rematchVotes,
    rematchRequired,
    createRoom,
    joinRoom,
    leaveRoom,
    resetRoomState,
    sendAction,
    requestRematch,
    clearError,
    clearAudioEvent,
  };
}
