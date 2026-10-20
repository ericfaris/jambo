// ============================================================================
// React Chromecast Receiver - Cast Receiver Hook
// Manages CAF context, SYNC_ROOM messages, SSE streaming with polling fallback,
// and converts CastPublicRoomPayload into WebSocketGameState for TVScreen.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import type { WebSocketGameState } from '../../src/multiplayer/client.ts';
import type { PublicGameState, RoomMode, PlayerSlot } from '../../src/multiplayer/types.ts';
import type { GameAction } from '../../src/engine/types.ts';
import type { AIDifficulty } from '../../src/ai/difficulties/index.ts';

const NAMESPACE = 'urn:x-cast:com.jambo.game.v1';
const POLL_INTERVAL_MS = 1500;
const STREAM_RETRY_MS = 4000;
const DEBUG_OVERLAY_TOGGLE_EVENT = 'jambo:receiver-debug-overlay-toggle';

interface RoomState {
  roomCode: string | null;
  roomMode: RoomMode | null;
  senderPlayerSlot: PlayerSlot | null;
  apiBaseUrl: string | null;
  castAccessToken: string | null;
}

interface CastPublicRoomPayload {
  roomCode: string;
  roomMode: RoomMode;
  started: boolean;
  publicState: PublicGameState | null;
  updatedAtMs: number;
}

// No-op stubs - the receiver is read-only
const noopCreateRoom = (_mode: RoomMode, _aiDifficulty?: AIDifficulty) => {};
const noopJoinRoom = (_code: string) => {};
const noopResetRoomState = () => {};
const noopSendAction = (_action: GameAction) => {};
const noopRequestRematch = () => {};
const noopClearError = () => {};
const noopClearAudioEvent = () => {};

declare const cast: {
  framework: {
    CastReceiverContext: {
      getInstance(): CastReceiverContextInstance;
    };
    system?: {
      MessageType?: {
        JSON?: unknown;
      };
    };
  };
};

interface CastReceiverContextInstance {
  addCustomMessageListener(namespace: string, handler: (event: CustomMessageEvent) => void): void;
  removeCustomMessageListener(namespace: string, handler: (event: CustomMessageEvent) => void): void;
  sendCustomMessage(namespace: string, senderId: string, data: unknown): void;
  start(options?: CastReceiverOptions): void;
}

interface CastReceiverOptions {
  disableIdleTimeout?: boolean;
  maxInactivity?: number;
  customNamespaces?: Record<string, unknown>;
}

interface CustomMessageEvent {
  senderId: string;
  data: unknown;
}

