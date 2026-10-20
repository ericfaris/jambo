import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import './MainMenu.css';
import './Landing.css';
import { fetchUserStatsSummary } from '../../persistence/userStatsApi.ts';
import type { UserStatsSummary } from '../../persistence/userStatsApi.ts';
import type { AuthSession } from '../useAuthSession.ts';
import type { AIDifficulty } from '../../ai/difficulties/index.ts';
import { traderFor } from '../../ai/traders.ts';
import { TraderPortrait } from '../TraderPortrait.tsx';
import { CardFace } from '../CardFace.tsx';
import { AvatarImage } from '../AvatarImage.tsx';
import { AmbientLayer } from '../life.tsx';
import { ConfirmButton } from '../ConfirmButton.tsx';
import { usePreferences } from '../preferences.ts';
import { DEMO_SALE, FAN_CARDS, FAN_DEMO_INDEX, LANDING_PITCH, TRADER_ORDER, playerRecord, readLastTrader, statsLine, writeLastTrader } from './landing.ts';
import { BookIcon, FriendIcon, GearIcon, JoinIcon, PassPlayIcon, SoundIcon, TvIcon } from './landingIcons.tsx';

interface MainMenuProps {
  onSelectOption: (option: 'login' | 'settings') => void;
  /** Start a solo game against this trader, right away. */
  onPlayTrader: (difficulty: AIDifficulty) => void;
  /** Two players taking turns on this device. */
  onPassAndPlay: () => void;
  /** Play someone on another device: make a room and send them a link. */
  onPlayFriend: () => void;
  /** Host a Chromecast game — only offered when Cast is configured. */
  onPlayOnTv?: () => void;
  /** Go to the phone's join-a-room screen. */
  onJoinTv: () => void;
  onTutorial?: () => void;
  auth: AuthSession;
  /** Set when an unfinished local game is saved — shows "Resume game". */
  resumeLabel?: string | null;
  onResume?: () => void;
  /** Throw the saved game away (asks first). */
  onAbandon?: () => void;
  /** A modal sits on top: hold the hero's motion still. */
  dimmed?: boolean;
}


