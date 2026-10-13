interface RuntimeConfig {
  castAppId: string | null;
  /** Cloudflare Turnstile site key for sign-up / reset; null when the server has none (dev). */
  turnstileSiteKey: string | null;
  /** False when the server can't take password sign-ups (email or bot check unconfigured in production). */
  passwordAuth: boolean;
}

const runtimeConfig: RuntimeConfig = {
  castAppId: null,
  turnstileSiteKey: null,
  passwordAuth: true,
};

export async function loadRuntimeConfig(): Promise<void> {
  try {
    const response = await fetch('/api/config', {
      method: 'GET',
      credentials: 'same-origin',
    });
    if (!response.ok) return;
    const payload = (await response.json()) as { castAppId?: string | null; turnstileSiteKey?: string | null; passwordAuth?: boolean };
    const castAppId = payload.castAppId?.trim();
    runtimeConfig.castAppId = castAppId && castAppId.length > 0 ? castAppId : null;
    runtimeConfig.turnstileSiteKey = payload.turnstileSiteKey?.trim() || null;
    runtimeConfig.passwordAuth = payload.passwordAuth !== false;
  } catch {
    // Ignore runtime config errors; app can still run with build-time fallback.
  }
}

export function getRuntimeCastAppId(): string | null {
  return runtimeConfig.castAppId;
}

export function getTurnstileSiteKey(): string | null {
  return runtimeConfig.turnstileSiteKey;
}

export function isPasswordAuthAvailable(): boolean {
  return runtimeConfig.passwordAuth;
}
