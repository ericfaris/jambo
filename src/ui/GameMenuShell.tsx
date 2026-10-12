// ============================================================================
// In-game profile & settings menu — the avatar button in the corner and the
// popover it opens: who you are, game actions, the shared SettingsPanel, and
// small tools. Used by GameScreen (solo/hotseat) and PlayerScreen (Cast).
// ============================================================================

import type { ReactNode } from 'react';
import './SettingsPanel.css';
import { AvatarImage } from './AvatarImage.tsx';
import type { AuthUserProfile } from './useAuthSession.ts';

export function GameMenuShell({ open, onToggle, avatarUrl, authUser, authError, onLogout, stats, levels, actions, tools, children }: {
  open: boolean;
  onToggle: () => void;
  avatarUrl: string | null;
  authUser: AuthUserProfile | null;
  authError?: string | null;
  onLogout: () => void;
  /** One line of record, e.g. "12-8 · 60% win · 20 games". */
  stats?: ReactNode;
  /** Per-difficulty levels. */
  levels?: ReactNode;
  /** Game actions (main menu, how to play, abandon). */
  actions?: ReactNode;
  /** Small utilities shown under the settings (replay import/export…). */
  tools?: ReactNode;
  /** The SettingsPanel. */
  children: ReactNode;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Profile & Settings"
        title="Profile & Settings"
        style={{
          width: 42,
          height: 42,
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: open ? 'rgba(212,168,80,0.15)' : 'rgba(20,10,5,0.85)',
          border: open ? '1px solid var(--gold)' : '1px solid rgba(122,90,62,0.5)',
          borderRadius: '50%',
          overflow: 'hidden',
          boxShadow: open ? '0 0 0 3px rgba(212,168,80,0.2)' : undefined,
        }}
      >
        <AvatarImage avatarUrl={avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </button>

      {open && (
        <div className="game-menu dialog-pop" role="dialog" aria-label="Profile & Settings">
          <div className="game-menu-profile">
            <div className="game-menu-avatar">
              <AvatarImage avatarUrl={avatarUrl} />
            </div>
            <div className="game-menu-who">
              <span className="game-menu-name">{authUser ? authUser.name : 'Trader'}</span>
              {stats ? <span className="game-menu-meta">{stats}</span> : authUser && <span className="game-menu-meta">{authUser.email}</span>}
              {levels && <span className="game-menu-levels">{levels}</span>}
              {authError && <span className="game-menu-error">{authError}</span>}
            </div>
            {authUser && (
              <button type="button" className="game-menu-logout" onClick={onLogout}>
                Log out
              </button>
            )}
          </div>

          {actions && <div className="game-menu-actions">{actions}</div>}

          {children}

          {tools && <div className="game-menu-tools">{tools}</div>}

          <div className="game-menu-version">Jambo v{__APP_VERSION__}</div>
        </div>
      )}
    </>
  );
}
