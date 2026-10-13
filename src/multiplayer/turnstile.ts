// ============================================================================
// Cloudflare Turnstile verification for sign-up and password-reset requests.
// Without TURNSTILE_SECRET_KEY outside production the check is skipped (dev);
// in production the auth API refuses those requests until it's configured.
// ============================================================================

import type { FetchLike } from './passwords.ts';

export function isTurnstileConfigured(): boolean {
  return Boolean(process.env['TURNSTILE_SECRET_KEY'] && process.env['TURNSTILE_SITE_KEY']);
}

export function getTurnstileSiteKey(): string | null {
  return (process.env['TURNSTILE_SITE_KEY'] ?? '').trim() || null;
}

export async function verifyTurnstile(token: unknown, remoteIp: string | null, fetchImpl: FetchLike): Promise<boolean> {
  const secret = process.env['TURNSTILE_SECRET_KEY'] ?? '';
  if (!secret) return true;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return false;

  const form = new URLSearchParams({ secret, response: token });
  if (remoteIp) form.set('remoteip', remoteIp);
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.warn('[auth] Turnstile verification failed:', (error as Error).message);
    return false;
  }
}
