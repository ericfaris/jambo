import {
  JAMBO_CAST_NAMESPACE,
  type CastSessionController,
  type CastSessionSummary,
  type ReceiverToSenderMessage,
  type SenderToReceiverMessage,
} from './contracts.ts';

const CAST_SENDER_SDK_URL = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';

function isReceiverMessage(value: unknown): value is ReceiverToSenderMessage {
  if (!value || typeof value !== 'object') return false;
  const maybeType = (value as { type?: unknown }).type;
  return typeof maybeType === 'string' && maybeType.startsWith('RECEIVER_');
}

export class WebCastSessionController implements CastSessionController {
  private readonly appId: string;
  private sessionListeners = new Set<(session: CastSessionSummary | null) => void>();
  private messageListeners = new Set<(message: ReceiverToSenderMessage) => void>();
  private sdkInitPromise: Promise<void> | null = null;
  private sdkInitialized = false;
  private sessionEventListener: ((event: unknown) => void) | null = null;
  private currentSessionMessageListener: ((namespace: string, message: string) => void) | null = null;
  private messageListenerSession:
    | {
        removeMessageListener: (
          namespace: string,
          listener: (namespace: string, message: string) => void
        ) => void;
      }
    | null = null;

  constructor(appId: string) {
    this.appId = appId;
  }

  getSession(): CastSessionSummary | null {
    const context = this.getCastContext();
    if (!context) return null;
    const session = context.getCurrentSession();
    if (!session) return null;
    return this.toSessionSummary('connected');
  }

  // Android Chrome's device picker only lists devices already confirmed to run
  // this receiver app id, and that check starts at setOptions(). Loading the SDK
  // on the tap itself opens the picker before any device is confirmed (and can
  // outlive the tap's user activation), so callers warm it up ahead of time.
  prepare(): Promise<void> {
    return this.ensureSdkReady();
  }

  async requestSession(): Promise<CastSessionSummary> {
    await this.ensureSdkReady();
    const context = this.getCastContext();
    if (!context) {
      throw new Error('Google Cast SDK is not available in this browser context.');
    }

    await context.requestSession();
    const summary = this.toSessionSummary('connected');
    if (!summary) {
      throw new Error('Cast session was not created.');
    }
    this.emitSession(summary);
    return summary;
  }

  async endSession(): Promise<void> {
    const context = this.getCastContext();
    if (!context) return;
    context.endCurrentSession(true);
    this.emitSession(null);
  }

  async sendMessage(message: SenderToReceiverMessage): Promise<void> {
    const context = this.getCastContext();
    const session = context?.getCurrentSession();
    if (!session) {
      throw new Error('No active Cast session.');
    }
    await session.sendMessage(JAMBO_CAST_NAMESPACE, JSON.stringify(message));
  }

  onMessage(listener: (message: ReceiverToSenderMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onSessionChanged(listener: (session: CastSessionSummary | null) => void): () => void {
    this.sessionListeners.add(listener);
    return () => {
      this.sessionListeners.delete(listener);
    };
  }

  private emitSession(session: CastSessionSummary | null): void {
    for (const listener of this.sessionListeners) {
      listener(session);
    }
  }

  private emitReceiverMessage(message: ReceiverToSenderMessage): void {
    for (const listener of this.messageListeners) {
      listener(message);
    }
  }

  private getCastContext():
    | {
        requestSession: () => Promise<void>;
        endCurrentSession: (stopCasting: boolean) => void;
        getCurrentSession: () => {
          getSessionId: () => string;
          getCastDevice: () => { friendlyName: string; deviceId: string };
          sendMessage: (namespace: string, message: string) => Promise<void>;
          addMessageListener: (
            namespace: string,
            listener: (namespace: string, message: string) => void
          ) => void;
          removeMessageListener: (
            namespace: string,
            listener: (namespace: string, message: string) => void
          ) => void;
        } | null;
        addEventListener: (eventType: string, listener: (event: unknown) => void) => void;
      }
    | null {
    const framework = window.cast?.framework;
    if (!framework) return null;
    return framework.CastContext.getInstance();
  }

  private async ensureSdkReady(): Promise<void> {
    if (this.sdkInitialized) return;
    if (!this.sdkInitPromise) {
      // A failed load (offline, blocked script) may be retried on a later call
      this.sdkInitPromise = this.loadAndInitializeSdk().catch((error: unknown) => {
        this.sdkInitPromise = null;
        throw error;
      });
    }
    await this.sdkInitPromise;
  }

  private async loadAndInitializeSdk(): Promise<void> {
    await this.loadSenderSdkScript();
    const framework = window.cast?.framework;
    const castContext = framework?.CastContext.getInstance();
    const autoJoinPolicy = window.chrome?.cast?.AutoJoinPolicy?.ORIGIN_SCOPED;
    if (!framework || !castContext || !autoJoinPolicy) {
      throw new Error('Google Cast SDK loaded, but cast context APIs are unavailable.');
    }

    castContext.setOptions({
      receiverApplicationId: this.appId,
      autoJoinPolicy,
    });
    this.registerSessionStateListener();
    this.sdkInitialized = true;
    this.emitSession(this.toSessionSummary('connected'));
  }

  private loadSenderSdkScript(): Promise<void> {
    if (window.cast?.framework) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${CAST_SENDER_SDK_URL}"]`);
      if (existing) {
        const previousHandler = window.__onGCastApiAvailable;
        window.__onGCastApiAvailable = (isAvailable: boolean) => {
          previousHandler?.(isAvailable);
          if (isAvailable) {
            resolve();
          } else {
            reject(new Error('Google Cast SDK is unavailable on this device/browser.'));
          }
        };
        return;
      }

      const previousHandler = window.__onGCastApiAvailable;
      window.__onGCastApiAvailable = (isAvailable: boolean) => {
        previousHandler?.(isAvailable);
        if (isAvailable) {
          resolve();
          return;
        }
        reject(new Error('Google Cast SDK is unavailable on this device/browser.'));
      };

      const script = document.createElement('script');
      script.src = CAST_SENDER_SDK_URL;
      script.async = true;
      script.onerror = () => reject(new Error('Failed to load Google Cast sender SDK script.'));
      document.head.appendChild(script);
    });
  }

