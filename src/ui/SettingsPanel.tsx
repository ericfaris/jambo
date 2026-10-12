// ============================================================================
// Settings panel — the one settings UI, shown on the main menu's Settings
// screen and inside the in-game profile menus (solo, hotseat, Cast player).
// Each surface passes which groups apply to it; the controls are identical.
// ============================================================================

import { useId } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import './SettingsPanel.css';
import { ConfirmButton } from './ConfirmButton.tsx';
import { playSfx } from './useAudioEvents.ts';
import { AI_SPEEDS, AI_SPEED_LABELS } from './gameScreenLogic.ts';
import { isDevMode } from './preferences.ts';
import type { AnimationSpeed, PreferencesApi } from './preferences.ts';

export interface SettingsPanelProps extends PreferencesApi {
  /** AI pace and trader voices — only where there's an AI opponent (or one to come). */
  showAiOptions: boolean;
  /** Docking the action log — only where there's a log and room to dock it. */
  showLogPin: boolean;
  /** Tighter rows for the in-game popover; hides the explanatory hints. */
  compact?: boolean;
  /** Surface-specific sections (e.g. Cast TV tools), rendered before Developer. */
  extraSections?: ReactNode;
}

const ANIMATION_SPEED_OPTIONS: readonly { value: AnimationSpeed; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'fast', label: 'Fast' },
];
const AI_SPEED_OPTIONS = AI_SPEEDS.map((value) => ({ value, label: AI_SPEED_LABELS[value] }));

export function SettingsPanel({ prefs, setPref, resetPrefs, showAiOptions, showLogPin, compact = false, extraSections }: SettingsPanelProps) {
  const dev = isDevMode();
  return (
    <div className={`settings-panel${compact ? ' settings-panel-compact' : ''}`}>
      <SettingsSection title="Sound" icon={<SpeakerIcon muted={false} />}>
        <VolumeRow
          volume={prefs.volume}
          muted={prefs.muted}
          onVolume={(v) => setPref('volume', v)}
          onMuted={(m) => setPref('muted', m)}
        />
        {showAiOptions && (
          <SwitchRow
            label="Trader voices"
            hint="Your opponent speaks a line now and then."
            checked={prefs.traderVoices}
            onChange={(v) => setPref('traderVoices', v)}
          />
        )}
      </SettingsSection>

      <SettingsSection title="Pace" icon={<PaceIcon />}>
        <SegmentedRow
          label="Animations"
          hint="Fast trims card flights and reveals."
          value={prefs.animationSpeed}
          options={ANIMATION_SPEED_OPTIONS}
          onChange={(v) => setPref('animationSpeed', v)}
        />
        {showAiOptions && (
          <SegmentedRow
            label="AI pace"
            hint="How long the AI pauses between moves."
            value={prefs.aiSpeed}
            options={AI_SPEED_OPTIONS}
            onChange={(v) => setPref('aiSpeed', v)}
          />
        )}
      </SettingsSection>

      <SettingsSection title="Display" icon={<EyeIcon />}>
        <SwitchRow
          label="High contrast"
          hint="Brighter text and stronger edges."
          checked={prefs.highContrast}
          onChange={(v) => setPref('highContrast', v)}
        />
        <SwitchRow
          label="Ambient motion"
          hint="Lamplight flicker and drifting dust on the table."
          checked={prefs.ambientMotion}
          onChange={(v) => setPref('ambientMotion', v)}
        />
        {showLogPin && (
          <SwitchRow
            label="Dock the action log"
            hint="Keep the log open beside the board."
            checked={prefs.logPinned}
            onChange={(v) => setPref('logPinned', v)}
          />
        )}
      </SettingsSection>

      {extraSections}

      {dev && (
        <SettingsSection title="Developer" icon={<CodeIcon />}>
          <SwitchRow
            label="Telemetry overlay"
            checked={prefs.devTelemetry}
            onChange={(v) => setPref('devTelemetry', v)}
          />
          <SwitchRow
            label="UX debug counters"
            checked={prefs.uxDebug}
            onChange={(v) => setPref('uxDebug', v)}
          />
        </SettingsSection>
      )}

      <div className="settings-footer">
        <ConfirmButton
          className="settings-reset"
          label="Reset to defaults"
          question="Reset every setting to its default?"
          confirmLabel="Reset"
          cancelLabel="Keep"
          onConfirm={resetPrefs}
        />
      </div>
    </div>
  );
}

export function SettingsSection({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">
        {icon && <span className="settings-section-icon" aria-hidden="true">{icon}</span>}
        {title}
      </h3>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

function RowText({ id, label, hint }: { id?: string; label: string; hint?: string }) {
  return (
    <span className="settings-row-text">
      <span className="settings-row-label" id={id}>{label}</span>
      {hint && <span className="settings-row-hint">{hint}</span>}
    </span>
  );
}

export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="settings-row settings-row-switch"
      onClick={() => onChange(!checked)}
    >
      <RowText label={label} hint={hint} />
      <span className={`settings-switch${checked ? ' is-on' : ''}`} aria-hidden="true">
        <span className="settings-switch-thumb" />
      </span>
    </button>
  );
}

function SegmentedRow<T extends string>({ label, hint, value, options, onChange }: {
  label: string;
  hint?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (next: T) => void;
}) {
  const labelId = useId();
  return (
    <div className="settings-row settings-row-segmented">
      <RowText id={labelId} label={label} hint={hint} />
      <div className="settings-segmented" role="radiogroup" aria-labelledby={labelId}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={option.value === value}
            className={`settings-segment${option.value === value ? ' is-active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function VolumeRow({ volume, muted, onVolume, onMuted }: { volume: number; muted: boolean; onVolume: (v: number) => void; onMuted: (m: boolean) => void }) {
  const labelId = useId();
  const silent = muted || volume === 0;
  // Let the player hear the new level once they let go of the slider
  const preview = () => { if (!muted) playSfx('coin'); };
  return (
    <div className="settings-row settings-row-volume">
      <RowText id={labelId} label="Volume" />
      <div className={`settings-volume${muted ? ' is-muted' : ''}`}>
        <button
          type="button"
          className="settings-mute"
          aria-pressed={muted}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          title={muted ? 'Unmute' : 'Mute'}
          onClick={() => onMuted(!muted)}
        >
          <SpeakerIcon muted={silent} />
        </button>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={volume}
          disabled={muted}
          aria-labelledby={labelId}
          aria-valuetext={muted ? 'Muted' : `${volume}%`}
          className="settings-range"
          style={{ '--fill': `${volume}%` } as CSSProperties}
          onChange={(e) => onVolume(Number(e.target.value))}
          onPointerUp={preview}
          onKeyUp={preview}
        />
        <span className="settings-volume-value">{muted ? 'Off' : `${volume}%`}</span>
      </div>
    </div>
  );
}

// --- Small line icons (stroke follows currentColor) ------------------------

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <Icon>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {muted
        ? <path d="M16 9.5l5 5M21 9.5l-5 5" />
        : <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />}
    </Icon>
  );
}

function PaceIcon() {
  return (
    <Icon>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 13l3.5-3.5M10 2.5h4" />
    </Icon>
  );
}

function EyeIcon() {
  return (
    <Icon>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

function CodeIcon() {
  return (
    <Icon>
      <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
    </Icon>
  );
}

export function TvIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8" />
    </Icon>
  );
}
