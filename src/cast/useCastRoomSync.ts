import { useEffect, useMemo, useRef, useState } from 'react';
import type { PlayerSlot, RoomMode } from '../multiplayer/types.ts';
import { getCastSessionController, isCastSdkEnabled } from './factory.ts';
import type { ReceiverToSenderMessage } from './contracts.ts';

const CAST_SYNC_RETRY_MS = 3000;

const DISABLED_STATE: CastRoomSyncState = { status: 'disabled', error: null, syncedRoomCode: null };

export interface CastRoomSyncState {
  status: 'disabled' | 'idle' | 'syncing' | 'synced' | 'error';
  error: string | null;
  syncedRoomCode: string | null;
}

interface CastRoomSyncOptions {
  roomCode: string | null;
  roomMode: RoomMode | null;
  senderPlayerSlot: PlayerSlot | null;
  castAccessToken: string | null;
}

// Detect if we're running inside a CAF receiver (Chromecast).
// The receiver should never try to sync room to itself.
function isCastReceiverContext(): boolean {
  try {
    return !!(window as any).cast?.framework?.CastReceiverContext;
  } catch {
    return false;
  }
}

export function useCastRoomSync({
  roomCode,
  roomMode,
  senderPlayerSlot,
  castAccessToken,
}: CastRoomSyncOptions): CastRoomSyncState {
  const enabled = isCastSdkEnabled() && !isCastReceiverContext();
  const [state, setState] = useState<CastRoomSyncState>({
    status: enabled ? 'idle' : 'disabled',
    error: null,
    syncedRoomCode: null,
  });
  const syncAttemptRef = useRef(0);
  const lastRequestedKeyRef = useRef<string | null>(null);
  const confirmedSyncKeyRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);

  const syncKey = useMemo(() => {
    if (!roomCode || !roomMode) return null;
    return `${roomCode}:${roomMode}:${senderPlayerSlot ?? 'tv'}:${castAccessToken ?? 'no-token'}`;
  }, [roomCode, roomMode, senderPlayerSlot, castAccessToken]);

  useEffect(() => {
    if (!enabled) return;

    const controller = getCastSessionController();
    let retryTimer: number | null = null;

    const stopRetryLoop = () => {
      if (retryTimer !== null) {
        window.clearInterval(retryTimer);
        retryTimer = null;
      }
    };

    const startRetryLoop = () => {
      if (retryTimer !== null) return;
      retryTimer = window.setInterval(() => {
        void trySync(true);
      }, CAST_SYNC_RETRY_MS);
    };

    const onReceiverMessage = (message: ReceiverToSenderMessage) => {
      if (message.type === 'RECEIVER_ROOM_SYNCED') {
        if (!roomCode || message.roomCode !== roomCode) {
          return;
        }
        confirmedSyncKeyRef.current = syncKey;
        lastRequestedKeyRef.current = syncKey;
        stopRetryLoop();
        setState({
          status: 'synced',
          error: null,
          syncedRoomCode: message.roomCode,
        });
        return;
      }
      if (message.type === 'RECEIVER_ERROR') {
        setState({
          status: 'error',
          error: message.message,
          syncedRoomCode: null,
        });
      }
    };

    const unsubscribeMessages = controller.onMessage(onReceiverMessage);

    const trySync = async (force = false): Promise<void> => {
      if (!syncKey || !roomCode || !roomMode) {
        stopRetryLoop();
        setState((previous) => ({
          ...previous,
          status: 'idle',
          error: null,
        }));
        return;
      }

      if (confirmedSyncKeyRef.current === syncKey) {
        stopRetryLoop();
        setState((previous) => ({
          ...previous,
          status: 'synced',
          error: null,
          syncedRoomCode: roomCode,
        }));
        return;
      }

      if (!controller.getSession()) {
        stopRetryLoop();
        setState((previous) => ({
          ...previous,
          status: 'idle',
          error: null,
        }));
        return;
      }

      if (syncInFlightRef.current) {
        return;
      }

      if (!force && lastRequestedKeyRef.current === syncKey) {
        return;
      }

      const attempt = syncAttemptRef.current + 1;
      syncAttemptRef.current = attempt;
      lastRequestedKeyRef.current = syncKey;
      setState((previous) => ({ ...previous, status: 'syncing', error: null }));
      syncInFlightRef.current = true;

      try {
        await controller.sendMessage({
          type: 'SYNC_ROOM',
          roomCode,
          roomMode,
          senderPlayerSlot,
          apiBaseUrl: window.location.origin,
          castAccessToken: castAccessToken ?? undefined,
        });
      } catch (error) {
        if (syncAttemptRef.current !== attempt) return;
        lastRequestedKeyRef.current = null;
        setState({
          status: 'error',
          error: error instanceof Error ? error.message : 'Failed to sync room to receiver.',
          syncedRoomCode: null,
        });
      } finally {
        syncInFlightRef.current = false;
      }
    };

    const unsubscribeSession = controller.onSessionChanged((session) => {
      const nextSessionId = session?.sessionId ?? null;
      if (activeSessionIdRef.current !== nextSessionId) {
        activeSessionIdRef.current = nextSessionId;
        lastRequestedKeyRef.current = null;
        confirmedSyncKeyRef.current = null;
        syncInFlightRef.current = false;
      }
      if (!session) {
        stopRetryLoop();
        setState((previous) => ({
          ...previous,
          status: 'idle',
          error: null,
        }));
        return;
      }
      if (syncKey && confirmedSyncKeyRef.current !== syncKey) {
        startRetryLoop();
      }
      void trySync(true);
    });

    const initialSessionId = controller.getSession()?.sessionId ?? null;
    if (activeSessionIdRef.current !== initialSessionId) {
      activeSessionIdRef.current = initialSessionId;
      lastRequestedKeyRef.current = null;
      confirmedSyncKeyRef.current = null;
    }

    // No room yet: trySync below settles the status to idle
    if (syncKey && confirmedSyncKeyRef.current !== syncKey) {
      startRetryLoop();
    }

    void trySync(true);
    return () => {
      stopRetryLoop();
      unsubscribeMessages();
      unsubscribeSession();
    };
  }, [enabled, roomCode, roomMode, senderPlayerSlot, syncKey, castAccessToken]);

  return enabled ? state : DISABLED_STATE;
}
