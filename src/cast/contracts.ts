import type { RoomMode, PlayerSlot } from '../multiplayer/types.ts';

export const JAMBO_CAST_NAMESPACE = 'urn:x-cast:com.jambo.game.v1' as const;

export type CastConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

export interface CastDeviceInfo {
  deviceId: string;
  friendlyName: string;
}

export interface CastSessionSummary {
  sessionId: string;
  state: CastConnectionState;
  device: CastDeviceInfo | null;
}

// Sender -> Receiver control messages.
export type SenderToReceiverMessage =
  | {
      type: 'SYNC_ROOM';
      roomCode: string;
      roomMode: RoomMode;
      senderPlayerSlot: PlayerSlot | null;
      apiBaseUrl?: string;
      castAccessToken?: string;
    }
  | {
      type: 'TOGGLE_DEBUG';
    };

// Receiver -> Sender status messages.
export type ReceiverToSenderMessage =
  | {
      type: 'RECEIVER_ROOM_SYNCED';
      roomCode: string;
      timestampMs: number;
    }
  | {
      type: 'RECEIVER_ERROR';
      code: 'INVALID_PAYLOAD' | 'ROOM_NOT_FOUND' | 'INTERNAL';
      message: string;
    }
  | {
      type: 'RECEIVER_DEBUG_TOGGLED';
      enabled: boolean;
      timestampMs: number;
    };

export type CastChannelMessage = SenderToReceiverMessage | ReceiverToSenderMessage;

export interface CastSessionController {
  getSession(): CastSessionSummary | null;
  /** Load the SDK and register the app id ahead of a tap, so device discovery is warm. */
  prepare(): Promise<void>;
  requestSession(): Promise<CastSessionSummary>;
  endSession(): Promise<void>;
  sendMessage(message: SenderToReceiverMessage): Promise<void>;
  onMessage(listener: (message: ReceiverToSenderMessage) => void): () => void;
  onSessionChanged(listener: (session: CastSessionSummary | null) => void): () => void;
}

// Placeholder no-op implementation used until platform SDK adapters are wired.
export class NoopCastSessionController implements CastSessionController {
  getSession(): CastSessionSummary | null {
    return null;
  }

  async prepare(): Promise<void> {
    return;
  }

  async requestSession(): Promise<CastSessionSummary> {
    throw new Error('Cast SDK is not configured for this build.');
  }

  async endSession(): Promise<void> {
    return;
  }

  async sendMessage(_message: SenderToReceiverMessage): Promise<void> {
    void _message;
    throw new Error('Cast SDK is not configured for this build.');
  }

  onMessage(_listener: (message: ReceiverToSenderMessage) => void): () => void {
    void _listener;
    return () => {};
  }

  onSessionChanged(_listener: (session: CastSessionSummary | null) => void): () => void {
    void _listener;
    return () => {};
  }
}
