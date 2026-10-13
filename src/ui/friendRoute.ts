// ============================================================================
// Play a friend — the invite link and its route. The link is just the room
// code: `<origin><path>#/play/4821`. No reconnect token or other secret ever
// goes in it (tokens stay in this tab's sessionStorage).
// ============================================================================

const INVITE_HASH = /^#\/play\/(\d{4})\/?$/;

/** The room code an invite link names, or null (`#/play` alone is Cast code entry). */
export function parseInviteHash(hash: string): string | null {
  return INVITE_HASH.exec(hash)?.[1] ?? null;
}

export function inviteHash(code: string): string {
  return `#/play/${code}`;
}

type Place = Pick<Location, 'origin' | 'pathname'>;

export function inviteUrl(location: Place, code: string): string {
  return `${location.origin}${location.pathname}${inviteHash(code)}`;
}

/** The landing page, with no hash (leaving a game navigates here). */
export function homeUrl(location: Place): string {
  return `${location.origin}${location.pathname}`;
}

export function inviteShareData(url: string): { title: string; text: string; url: string } {
  return { title: 'Jambo', text: 'Play Jambo with me', url };
}

/** A server error about joining, said kindly — or null if it isn't one. */
export function friendlyJoinError(message: string | null | undefined): { title: string; body: string } | null {
  if (!message) return null;
  if (message === 'Room not found') {
    return { title: 'This invite has expired', body: 'The game may have ended, or the host closed it.' };
  }
  if (message.startsWith('Room is full')) {
    return { title: 'This game is already full', body: 'Two traders are already at this table. Ask your friend for a new invite.' };
  }
  if (message.startsWith('The server is busy')) {
    return { title: 'Too many games right now', body: message };
  }
  return null;
}