export function MainMenu({
  onSelectOption, onPlayTrader, onPassAndPlay, onPlayFriend, onPlayOnTv, onJoinTv, onTutorial,
  auth, resumeLabel, onResume, onAbandon, dimmed = false,
}: MainMenuProps) {
  const [statsSummary, setStatsSummary] = useState<UserStatsSummary | null>(null);
  const [trader, setTrader] = useState<AIDifficulty>(() => readLastTrader());
  const [hovered, setHovered] = useState<AIDifficulty | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const { prefs, setPref } = usePreferences();

  // State is set once the request settles, never synchronously
  const refreshStats = useCallback(() => fetchUserStatsSummary().then(setStatsSummary, (error: unknown) => {
    // a visitor doesn't need to hear the stats service is down
    console.warn('[Menu] Stats unavailable', error);
  }), []);

  useEffect(() => {
    void refreshStats();
    const onFocus = () => { void refreshStats(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshStats]);

  const chooseTrader = (d: AIDifficulty) => {
    setTrader(d);
    writeLastTrader(d);
  };

  const hasSave = !!(resumeLabel && onResume);
  const chosen = traderFor(trader);
  const stats = statsLine(statsSummary);
  const record = playerRecord(statsSummary);
  const firstName = auth.authUser?.name?.split(' ')[0] ?? null;

  const playLabel = `Play vs ${chosen.name}`;
  const startOver = (start: () => void, label: ReactNode, className: string, style?: CSSProperties) => (hasSave
    ? (
      <ConfirmButton
        className={className}
        style={style}
        label={label}
        question="Start a new game? Your saved game will be abandoned."
        confirmLabel="Start new"
        cancelLabel="Keep it"
        onConfirm={start}
      />
    )
    : <button type="button" className={className} style={style} onClick={start}>{label}</button>);
  // The modes hang as market signs; --i staggers their drop-in and sway
  const signStyle = (i: number) => ({ '--i': i } as CSSProperties);

  return (
    <div className={`landing${dimmed ? ' landing-dimmed' : ''}`}>
      <AmbientLayer />
      <AccountChip
        auth={auth}
        firstName={firstName}
        open={accountOpen}
        onToggle={() => {
          if (!auth.authUser) onSelectOption('login');
          else setAccountOpen((o) => !o);
        }}
        onManage={() => {
          setAccountOpen(false);
          onSelectOption('login');
        }}
        onSignOut={async () => {
          setAccountOpen(false);
          await auth.logout();
          await refreshStats();
        }}
      />

      <div className="landing-shell">
        {/* ---- Hero: the market, the wordmark, real cards on the table ---- */}
        <section className="landing-hero" aria-label="Jambo">
          <div className="landing-art">
            <picture>
              <source media="(max-width: 899px)" srcSet="/assets/menu/landing_hero_mobile.webp" type="image/webp" />
              <img src="/assets/menu/landing_hero.webp" alt="" draggable={false} />
            </picture>
            <div className="landing-art-shade" />
            <div className="landing-wordmark">
              <span className="landing-eyebrow">A trading game for two</span>
              <h1 className="landing-title">Jambo</h1>
            </div>
            <div className="landing-stall" aria-hidden="true">
              <div className="landing-demo">
                {Array.from({ length: DEMO_SALE.count }, (_, i) => (
                  <img key={i} className="landing-demo-ware" src={`/assets/tokens/${DEMO_SALE.ware}.png`} alt="" style={{ '--i': i } as CSSProperties} />
                ))}
                <span className="landing-demo-gold">+{DEMO_SALE.gold}g</span>
              </div>
              <span className="landing-demo-caption">Sell {DEMO_SALE.count} {DEMO_SALE.ware} · {DEMO_SALE.gold} gold</span>
            </div>
          </div>
          <div className="landing-fan" aria-hidden="true">
            {FAN_CARDS.map((id, i) => (
              <div
                key={id}
                className={`landing-fan-card${i === FAN_DEMO_INDEX ? ' landing-fan-card-demo' : ''}`}
                style={{ '--i': i, '--fan-rot': `${(i - 2) * 7}deg`, '--fan-lift': `${Math.abs(i - 2) * 9}px` } as CSSProperties}
              >
                <div className="landing-fan-inner">
                  <CardFace cardId={id} small />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---- Panel: pitch, the one gold button, traders, other modes ---- */}
        <section className="landing-panel" aria-label="Play">
          <p className="landing-pitch">{LANDING_PITCH}</p>
          {(firstName || record) && (
            <div className="landing-greeting">
              {firstName && <p className="landing-welcome">Welcome back, {firstName}.</p>}
              {record && (
                <div className="landing-record" title={stats ?? undefined} aria-label={`Your record: ${record.wins} won, ${record.losses} lost, ${record.pct}% over ${record.games}`}>
                  <span className="landing-record-label">Your record</span>
                  <span className="landing-record-tally">
                    <b>{record.wins}</b> won <span aria-hidden="true">·</span> <b>{record.losses}</b> lost
                  </span>
                  <span className="landing-record-bar" aria-hidden="true">
                    <span className="landing-record-fill" style={{ '--pct': `${record.pct}%` } as CSSProperties} />
                  </span>
                  <span className="landing-record-rate">{record.pct}% won · {record.games}</span>
                </div>
              )}
            </div>
          )}

          <div className="landing-primary">
            {hasSave ? (
              <>
                <button type="button" className="landing-cta" onClick={onResume}>
                  <span>Resume game</span>
                  <span className="landing-cta-sub">{resumeLabel}</span>
                </button>
                {onAbandon && (
                  <ConfirmButton
                    className="landing-link landing-link-danger"
                    label="Abandon saved game"
                    question="Abandon your saved game? It can't be resumed."
                    confirmLabel="Abandon"
                    cancelLabel="Keep it"
                    onConfirm={onAbandon}
                  />
                )}
              </>
            ) : (
              <button type="button" className="landing-cta" onClick={() => onPlayTrader(trader)}>
                <span>{playLabel}</span>
                <span className="landing-cta-sub">{chosen.title} · {chosen.tagline}</span>
              </button>
            )}
          </div>

          <div className="landing-traders" role="radiogroup" aria-label="Choose your opponent">
            {TRADER_ORDER.map((d) => {
              const t = traderFor(d);
              const selected = d === trader;
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`landing-trader${selected ? ' landing-trader-selected' : ''}`}
                  onClick={() => chooseTrader(d)}
                  onMouseEnter={() => setHovered(d)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(d)}
                  onBlur={() => setHovered(null)}
                  title={`${t.name} — ${t.tagline}`}
                >
                  <TraderPortrait trader={t} size={56} mood={selected || hovered === d ? 'pleased' : 'neutral'} />
                  <span className="landing-trader-name">{t.name}</span>
                  <span className="landing-trader-level">{d}</span>
                </button>
              );
            })}
          </div>
          {hasSave && startOver(() => onPlayTrader(trader), `New game vs ${chosen.name}`, 'landing-secondary landing-secondary-wide')}

          <div className="landing-modes landing-signs">
            {startOver(onPassAndPlay, <SignFace icon={<PassPlayIcon />} label="Pass & play" hint="Share this screen" />, 'landing-sign', signStyle(0))}
            {/* Never behind the save confirm: a friend game doesn't touch the local save */}
            <button type="button" className="landing-sign" style={signStyle(1)} onClick={onPlayFriend}>
              <SignFace icon={<FriendIcon />} label="Play a friend" hint="Send an invite link" />
            </button>
            {onPlayOnTv && (
              <button type="button" className="landing-sign" style={signStyle(2)} onClick={onPlayOnTv}>
                <SignFace icon={<TvIcon />} label="Play on TV" hint="Cast the table" />
              </button>
            )}
            <button type="button" className="landing-sign" style={signStyle(3)} onClick={onJoinTv}>
              <SignFace icon={<JoinIcon />} label="Join a TV game" hint="Use your phone" />
            </button>
          </div>

          <nav className="landing-footer" aria-label="More">
            {onTutorial && (
              <button type="button" className="landing-iconbtn" data-tip="How to play" aria-label="How to play" onClick={onTutorial}>
                <BookIcon />
              </button>
            )}
            <button type="button" className="landing-iconbtn" data-tip="Settings" aria-label="Settings" onClick={() => onSelectOption('settings')}>
              <GearIcon />
            </button>
            <button
              type="button"
              className="landing-iconbtn"
              data-tip={prefs.muted ? 'Sound off' : 'Sound on'}
              aria-label="Sound"
              aria-pressed={!prefs.muted}
              onClick={() => setPref('muted', !prefs.muted)}
            >
              <SoundIcon muted={prefs.muted} />
            </button>
          </nav>
          {auth.authError && <div className="menu-error">{auth.authError}</div>}
        </section>
      </div>
    </div>
  );
}

/** A hanging market sign: the board sways on its ropes; the button around it drops in and presses. */
function SignFace({ icon, label, hint }: { icon: ReactNode; label: string; hint: string }) {
  return (
    <span className="landing-sign-board">
      <span className="landing-sign-icon">{icon}</span>
      <span className="landing-sign-text">
        <span className="landing-sign-label">{label}</span>
        <span className="landing-sign-hint">{hint}</span>
      </span>
    </span>
  );
}

/** Top-right: the one place to sign in or out. */
function AccountChip({ auth, firstName, open, onToggle, onManage, onSignOut }: {
  auth: AuthSession;
  firstName: string | null;
  open: boolean;
  onToggle: () => void;
  onManage: () => void;
  onSignOut: () => void | Promise<void>;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open, onToggle]);

  return (
    <div className="landing-account" ref={ref}>
      <button
        type="button"
        className="landing-account-btn"
        onClick={onToggle}
        disabled={auth.isLoading}
        aria-expanded={auth.authUser ? open : undefined}
        title={auth.authUser ? 'Account' : 'Sign in to keep your record'}
      >
        <span className="landing-account-avatar">
          <AvatarImage avatarUrl={auth.avatarUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </span>
        <span className="landing-account-label">{auth.isLoading ? '…' : firstName ?? 'Sign in'}</span>
      </button>
      {open && auth.authUser && (
        <div className="landing-account-menu" role="menu">
          <div className="landing-account-name">{auth.authUser.name}</div>
          {!auth.authUser.emailVerified && (
            <div className="landing-account-warn">Confirm your email to keep this account</div>
          )}
          <button type="button" role="menuitem" className="landing-link" onClick={onManage}>Account</button>
          <button type="button" role="menuitem" className="landing-link" onClick={() => void onSignOut()}>Sign out</button>
        </div>
      )}
    </div>
  );
}
