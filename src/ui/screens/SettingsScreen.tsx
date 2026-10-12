import { useEffect } from 'react';
import './MainMenu.css';
import { SettingsPanel } from '../SettingsPanel.tsx';
import { usePreferences } from '../preferences.ts';
import { useMediaQuery, PHONE_MEDIA_QUERY } from '../useMediaQuery.ts';

/**
 * Main menu → Settings. The same panel the in-game menu shows, so a setting
 * changed here is already in place when the game starts (and vice versa).
 */
export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const preferences = usePreferences();
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="settings-page">
      <div className="main-menu-bg" />
      <div className="settings-page-inner dialog-pop">
        <div className="settings-page-header">
          <button type="button" className="settings-back" onClick={onBack} aria-label="Back to menu">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
            Menu
          </button>
          <h1 className="settings-page-title">Settings</h1>
          <span className="settings-page-spacer" aria-hidden="true" />
        </div>
        <div className="settings-page-subtitle">Saved on this device · also in the in-game menu</div>
        <div className="settings-page-card">
          <SettingsPanel {...preferences} showAiOptions showLogPin={!isPhone} />
        </div>
        <div className="settings-page-footer">Jambo v{__APP_VERSION__}</div>
      </div>
    </div>
  );
}
