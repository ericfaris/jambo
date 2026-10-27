import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { DeckCardId, GameLogEntry } from '../engine/types.ts';
import { getCard } from '../engine/cards/CardDatabase.ts';
import { groupLogByTurn } from './actionLog.ts';

interface ActionLogDrawerProps {
  open: boolean;
  onClose: () => void;
  log: readonly GameLogEntry[];
  labels: readonly [string, string];
  /** Seat whose hidden cards (draws, picks) stay redacted. */
  hiddenPlayer: 0 | 1 | null;
  /** The seat reading the log — its turns are styled as "yours". */
  viewer: 0 | 1;
  onMegaView?: (cardId: DeckCardId) => void;
  /** Docked as a side panel beside the board instead of a modal drawer. */
  pinned?: boolean;
  /** Shows the pin toggle (desktop only — a phone has no room to dock). */
  onTogglePin?: () => void;
  /** Each seat's small portrait (avatar or trader face), by seat; the TV has none. */
  portraits?: readonly [ReactNode, ReactNode];
}

/**
 * Slide-out action history, from the left edge on every screen size (a
 * near-full-width sheet on phones). Newest turn first; cards that were played
 * face-up are tappable to zoom.
 */
export function ActionLogDrawer({ open, onClose, log, labels, hiddenPlayer, viewer, onMegaView, pinned = false, onTogglePin, portraits }: ActionLogDrawerProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const visible = open || pinned;
  const turns = useMemo(() => (visible ? groupLogByTurn(log, labels, hiddenPlayer) : []), [visible, log, labels, hiddenPlayer]);

  useEffect(() => {
    // A pinned panel is part of the page: no focus grab, Escape doesn't close it
    if (!open || pinned) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, pinned, onClose]);

  return (
    <>
      {!pinned && <div className={`log-drawer-backdrop${open ? ' log-drawer-backdrop-open' : ''}`} onClick={onClose} aria-hidden="true" />}
      <aside
        className={pinned ? 'log-drawer log-drawer-pinned' : `log-drawer${open ? ' log-drawer-open' : ''}`}
        role={pinned ? 'complementary' : 'dialog'}
        aria-modal={pinned ? undefined : true}
        aria-label="Action log"
        aria-hidden={!visible}
      >
        <div className="log-drawer-head">
          <span className="log-drawer-title">Action Log</span>
          <div className="log-drawer-actions">
            {onTogglePin && (
              <button
                className={`log-drawer-pin${pinned ? ' log-drawer-pin-on' : ''}`}
                onClick={onTogglePin}
                aria-pressed={pinned}
                aria-label={pinned ? 'Unpin action log' : 'Pin action log beside the board'}
                title={pinned ? 'Unpin' : 'Keep the log open beside the board'}
              >
                {pinned ? 'Unpin' : 'Pin'}
              </button>
            )}
            {!pinned && <button ref={closeRef} className="log-drawer-close" onClick={onClose} aria-label="Close action log">✕</button>}
          </div>
        </div>
        <div className="log-drawer-body">
          {turns.length === 0 && <div className="log-drawer-empty">Nothing has happened yet.</div>}
          {turns.map((t) => (
            <section key={`${t.turn}-${t.lines[0]?.index ?? 0}`} className={`log-turn${t.owner === viewer ? ' log-turn-mine' : ' log-turn-theirs'}`}>
              <header className="log-turn-head">
                <span className="log-turn-who">
                  {portraits?.[t.owner] && <span className="log-avatar" aria-hidden="true">{portraits[t.owner]}</span>}
                  <span>{labels[t.owner] === 'You' ? 'Your turn' : `${labels[t.owner]}'s turn`}</span>
                </span>
                <span className="log-turn-num">Turn {t.turn + 1}</span>
              </header>
              <ol className="log-lines">
                {t.lines.map((line) => (
                  <li key={line.index} className={`log-line${line.isPlay ? ' log-line-play' : ''}${line.isTurnEnd ? ' log-line-end' : ''}`}>
                    {line.player !== t.owner && (
                      <span className="log-line-actor">
                        {portraits?.[line.player] && <span className="log-avatar log-avatar-small" aria-hidden="true">{portraits[line.player]}</span>}
                        {`${labels[line.player]}: `}
                      </span>
                    )}
                    <span>{line.text}</span>
                    {line.cardId && onMegaView && (
                      <button className="log-card-chip" onClick={() => onMegaView(line.cardId!)} aria-label={`Zoom ${cardName(line.cardId)}`}>
                        {cardName(line.cardId)}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </aside>
    </>
  );
}

function cardName(cardId: DeckCardId): string {
  try {
    return getCard(cardId).name;
  } catch {
    return cardId;
  }
}

/** Opens the drawer; shows how many opponent actions arrived since it was last opened. */
export function ActionLogButton({ onClick, unread, compact = false }: { onClick: () => void; unread: number; compact?: boolean }) {
  return (
    <button
      className={compact ? 'log-open-btn log-open-btn-compact' : 'log-open-btn'}
      onClick={onClick}
      aria-label={unread > 0 ? `Open action log, ${unread} new` : 'Open action log'}
      title="Action log"
    >
      <span aria-hidden="true">☰</span>
      {!compact && <span>Log</span>}
      {unread > 0 && <span className="log-open-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}
