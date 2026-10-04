import { useCallback, useEffect, useState } from 'react';
import './MainMenu.css';
import { fetchUserStatsSummary } from '../../persistence/userStatsApi.ts';
import type { UserStatsSummary } from '../../persistence/userStatsApi.ts';
import type { AuthSession } from '../useAuthSession.ts';

interface MainMenuProps {
  onSelectOption: (option: 'login' | 'solo' | 'multiplayer' | 'settings') => void;
  onTutorial?: () => void;
  auth: AuthSession;
  /** Set when an unfinished local game is saved — shows "Resume game". */
  resumeLabel?: string | null;
  onResume?: () => void;
}

export function MainMenu({ onSelectOption, onTutorial, auth, resumeLabel, onResume }: MainMenuProps) {
  const [statsSummary, setStatsSummary] = useState<UserStatsSummary | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      const summary = await fetchUserStatsSummary();
      setStatsSummary(summary);
      setStatsError(null);
    } catch {
      setStatsError('Stats unavailable');
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  useEffect(() => {
    const onFocus = () => {
      void refreshStats();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshStats]);

  const handleAuthAction = useCallback(async () => {
    if (auth.authUser) {
      await auth.logout();
      await refreshStats();
      return;
    }

    onSelectOption('login');
  }, [onSelectOption, auth, refreshStats]);

  const welcomeName = auth.authUser?.name ?? 'Trader';

  return (
    <div className="main-menu-root">
      <div className="main-menu-bg" />
      <div className="main-menu-content dialog-pop">
        <div className="main-menu-label">Jambo</div>
        <div className="main-menu-title">Welcome, {welcomeName}</div>
        <div className="main-menu-divider" />

        {statsSummary && (
          <div className="main-menu-stats">
            {statsSummary.wins}-{statsSummary.losses} &middot; {Math.round(statsSummary.winRate * 100)}% win rate &middot; {statsSummary.gamesPlayed} games
          </div>
        )}

        <div className="main-menu-actions">
          {resumeLabel && onResume && (
            <button className="menu-action menu-action-primary menu-action-resume" onClick={onResume}>
              Resume Game
              <span className="menu-action-sub">{resumeLabel}</span>
            </button>
          )}
          <button className={`menu-action${resumeLabel && onResume ? '' : ' menu-action-primary'}`} onClick={() => onSelectOption('solo')}>
            Play Solo
          </button>
          <button className="menu-action" onClick={() => onSelectOption('multiplayer')}>
            Multiplayer
          </button>

          <div className="menu-thin-divider" />

          {onTutorial && (
            <button className="menu-action menu-action-subtle" onClick={onTutorial}>
              How to Play
            </button>
          )}
          <button className="menu-action menu-action-subtle" onClick={() => onSelectOption('settings')}>
            Settings
          </button>
          <button
            className="menu-action menu-action-subtle"
            onClick={() => void handleAuthAction()}
            disabled={auth.isLoading}
          >
            {auth.isLoading ? 'Checking...' : auth.authUser ? 'Logout' : 'Login'}
          </button>
        </div>

        {auth.authError && <div className="menu-error">{auth.authError}</div>}
        {statsError && <div className="menu-error">{statsError}</div>}
      </div>
    </div>
  );
}
