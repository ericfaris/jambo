import { describe, it, expect } from 'vitest';
import {
  checkEmailRules,
  checkPasswordRules,
  checkUsernameRules,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLength,
  suggestUsername,
} from '../../src/multiplayer/accountRules.ts';

describe('checkPasswordRules (NIST 800-63B-4 single-factor)', () => {
  it('requires 15 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(15);
    expect(checkPasswordRules('a'.repeat(3) + 'bcdefghijklm')).toBeNull(); // 15
    expect(checkPasswordRules('abcdefghijklmn')).toMatch(/at least 15/); // 14
  });

  it('imposes no composition rules — a lowercase passphrase passes', () => {
    expect(checkPasswordRules('four ripe mangoes at dawn')).toBeNull();
  });

  it('counts Unicode code points, not UTF-16 units', () => {
    // 14 emoji are 28 UTF-16 units but only 14 characters — still too short.
    const emoji = '🦒🐘🦁🐊🦜🐍🐆🦓🦏🦛🐪🦩🦚🦉';
    expect(emoji.length).toBe(28);
    expect(passwordLength(emoji)).toBe(14);
    expect(checkPasswordRules(emoji)).toMatch(/at least/);
    expect(checkPasswordRules(`${emoji}🐫`)).toBeNull();
  });

  it('normalizes (NFKC) before counting', () => {
    // "ﬁ" ligature normalizes to "fi" (2 chars).
    expect(passwordLength('ﬁ')).toBe(2);
  });

  it('caps length to bound hashing cost', () => {
    expect(checkPasswordRules('x'.repeat(PASSWORD_MAX_LENGTH) + 'y')).toMatch(/at most/);
  });

  it('rejects a single repeated character', () => {
    expect(checkPasswordRules('a'.repeat(20))).toMatch(/repeated/);
  });

  it('rejects passwords containing the username or equal to the email', () => {
    expect(checkPasswordRules('my name is TraderJoe ok', { username: 'traderjoe' })).toMatch(/username/);
    expect(checkPasswordRules('someone@example.com', { email: 'someone@example.com' })).toMatch(/email/);
    expect(checkPasswordRules('some unrelated passphrase', { username: 'trader', email: 'trader@x.io' })).toBeNull();
  });
});

describe('checkUsernameRules', () => {
  it('accepts 3–20 letters, digits and underscores', () => {
    expect(checkUsernameRules('abc')).toBeNull();
    expect(checkUsernameRules('Spice_Trader_2026')).toBeNull();
    expect(checkUsernameRules('ab')).toMatch(/3–20/);
    expect(checkUsernameRules('a'.repeat(21))).toMatch(/3–20/);
  });

  it('rejects spaces, punctuation and lookalike Unicode', () => {
    expect(checkUsernameRules('spice trader')).toMatch(/letters/);
    expect(checkUsernameRules('trader.joe')).toMatch(/letters/);
    expect(checkUsernameRules('trаder')).toMatch(/letters/); // Cyrillic а
  });

  it('reserves staff/system/AI names case-insensitively', () => {
    expect(checkUsernameRules('Admin')).toMatch(/reserved/);
    expect(checkUsernameRules('EXPERT')).toMatch(/reserved/);
    expect(checkUsernameRules('jambo')).toMatch(/reserved/);
  });

  it('blocks slurs but not innocent words that contain short fragments', () => {
    expect(checkUsernameRules('xXfuckXx')).toMatch(/allowed/);
    expect(checkUsernameRules('grapefruit')).toBeNull();
    expect(checkUsernameRules('Scunthorpe')).toMatch(/allowed/); // known false positive, accepted
  });
});

describe('suggestUsername', () => {
  it('derives a valid handle from a Google name', () => {
    expect(suggestUsername('Eric Faris')).toBe('Eric_Faris');
    expect(suggestUsername('José Ñúñez')).toBe('Jose_Nunez');
  });

  it('returns empty when nothing valid is left', () => {
    expect(suggestUsername('李')).toBe('');
    expect(suggestUsername('Admin')).toBe('');
  });
});

describe('email rules', () => {
  it('normalizes case and whitespace', () => {
    expect(normalizeEmail('  Trader@Example.COM ')).toBe('trader@example.com');
  });

  it('accepts ordinary addresses and rejects malformed ones', () => {
    expect(checkEmailRules('a+jambo@example.co.uk')).toBeNull();
    expect(checkEmailRules('no-at-sign')).not.toBeNull();
    expect(checkEmailRules('a@b')).not.toBeNull();
    expect(checkEmailRules('a b@example.com')).not.toBeNull();
    expect(checkEmailRules(`${'a'.repeat(250)}@x.io`)).not.toBeNull();
  });
});