export function useCastReceiver(): WebSocketGameState {
  const [publicState, setPublicState] = useState<PublicGameState | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomMode, setRoomMode] = useState<RoomMode | null>(null);
  const [castAccessToken, setCastAccessToken] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);

  const roomStateRef = useRef<RoomState>({
    roomCode: null,
    roomMode: null,
    senderPlayerSlot: null,
    apiBaseUrl: null,
    castAccessToken: null,
  });

  const pollTimerRef = useRef<number | null>(null);
  const streamSourceRef = useRef<EventSource | null>(null);
  const streamRetryTimerRef = useRef<number | null>(null);
  // The stream's retry timer restarts the stream; a ref breaks the self-reference
  const startStreamRef = useRef<() => void>(() => {});

  const clearPollTimer = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const closeStreamSource = useCallback(() => {
    if (streamSourceRef.current !== null) {
      streamSourceRef.current.close();
      streamSourceRef.current = null;
    }
  }, []);

  const clearStreamRetryTimer = useCallback(() => {
    if (streamRetryTimerRef.current !== null) {
      window.clearTimeout(streamRetryTimerRef.current);
      streamRetryTimerRef.current = null;
    }
  }, []);

  const resetReceiverState = useCallback(() => {
    setPublicState(null);
    setConnected(false);
  }, []);

  const applySnapshot = useCallback((snapshot: CastPublicRoomPayload) => {
    if (snapshot.publicState) {
      setPublicState(snapshot.publicState);
      setConnected(true);
      return;
    }
    setPublicState(null);
    setConnected(false);
  }, []);

  const pollPublicRoomState = useCallback(async () => {
    const rs = roomStateRef.current;
    if (!rs.roomCode || !rs.apiBaseUrl || !rs.castAccessToken) return;

    const endpoint = rs.apiBaseUrl.replace(/\/+$/, '') +
      '/api/cast/public-room?code=' + encodeURIComponent(rs.roomCode) +
      '&token=' + encodeURIComponent(rs.castAccessToken);

    try {
      const response = await fetch(endpoint, { method: 'GET', cache: 'no-store' });
      if (!response.ok) {
        if (response.status === 400 || response.status === 403 || response.status === 404) {
          resetReceiverState();
        }
        return;
      }
      const data = await response.json() as CastPublicRoomPayload;
      applySnapshot(data);
    } catch {
      // Polling error - silently retry next interval
    }
  }, [applySnapshot, resetReceiverState]);

  const startPolling = useCallback(() => {
    clearPollTimer();
    const rs = roomStateRef.current;
    if (!rs.roomCode || !rs.apiBaseUrl || !rs.castAccessToken) return;

    void pollPublicRoomState();
    pollTimerRef.current = window.setInterval(() => {
      void pollPublicRoomState();
    }, POLL_INTERVAL_MS);
  }, [clearPollTimer, pollPublicRoomState]);

  const startStream = useCallback(() => {
    closeStreamSource();
    clearStreamRetryTimer();
    const rs = roomStateRef.current;
    if (!rs.roomCode || !rs.apiBaseUrl || !rs.castAccessToken) return;

    const endpoint = rs.apiBaseUrl.replace(/\/+$/, '') +
      '/api/cast/stream-room?code=' + encodeURIComponent(rs.roomCode) +
      '&token=' + encodeURIComponent(rs.castAccessToken);

    try {
      const es = new EventSource(endpoint);
      streamSourceRef.current = es;

      es.addEventListener('room', (event) => {
        try {
          const data = JSON.parse((event as MessageEvent).data) as CastPublicRoomPayload;
          applySnapshot(data);
        } catch {
          // Ignore malformed SSE payloads
        }
      });

      es.addEventListener('room_deleted', () => {
        resetReceiverState();
      });

      es.onerror = () => {
        closeStreamSource();
        startPolling();
        clearStreamRetryTimer();
        streamRetryTimerRef.current = window.setTimeout(() => {
          clearPollTimer();
          startStreamRef.current();
        }, STREAM_RETRY_MS);
      };
    } catch {
      startPolling();
    }
  }, [closeStreamSource, clearStreamRetryTimer, applySnapshot, startPolling, clearPollTimer, resetReceiverState]);

  useEffect(() => {
    startStreamRef.current = startStream;
  }, [startStream]);

  const restartRealtimeSync = useCallback(() => {
    clearPollTimer();
    closeStreamSource();
    clearStreamRetryTimer();
    resetReceiverState();

    const rs = roomStateRef.current;
    if (!rs.roomCode || !rs.apiBaseUrl || !rs.castAccessToken) {
      return;
    }

    if (typeof EventSource === 'function') {
      startStream();
    } else {
      startPolling();
    }
  }, [clearPollTimer, closeStreamSource, clearStreamRetryTimer, startStream, startPolling, resetReceiverState]);

  useEffect(() => {
    let context: CastReceiverContextInstance;
    try {
      context = cast.framework.CastReceiverContext.getInstance();
    } catch {
      return;
    }

    const handleCustomMessage = (event: CustomMessageEvent) => {
      const senderId = event.senderId;
      let payload: Record<string, unknown>;

      const sendInvalidPayload = (message: string) => {
        context.sendCustomMessage(NAMESPACE, senderId, {
          type: 'RECEIVER_ERROR',
          code: 'INVALID_PAYLOAD',
          message,
        });
      };

      if (typeof event.data === 'object' && event.data !== null) {
        payload = event.data as Record<string, unknown>;
      } else {
        try {
          payload = JSON.parse(event.data as string) as Record<string, unknown>;
        } catch {
          sendInvalidPayload('Payload is not valid JSON.');
          return;
        }
      }

      if (payload.type === 'TOGGLE_DEBUG') {
        const win = window as Window & { __jamboReceiverDebugStore?: { overlayVisible?: boolean } };
        const currentlyVisible = win.__jamboReceiverDebugStore?.overlayVisible === true;
        const enabled = !currentlyVisible;
        window.dispatchEvent(new CustomEvent<{ enabled: boolean }>(DEBUG_OVERLAY_TOGGLE_EVENT, {
          detail: { enabled },
        }));
        context.sendCustomMessage(NAMESPACE, senderId, {
          type: 'RECEIVER_DEBUG_TOGGLED',
          enabled,
          timestampMs: Date.now(),
        });
        return;
      }

      if (payload.type !== 'SYNC_ROOM') {
        sendInvalidPayload(`Unknown message type: ${String(payload.type)}`);
        return;
      }

      const codeRaw = payload.roomCode;
      if (typeof codeRaw !== 'string' || !/^\d{4}$/.test(codeRaw.trim())) {
        sendInvalidPayload('Missing or invalid roomCode (expected 4 digits).');
        return;
      }

      const modeRaw = payload.roomMode;
      if (modeRaw !== 'ai' && modeRaw !== 'pvp') {
        sendInvalidPayload('Missing or invalid roomMode (expected ai or pvp).');
        return;
      }

      const senderSlotRaw = payload.senderPlayerSlot;
      if (!(senderSlotRaw === null || senderSlotRaw === undefined || senderSlotRaw === 0 || senderSlotRaw === 1)) {
        sendInvalidPayload('senderPlayerSlot must be null, 0, or 1.');
        return;
      }

      const tokenRaw = payload.castAccessToken;
      if (typeof tokenRaw !== 'string' || tokenRaw.trim().length < 8) {
        sendInvalidPayload('Missing or invalid castAccessToken.');
        return;
      }

      const apiBaseUrlRaw = payload.apiBaseUrl;
      if (!(apiBaseUrlRaw === undefined || typeof apiBaseUrlRaw === 'string')) {
        sendInvalidPayload('apiBaseUrl must be a string when provided.');
        return;
      }
      if (typeof apiBaseUrlRaw === 'string') {
        try {
          const parsed = new URL(apiBaseUrlRaw);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            sendInvalidPayload('apiBaseUrl must use http or https.');
            return;
          }
        } catch {
          sendInvalidPayload('apiBaseUrl must be a valid URL.');
          return;
        }
      }

      const code = codeRaw.trim();
      const mode = modeRaw as RoomMode;
      const token = tokenRaw.trim();
      const apiBaseUrl = (typeof apiBaseUrlRaw === 'string' ? apiBaseUrlRaw.trim() : '') || window.location.origin;

      roomStateRef.current = {
        roomCode: code,
        roomMode: mode,
        senderPlayerSlot: (senderSlotRaw ?? null) as PlayerSlot | null,
        apiBaseUrl,
        castAccessToken: token,
      };

      setRoomCode(code);
      setRoomMode(mode);
      setCastAccessToken(token);
      restartRealtimeSync();

      context.sendCustomMessage(NAMESPACE, senderId, {
        type: 'RECEIVER_ROOM_SYNCED',
        roomCode: code,
        timestampMs: Date.now(),
      });
    };

    context.addCustomMessageListener(NAMESPACE, handleCustomMessage);

    const jsonMessageType = cast.framework.system?.MessageType?.JSON ?? 'JSON';

    context.start({
      disableIdleTimeout: true,
      maxInactivity: 120,
      customNamespaces: {
        [NAMESPACE]: jsonMessageType,
      },
    });

    return () => {
      context.removeCustomMessageListener(NAMESPACE, handleCustomMessage);
      clearPollTimer();
      closeStreamSource();
      clearStreamRetryTimer();
      resetReceiverState();
    };
  }, [restartRealtimeSync, clearPollTimer, closeStreamSource, clearStreamRetryTimer, resetReceiverState]);

  return {
    connected,
    roomCode,
    castAccessToken,
    playerSlot: null,
    roomMode,
    publicState,
    privateState: null,
    audioEvent: null,
    aiMessage: null,
    error: null,
    gameOver: publicState?.phase === 'GAME_OVER',
    playerJoined: null,
    playerDisconnected: null,
    rematchVotes: [],
    rematchRequired: [],
    createRoom: noopCreateRoom,
    joinRoom: noopJoinRoom,
    resetRoomState: noopResetRoomState,
    sendAction: noopSendAction,
    requestRematch: noopRequestRematch,
    clearError: noopClearError,
    clearAudioEvent: noopClearAudioEvent,
  };
}
