// Client calls for the account API (src/multiplayer/accountApi.ts). Every
// state-changing call is same-origin JSON, which the server requires.

export interface AuthUserProfile {
  id: string;
  username: string | null;
  name: string;
  email: string | null;
  emailVerified: boolean;
  picture: string;
  localProfileId: string | null;
  hasPassword: boolean;
  hasGoogle: boolean;
  needsUsername: boolean;
  unverifiedExpiresAt: number | null;
}

export interface AuthResult {
  ok: boolean;
  status: number;
  error: string | null;
  /** Which form field the server blamed, when it did. */
  field: string | null;
  user: AuthUserProfile | null;
}

export async function postAuth(path: string, body: Record<string, unknown> = {}): Promise<AuthResult> {
  try {
    const response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string; field?: string; user?: AuthUserProfile };
    return {
      ok: response.ok,
      status: response.status,
      error: response.ok ? null : data.error ?? 'Something went wrong. Please try again.',
      field: data.field ?? null,
      user: data.user ?? null,
    };
  } catch {
    return { ok: false, status: 0, error: "Can't reach the server. Check your connection.", field: null, user: null };
  }
}

export const authApi = {
  signup: (body: { username: string; email: string; password: string; localProfileId: string; turnstileToken: string }) =>
    postAuth('/api/auth/signup', body),
  login: (body: { identifier: string; password: string; localProfileId: string }) =>
    postAuth('/api/auth/login', body),
  logout: () => postAuth('/api/auth/logout'),
  forgotPassword: (body: { email: string; turnstileToken: string }) => postAuth('/api/auth/password/forgot', body),
  resetPassword: (body: { token: string; password: string }) => postAuth('/api/auth/password/reset', body),
  changePassword: (body: { currentPassword?: string; newPassword: string }) => postAuth('/api/auth/password/change', body),
  verifyEmail: (token: string) => postAuth('/api/auth/verify-email', { token }),
  resendVerification: () => postAuth('/api/auth/verify-email/resend'),
  setUsername: (username: string) => postAuth('/api/auth/username', { username }),
};

/** Sends the browser to Google; `link` adds Google to the signed-in account instead of signing in. */
export function startGoogleAuth(localProfileId: string, link = false): void {
  const returnTo = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  const startUrl = new URL('/api/auth/google/start', window.location.origin);
  startUrl.searchParams.set('localProfileId', localProfileId);
  startUrl.searchParams.set('returnTo', returnTo);
  if (link) startUrl.searchParams.set('link', '1');
  window.location.href = startUrl.toString();
}

/** What a `?auth=` value from the Google redirect means to the player; null for a plain success. */
export function describeGoogleOutcome(status: string): { message: string; isError: boolean } | null {
  switch (status) {
    case 'success':
      return null;
    case 'google_linked':
      return { message: 'Google is now linked to your account.', isError: false };
    case 'email_in_use':
      return {
        message: 'An account with that email already exists. Sign in with your username and password, then link Google from your account.',
        isError: true,
      };
    case 'google_in_use':
      return { message: 'That Google account is already linked to a different Jambo account.', isError: true };
    case 'state_expired':
      return { message: 'Sign-in took too long. Please try again.', isError: true };
    case 'failed':
      return { message: 'Google sign-in failed. Please try again.', isError: true };
    default:
      return { message: 'Sign-in was canceled.', isError: true };
  }
}