  private registerSessionStateListener(): void {
    const framework = window.cast?.framework;
    const castContext = framework?.CastContext.getInstance();
    const sessionStateEventType = framework?.CastContextEventType?.SESSION_STATE_CHANGED;
    if (!castContext || !sessionStateEventType) return;

    // Remove any previously registered listener (e.g. from dev HMR re-init).
    if (this.sessionEventListener) {
      castContext.removeEventListener(sessionStateEventType, this.sessionEventListener);
    }

    this.sessionEventListener = (event: unknown) => {
      const sessionState = (event as { sessionState?: string } | null)?.sessionState ?? '';
      if (sessionState === 'SESSION_STARTING') {
        this.emitSession(this.toSessionSummary('connecting'));
        return;
      }
      if (sessionState === 'SESSION_RESUMING') {
        this.emitSession(this.toSessionSummary('reconnecting'));
        return;
      }
      if (sessionState === 'SESSION_STARTED' || sessionState === 'SESSION_RESUMED') {
        this.attachSessionMessageListener();
        this.emitSession(this.toSessionSummary('connected'));
        return;
      }
      if (sessionState === 'SESSION_START_FAILED' || sessionState === 'SESSION_RESUME_FAILED') {
        this.emitSession(this.toSessionSummary('failed'));
        return;
      }
      if (sessionState === 'SESSION_ENDED') {
        this.detachSessionMessageListener();
        this.emitSession(null);
      }
    };

    castContext.addEventListener(sessionStateEventType, this.sessionEventListener);
    this.attachSessionMessageListener();
  }

  private attachSessionMessageListener(): void {
    const session = this.getCastContext()?.getCurrentSession();
    if (!session) return;

    if (this.currentSessionMessageListener && this.messageListenerSession === session) {
      return;
    }

    if (this.currentSessionMessageListener && this.messageListenerSession) {
      this.messageListenerSession.removeMessageListener(JAMBO_CAST_NAMESPACE, this.currentSessionMessageListener);
    }

    this.currentSessionMessageListener = (_namespace: string, payload: string) => {
      try {
        // CAF SDK may auto-parse JSON, so payload could be an object or a string.
        const parsed = (typeof payload === 'object' && payload !== null)
          ? payload as unknown
          : JSON.parse(payload) as unknown;
        if (isReceiverMessage(parsed)) {
          this.emitReceiverMessage(parsed);
        }
      } catch {
        // Ignore malformed payloads from receiver channel.
      }
    };
    session.addMessageListener(JAMBO_CAST_NAMESPACE, this.currentSessionMessageListener);
    this.messageListenerSession = session;
  }

  private detachSessionMessageListener(): void {
    if (this.messageListenerSession && this.currentSessionMessageListener) {
      this.messageListenerSession.removeMessageListener(JAMBO_CAST_NAMESPACE, this.currentSessionMessageListener);
    }
    this.messageListenerSession = null;
    this.currentSessionMessageListener = null;
  }

  private toSessionSummary(state: CastSessionSummary['state']): CastSessionSummary | null {
    const session = this.getCastContext()?.getCurrentSession();
    if (!session) return null;
    const device = session.getCastDevice();
    return {
      sessionId: session.getSessionId(),
      state,
      device: {
        deviceId: device.deviceId,
        friendlyName: device.friendlyName,
      },
    };
  }
}
