import { describe, it, expect } from 'vitest';
import {
  parseSessionCookie, displayName, safeAvatarUrl, resolveSessionIdentity, seatProfileId,
  GUEST_NAME, MAX_DISPLAY_NAME_LENGTH,
} from '../../src/multiplayer/onlineIdentity.ts';
import type { SessionLookupResult } from '../../src/multiplayer/onlineIdentity.ts';

const session = (user: Partial<SessionLookupResult['user']> & { email?: string }): SessionLookupResult =>
  ({ user: { name: 'sam_trader', picture: 'https://lh3.example.com/a.png', localProfileId: null, ...user } });

describe('parseSessionCookie', () => {
  it('finds jambo_session among several cookies', () => {
    expect(parseSessionCookie('theme=dark; jambo_session=abc123; other=1')).toBe('abc123');
  });
  it('decodes an encoded value', () => {
    expect(parseSessionCookie('jambo_session=a%2Bb%3D')).toBe('a+b=');
  });
  it('is null when missing or empty', () => {
    expect(parseSessionCookie(undefined)).toBeNull();
    expect(parseSessionCookie('')).toBeNull();
    expect(parseSessionCookie('other=1')).toBeNull();
    expect(parseSessionCookie('jambo_session=')).toBeNull();
  });
  it('does not match a cookie whose name merely contains it', () => {
    expect(parseSessionCookie('xjambo_session=nope')).toBeNull();
  });
});

describe('displayName', () => {
  it('uses the whole account name (the username), not just a first word', () => {
    expect(displayName('sam_trader')).toBe('sam_trader');
    expect(displayName('Amara Okafor')).toBe('Amara Okafor');
  });
  it('tidies whitespace and control characters', () => {
    expect(displayName('  Sam \n\t Lee ')).toBe('Sam Lee');
    expect(displayName('Sam\u0000‮Lee')).toBe('SamLee');
  });
  it('caps long names with an ellipsis', () => {
    const long = 'Bartholomew Montgomery-Fitzgerald';
    const shown = displayName(long);
    expect(Array.from(shown).length).toBe(MAX_DISPLAY_NAME_LENGTH);
    expect(shown.endsWith('…')).toBe(true);
    expect(displayName('x'.repeat(MAX_DISPLAY_NAME_LENGTH))).toBe('x'.repeat(MAX_DISPLAY_NAME_LENGTH));
  });
  it('falls back to Guest', () => {
    expect(displayName('')).toBe(GUEST_NAME);
    expect(displayName('   ')).toBe(GUEST_NAME);
    expect(displayName(null)).toBe(GUEST_NAME);
    expect(displayName(undefined)).toBe(GUEST_NAME);
  });
});

describe('safeAvatarUrl', () => {
  it('keeps https only', () => {
    expect(safeAvatarUrl('https://lh3.example.com/a.png')).toBe('https://lh3.example.com/a.png');
    expect(safeAvatarUrl('http://lh3.example.com/a.png')).toBeNull();
    expect(safeAvatarUrl('javascript:alert(1)')).toBeNull();
    expect(safeAvatarUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(safeAvatarUrl('not a url')).toBeNull();
    expect(safeAvatarUrl(42)).toBeNull();
  });
});

describe('resolveSessionIdentity', () => {
  it('is a guest without a cookie, with an unknown session, or when the lookup throws', async () => {
    const never = async () => { throw new Error('should not be called'); };
    expect((await resolveSessionIdentity(undefined, never)).signedIn).toBe(false);
    expect((await resolveSessionIdentity('jambo_session=x', async () => null)).name).toBe(GUEST_NAME);
    const thrown = await resolveSessionIdentity('jambo_session=x', async () => { throw new Error('mongo down'); });
    expect(thrown).toMatchObject({ signedIn: false, name: GUEST_NAME, avatarUrl: null, profileFor: null });
  });

  it('takes the display name and https avatar from the session', async () => {
    const id = await resolveSessionIdentity('jambo_session=s1', async (sid) => (sid === 's1' ? session({ picture: 'http://insecure/a.png' }) : null));
    expect(id).toMatchObject({ signedIn: true, name: 'sam_trader', avatarUrl: null });
  });

  it('never carries the email (or any other account field) in what it returns', async () => {
    const id = await resolveSessionIdentity('jambo_session=s1', async () => session({ email: 'sam@example.com' }));
    expect(JSON.stringify(id)).not.toContain('sam@example.com');
    expect(Object.keys(id).sort()).toEqual(['avatarUrl', 'name', 'profileFor', 'signedIn']);
  });
});

describe('seatProfileId — the same canonical id the stats API resolves', () => {
  it('guests are never recorded', async () => {
    const guest = await resolveSessionIdentity(undefined, async () => null);
    expect(seatProfileId(guest, 'device-1')).toBeNull();
  });
  it("prefers the account's linked profile", async () => {
    const id = await resolveSessionIdentity('jambo_session=s', async () => session({ localProfileId: 'linked-9' }));
    expect(seatProfileId(id, 'device-1')).toBe('linked-9');
    expect(seatProfileId(id, undefined)).toBe('linked-9');
  });
  it("otherwise uses this device's profile, validated", async () => {
    const id = await resolveSessionIdentity('jambo_session=s', async () => session({ localProfileId: null }));
    expect(seatProfileId(id, 'device-1')).toBe('device-1');
    expect(seatProfileId(id, 'bad id!')).toBeNull();
    expect(seatProfileId(id, 12)).toBeNull();
  });
});
