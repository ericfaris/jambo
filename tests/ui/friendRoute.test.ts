import { describe, it, expect } from 'vitest';
import { parseInviteHash, inviteHash, inviteUrl, homeUrl, inviteShareData, friendlyJoinError } from '../../src/ui/friendRoute.ts';

const place = { origin: 'https://jambo.mooseflip.com', pathname: '/' };

describe('invite route', () => {
  it('reads a 4-digit room code from #/play/<code>', () => {
    expect(parseInviteHash('#/play/4821')).toBe('4821');
    expect(parseInviteHash('#/play/4821/')).toBe('4821');
  });
  it('leaves Cast code entry (#/play) and anything else alone', () => {
    for (const hash of ['#/play', '#/play/', '', '#/play/12345', '#/play/abcd', '#/play/482', '#/play/4821?x=1', '#/tv/4821']) {
      expect(parseInviteHash(hash)).toBeNull();
    }
  });
  it('builds the link from the code alone — no token or other secret', () => {
    const url = inviteUrl(place, '4821');
    expect(url).toBe('https://jambo.mooseflip.com/#/play/4821');
    expect(parseInviteHash(new URL(url).hash)).toBe('4821');
    expect(url).not.toMatch(/token|reconnect/i);
    expect(inviteHash('0042')).toBe('#/play/0042');
  });
  it('goes home without a hash', () => {
    expect(homeUrl({ origin: 'http://localhost:5180', pathname: '/' })).toBe('http://localhost:5180/');
  });
  it('shares a friendly message with the link', () => {
    expect(inviteShareData('https://x/#/play/1234')).toEqual({ title: 'Jambo', text: 'Play Jambo with me', url: 'https://x/#/play/1234' });
  });
});

describe('friendlyJoinError', () => {
  it('explains an expired or full room', () => {
    expect(friendlyJoinError('Room not found')?.title).toBe('This invite has expired');
    expect(friendlyJoinError('Room is full or reconnect slot is reserved')?.title).toBe('This game is already full');
    expect(friendlyJoinError('The server is busy right now — please try again in a few minutes')?.body).toMatch(/busy/);
  });
  it('ignores anything that is not a join problem', () => {
    expect(friendlyJoinError(null)).toBeNull();
    expect(friendlyJoinError('Not your turn')).toBeNull();
  });
});
