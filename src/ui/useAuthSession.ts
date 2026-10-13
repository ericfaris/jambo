import { useState, useCallback, useEffect } from 'react';
import { authApi } from './auth/authApi.ts';
import type { AuthUserProfile } from './auth/authApi.ts';

export type { AuthUserProfile };

interface AuthSessionResponse {
  authenticated: boolean;
  user?: AuthUserProfile;
}

export interface AuthSession {
  authUser: AuthUserProfile | null;
  avatarUrl: string | null;
  avatarLabel: string;
  isLoading: boolean;
  authError: string | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAuthSession(): AuthSession {
  const [authUser, setAuthUser] = useState<AuthUserProfile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarLabel, setAvatarLabel] = useState('U');
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load auth session');
      }

      const data = (await response.json()) as AuthSessionResponse;
      if (!data.authenticated || !data.user) {
        setAuthUser(null);
        setAvatarUrl(null);
        setAvatarLabel('U');
        setAuthError(null);
        return;
      }

      setAuthUser(data.user);
      setAvatarUrl(data.user.picture || null);
      const firstChar = data.user.name.trim().charAt(0).toUpperCase();
      setAvatarLabel(firstChar || 'U');
      setAuthError(null);
    } catch {
      setAuthUser(null);
      setAuthError('Profile unavailable');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const result = await authApi.logout();
      if (!result.ok) {
        throw new Error('Logout failed');
      }
      setAuthUser(null);
      setAvatarUrl(null);
      setAvatarLabel('U');
      setAuthError(null);
    } catch {
      setAuthError('Sign out failed');
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-fetch on window focus
  useEffect(() => {
    const onFocus = () => {
      void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return { authUser, avatarUrl, avatarLabel, isLoading, authError, logout, refresh };
}
