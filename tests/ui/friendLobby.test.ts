import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FriendLobbyView } from '../../src/ui/FriendLobby.tsx';
import { lobbyView } from '../../src/ui/friendLobbyLogic.ts';
import type { LobbyInput, LobbyView } from '../../src/ui/friendLobbyLogic.ts';
import type { OnlineSeatView } from '../../src/multiplayer/types.ts';

const noop = () => {};
const LINK = 'https://jambo.example/#/play/4821';

function render(view: LobbyView, over: Partial<{ mode: 'host' | 'join'; canShare: boolean; signedIn: boolean; inviteLink: string | null }> = {}) {
  return renderToStaticMarkup(createElement(FriendLobbyView, {
    view, mode: 'host', inviteLink: LINK, canShare: false, signedIn: false, onCancel: noop, onExit: noop, ...over,
  }));
}

const seat = (status: OnlineSeatView['status']): OnlineSeatView => ({ name: 'Sam', avatarUrl: null, signedIn: false, status, graceMsLeft: null });

describe('lobbyView', () => {
  const base: LobbyInput = { mode: 'host', connected: true, roomCode: null, playerSlot: null, error: null, seats: null, inviteCode: null };

  it('walks the host from connecting to creating to waiting with the code', () => {
    expect(lobbyView({ ...base, connected: false })).toEqual({ kind: 'connecting' });
    expect(lobbyView(base)).toEqual({ kind: 'creating' });
    expect(lobbyView({ ...base, roomCode: '4821', playerSlot: 0 })).toEqual({ kind: 'waiting', code: '4821', friendLeft: false });
  });

  it('a friend following the link is "joining" that room until seated', () => {
    expect(lobbyView({ ...base, mode: 'join', inviteCode: '4821' })).toEqual({ kind: 'joining', code: '4821' });
    expect(lobbyView({ ...base, mode: 'join', inviteCode: '4821', roomCode: '4821', playerSlot: 1 }).kind).toBe('waiting');
  });

  it('notices the friend leaving the lobby', () => {
    expect(lobbyView({ ...base, roomCode: '4821', playerSlot: 0, seats: [seat('connected'), seat('left')] }))
      .toMatchObject({ kind: 'waiting', friendLeft: true });
  });

  it('says an expired or full invite kindly', () => {
    expect(lobbyView({ ...base, mode: 'join', error: 'Room not found' })).toMatchObject({ kind: 'error', title: 'This invite has expired' });
    expect(lobbyView({ ...base, mode: 'join', error: 'Room is full (2 players max)' })).toMatchObject({ kind: 'error', title: 'This game is already full' });
    expect(lobbyView({ ...base, error: 'Something odd' })).toMatchObject({ kind: 'error', body: 'Something odd' });
  });

  it('once seated, a stray server error does not knock you out of the lobby', () => {
    expect(lobbyView({ ...base, roomCode: '4821', playerSlot: 0, error: 'Not in an active game' }).kind).toBe('waiting');
  });
});

describe('FriendLobbyView', () => {
  const waiting: LobbyView = { kind: 'waiting', code: '4821', friendLeft: false };

  it('host: the code, the invite link and Copy — and nothing about a TV', () => {
    const html = render(waiting);
    expect(html).toContain('Invite a friend');
    for (const d of '4821') expect(html).toContain(`<span class="friend-lobby-digit">${d}</span>`);
    expect(html).toContain(`value="${LINK}"`);
    expect(html).toContain('Copy link');
    expect(html).toContain('Waiting for your friend');
    expect(html).toContain('Cancel');
    expect(html).not.toMatch(/\bTV\b|Cast/);
  });

  it('Share only where the browser can share', () => {
    expect(render(waiting)).not.toContain('Share');
    expect(render(waiting, { canShare: true })).toContain('Share…');
  });

  it('guests are told signing in keeps their record; signed-in players are not', () => {
    expect(render(waiting)).toContain('sign in to keep your record');
    expect(render(waiting, { signedIn: true })).not.toContain('sign in');
  });

  it('the invited friend waits without seeing an invite of their own', () => {
    const html = render(waiting, { mode: 'join' });
    expect(html).toContain('Room 4821');
    expect(html).not.toContain('Copy link');
  });

  it('errors have a way home', () => {
    const html = render({ kind: 'error', title: 'This invite has expired', body: 'The game may have ended, or the host closed it.' }, { mode: 'join' });
    expect(html).toContain('This invite has expired');
    expect(html).toContain('Back to menu');
    expect(html).not.toContain('Cancel');
  });

  it('never puts anything but the room code in the link it shows', () => {
    const html = render(waiting);
    expect(html).not.toMatch(/token|reconnect/i);
  });
});
