// ============================================================================
// Play a friend — the lobby. The host gets a room code and an invite link to
// send; the friend opens the link and is seated with no typing. The game
// starts as soon as both are in (the router then shows the board).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WebSocketGameState } from '../multiplayer/client.ts';
import { inviteShareData, inviteUrl } from './friendRoute.ts';
import { lobbyView } from './friendLobbyLogic.ts';
import type { LobbyMode, LobbyView } from './friendLobbyLogic.ts';
import './screens/Landing.css';
import './FriendLobby.css';

const CREATE_RETRY_MS = 4000;
const COPIED_MS = 2000;

interface FriendLobbyProps {
  ws: WebSocketGameState;
  mode: LobbyMode;
  /** Join mode: the room the invite link names. */
  inviteCode?: string | null;
  signedIn: boolean;
  /** Leave the room (if any) and go back to the landing page. */
  onExit: () => void;
}

export function FriendLobby({ ws, mode, inviteCode = null, signedIn, onExit }: FriendLobbyProps) {
  const { connected, roomCode, playerSlot, createRoom, joinRoom, leaveRoom } = ws;

  // Host: ask for a room once connected; ask again if no room came back
  // (a request can be lost to a reconnect), so the lobby never sticks.
  const createRequested = useRef(false);
  const [createRetry, setCreateRetry] = useState(0);
  useEffect(() => {
    if (mode !== 'host') return;
    if (!connected || roomCode) {
      createRequested.current = false;
      return;
    }
    if (createRequested.current) return;
    createRequested.current = true;
    createRoom('pvp', undefined, 'friend');
    const t = window.setTimeout(() => {
      createRequested.current = false;
      setCreateRetry((n) => n + 1);
    }, CREATE_RETRY_MS);
    return () => window.clearTimeout(t);
  }, [mode, connected, roomCode, createRoom, createRetry]);

  // Take a seat: the host in the room it made, the friend in the invited room
  const joinRequested = useRef<string | null>(null);
  useEffect(() => {
    if (!connected || playerSlot !== null || ws.error) return;
    const target = mode === 'host' ? roomCode : inviteCode;
    if (!target || joinRequested.current === target) return;
    // A refreshed tab is already rejoining this room with its token
    if (mode === 'join' && roomCode === target) return;
    joinRequested.current = target;
    joinRoom(target, 'player');
  }, [mode, connected, roomCode, inviteCode, playerSlot, joinRoom, ws.error]);

  const view = lobbyView({
    mode,
    connected,
    roomCode,
    playerSlot,
    error: ws.error,
    seats: ws.seats,
    inviteCode,
  });

  const cancel = useCallback(async () => {
    if (roomCode) await leaveRoom();
    onExit();
  }, [roomCode, leaveRoom, onExit]);

  const url = view.kind === 'waiting' && typeof window !== 'undefined' ? inviteUrl(window.location, view.code) : null;
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <FriendLobbyView
      view={view}
      mode={mode}
      inviteLink={url}
      canShare={canShare}
      signedIn={signedIn}
      onCancel={() => { void cancel(); }}
      onExit={onExit}
    />
  );
}

/** The lobby's look, from a plain view model (rendered on its own in tests). */
export function FriendLobbyView({ view, mode, inviteLink, canShare, signedIn, onCancel, onExit }: {
  view: LobbyView;
  mode: LobbyMode;
  inviteLink: string | null;
  canShare: boolean;
  signedIn: boolean;
  onCancel: () => void;
  onExit: () => void;
}) {
  const isHost = mode === 'host';
  return (
    <div className="landing friend-lobby">
      <main className="friend-lobby-shell">
        <section className="landing-panel friend-lobby-panel" aria-live="polite">
          <div className="friend-lobby-eyebrow">Play a friend</div>
          {view.kind === 'error' ? (
            <>
              <h1 className="friend-lobby-title">{view.title}</h1>
              <p className="friend-lobby-help">{view.body}</p>
              <button type="button" className="landing-cta friend-lobby-home" onClick={onExit}>Back to menu</button>
            </>
          ) : view.kind === 'waiting' && isHost ? (
            <>
              <h1 className="friend-lobby-title">Invite a friend</h1>
              <div className="friend-lobby-code" aria-label={`Room code ${view.code.split('').join(' ')}`}>
                {view.code.split('').map((digit, i) => <span key={i} className="friend-lobby-digit">{digit}</span>)}
              </div>
              {inviteLink && <InviteLink url={inviteLink} canShare={canShare} />}
              <p className="friend-lobby-help">Send this link to your friend. The game starts as soon as they open it.</p>
              <WaitingRow text={view.friendLeft ? 'Your friend left — the link still works' : 'Waiting for your friend'} />
              {!signedIn && <p className="friend-lobby-note">Playing as a guest — sign in to keep your record.</p>}
              <button type="button" className="landing-secondary friend-lobby-cancel" onClick={onCancel}>Cancel</button>
            </>
          ) : view.kind === 'waiting' ? (
            <>
              <h1 className="friend-lobby-title">You’re in</h1>
              <p className="friend-lobby-help">Room {view.code}</p>
              <WaitingRow text={view.friendLeft ? 'Your friend stepped away' : 'Waiting for your friend'} />
              {!signedIn && <p className="friend-lobby-note">Playing as a guest — sign in to keep your record.</p>}
              <button type="button" className="landing-secondary friend-lobby-cancel" onClick={onCancel}>Cancel</button>
            </>
          ) : (
            <>
              <h1 className="friend-lobby-title">
                {view.kind === 'joining' ? `Joining room ${view.code}` : view.kind === 'creating' ? 'Setting the table' : 'Connecting'}
              </h1>
              <WaitingRow text={view.kind === 'connecting' ? 'Reaching the server' : 'One moment'} />
              <button type="button" className="landing-secondary friend-lobby-cancel" onClick={onCancel}>Cancel</button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

function WaitingRow({ text }: { text: string }) {
  return (
    <div className="friend-lobby-waiting" role="status">
      {text}
      <span className="friend-lobby-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
    </div>
  );
}

function InviteLink({ url, canShare }: { url: string; canShare: boolean }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      return;
    } catch { /* no clipboard API, or no permission — fall back */ }
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    try {
      // Deprecated, but the only copy left on older/insecure contexts
      if (document.execCommand('copy')) setCopied(true);
    } catch { /* the link stays selected for a manual copy */ }
  };

  const share = async () => {
    try {
      await navigator.share(inviteShareData(url));
    } catch { /* dismissed */ }
  };

  return (
    <div className="friend-lobby-invite">
      <label className="friend-lobby-invite-label" htmlFor="friend-invite-link">Invite link</label>
      <div className="friend-lobby-invite-row">
        <input
          ref={inputRef}
          id="friend-invite-link"
          className="friend-lobby-link"
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="landing-cta friend-lobby-copy" onClick={() => { void copy(); }}>
          {copied ? 'Copied!' : 'Copy link'}
        </button>
      </div>
      {canShare && (
        <button type="button" className="landing-secondary friend-lobby-share" onClick={() => { void share(); }}>Share…</button>
      )}
    </div>
  );
}
