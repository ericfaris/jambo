// ============================================================================
// Landing page line icons. Hand-drawn feel: round caps and joins, one stroke
// weight, colour from currentColor (burnt into the signs, brass in the footer).
// Each icon names its moving parts with a class so Landing.css can animate
// them (the gear turns, the speaker's waves pulse, the plane takes off).
// ============================================================================

import type { ReactNode } from 'react';

function Svg({ size = 22, className, children }: { size?: number; className?: string; children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Pass & play: two traders sharing one table. */
export function PassPlayIcon() {
  return (
    <Svg className="landing-icon landing-icon-pass">
      <circle cx="8" cy="7.5" r="2.6" />
      <path d="M3.5 18.5c0-3 2-5 4.5-5s4.5 2 4.5 5" />
      <circle className="landing-icon-pass-other" cx="16.5" cy="9" r="2.3" />
      <path className="landing-icon-pass-other" d="M13.8 18.5c.3-2.4 1.6-4 3.4-4 2 0 3.3 1.7 3.3 4" />
    </Svg>
  );
}

/** Play a friend: an invite sent by paper plane. */
export function FriendIcon() {
  return (
    <Svg className="landing-icon landing-icon-friend">
      <g className="landing-icon-plane">
        <path d="M21 3.5L3.5 10.8l6.3 2.4 2.4 6.3z" />
        <path d="M21 3.5L9.8 13.2" />
      </g>
    </Svg>
  );
}

/** Play on TV: a screen with a cast signal in its corner. */
export function TvIcon() {
  return (
    <Svg className="landing-icon landing-icon-tv">
      <rect x="2.8" y="4.5" width="18.4" height="12.5" rx="2" />
      <path d="M8.5 20.5h7" />
      <g className="landing-icon-cast">
        <path d="M5.8 14.2a1.4 1.4 0 0 1 1.4 1.4" />
        <path d="M5.8 11.4a4.2 4.2 0 0 1 4.2 4.2" />
      </g>
    </Svg>
  );
}

/** Join a TV game: your phone joining the table. */
export function JoinIcon() {
  return (
    <Svg className="landing-icon landing-icon-join">
      <rect x="7" y="2.8" width="10" height="18.4" rx="2.2" />
      <path d="M11 18.2h2" />
      <path className="landing-icon-join-arrow" d="M12 6.8v6M9.6 10.6L12 13l2.4-2.4" />
    </Svg>
  );
}

/** How to play: an open ledger. */
export function BookIcon() {
  return (
    <Svg size={20} className="landing-icon landing-icon-book">
      <path d="M12 6.5C10 5 7 4.6 3.5 5v13c3.5-.4 6.5 0 8.5 1.5" />
      <path className="landing-icon-book-page" d="M12 6.5C14 5 17 4.6 20.5 5v13c-3.5-.4-6.5 0-8.5 1.5z" />
      <path d="M12 6.5v13" />
    </Svg>
  );
}

/** Settings: a brass gear. */
export function GearIcon() {
  return (
    <Svg size={20} className="landing-icon landing-icon-gear">
      <g className="landing-icon-gear-wheel">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
        <circle cx="12" cy="12" r="6.6" />
      </g>
    </Svg>
  );
}

/** Sound: a speaker, its waves on or crossed out. */
export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <Svg size={20} className={`landing-icon landing-icon-sound${muted ? ' is-muted' : ''}`}>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      {muted
        ? <path className="landing-icon-sound-x" d="M16 9.5l5 5M21 9.5l-5 5" />
        : (
          <>
            <path className="landing-icon-wave landing-icon-wave-1" d="M15.5 9a4 4 0 0 1 0 6" />
            <path className="landing-icon-wave landing-icon-wave-2" d="M18 6.5a7.5 7.5 0 0 1 0 11" />
          </>
        )}
    </Svg>
  );
}
