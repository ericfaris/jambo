import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebCastSessionController } from '../../src/cast/webSender.ts';
import { NoopCastSessionController } from '../../src/cast/contracts.ts';

// Fake just enough of window/document for the sender SDK loader: appending the
// <script> "loads" the SDK by installing window.cast and calling the callback.
interface FakeSdk {
  setOptions: ReturnType<typeof vi.fn>;
  requestSession: ReturnType<typeof vi.fn>;
  scriptsAppended: number;
  failNextLoad: boolean;
}

function installFakeBrowser(): FakeSdk {
  const sdk: FakeSdk = {
    setOptions: vi.fn(),
    requestSession: vi.fn(async () => {}),
    scriptsAppended: 0,
    failNextLoad: false,
  };
  const context = {
    setOptions: sdk.setOptions,
    requestSession: sdk.requestSession,
    endCurrentSession: vi.fn(),
    getCurrentSession: () => ({
      getSessionId: () => 'session-1',
      getCastDevice: () => ({ friendlyName: 'Living Room TV', deviceId: 'tv-1' }),
      sendMessage: vi.fn(async () => {}),
      addMessageListener: vi.fn(),
      removeMessageListener: vi.fn(),
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const win: Record<string, unknown> = {};
  const doc = {
    querySelector: () => null,
    createElement: () => ({} as { onerror?: () => void }),
    head: {
      appendChild: (script: { onerror?: () => void }) => {
        sdk.scriptsAppended += 1;
        if (sdk.failNextLoad) {
          sdk.failNextLoad = false;
          script.onerror?.();
          return;
        }
        win['cast'] = {
          framework: {
            CastContext: { getInstance: () => context },
            CastContextEventType: { SESSION_STATE_CHANGED: 'sessionstatechanged' },
          },
        };
        win['chrome'] = { cast: { AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' } } };
        (win['__onGCastApiAvailable'] as (ok: boolean) => void)(true);
      },
    },
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  return sdk;
}

describe('Cast sender warm-up (TV missing from the Android picker)', () => {
  let sdk: FakeSdk;
  beforeEach(() => { sdk = installFakeBrowser(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('prepare() registers the app id without opening the device picker', async () => {
    const controller = new WebCastSessionController('4E18430D');
    await controller.prepare();
    expect(sdk.setOptions).toHaveBeenCalledWith({ receiverApplicationId: '4E18430D', autoJoinPolicy: 'origin_scoped' });
    expect(sdk.requestSession).not.toHaveBeenCalled();
  });

  it('requestSession() after prepare() reuses the warm SDK', async () => {
    const controller = new WebCastSessionController('4E18430D');
    await controller.prepare();
    await controller.prepare();
    const session = await controller.requestSession();
    expect(sdk.scriptsAppended).toBe(1);
    expect(sdk.setOptions).toHaveBeenCalledTimes(1);
    expect(sdk.requestSession).toHaveBeenCalledTimes(1);
    expect(session.device.friendlyName).toBe('Living Room TV');
  });

  it('a failed SDK load can be retried instead of failing forever', async () => {
    sdk.failNextLoad = true;
    const controller = new WebCastSessionController('4E18430D');
    await expect(controller.prepare()).rejects.toThrow(/Failed to load/);
    await controller.prepare();
    expect(sdk.scriptsAppended).toBe(2);
    expect(sdk.setOptions).toHaveBeenCalledTimes(1);
  });

  it('the no-op controller prepares without error', async () => {
    await expect(new NoopCastSessionController().prepare()).resolves.toBeUndefined();
  });
});
