// ============================================================================
// Account rules shared by the auth server and the sign-up UI. Pure — no Node
// or DOM imports — so the client can show the same limits the server enforces.
//
// Password policy follows NIST SP 800-63B-4 (2025) for a password that is the
// only factor: at least 15 characters, every Unicode character allowed, no
// composition rules, no forced rotation. The server additionally rejects
// passwords found in known breaches (see passwords.ts).
// ============================================================================

export const PASSWORD_MIN_LENGTH = 15;
/** Upper bound only to cap hashing cost; NIST asks for at least 64. */
export const PASSWORD_MAX_LENGTH = 256;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;
const USERNAME_PATTERN = /^[A-Za-z0-9_]+$/;

export const EMAIL_MAX_LENGTH = 254;
// Deliberately loose: one @, something on each side, a dot in the domain, no
// whitespace. The verification email is the real check.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Handles that would read as staff, the system, or one of the AI traders. */
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'system', 'support', 'help', 'moderator', 'mod',
  'staff', 'official', 'jambo', 'mooseflip', 'server', 'null', 'undefined', 'anonymous',
  'guest', 'player', 'opponent', 'trader', 'ai', 'bot', 'computer',
  'easy', 'medium', 'hard', 'expert',
]);

/** Substrings that disqualify a handle (it is shown to opponents as the display name). */
const BLOCKED_USERNAME_FRAGMENTS = [
  'fuck', 'shit', 'cunt', 'nigg', 'fag', 'bitch', 'whore', 'nazi', 'hitler',
];

/** NFKC-normalizes, as NIST asks, so the same passphrase typed on any keyboard matches. */
export function normalizePassword(password: string): string {
  return password.normalize('NFKC');
}

/** Length in Unicode code points (an emoji counts as one character, not two). */
export function passwordLength(password: string): number {
  return Array.from(normalizePassword(password)).length;
}

/** Returns a user-facing problem with the password, or null when it passes the local rules. */
export function checkPasswordRules(
  password: string,
  context: { username?: string | null; email?: string | null } = {},
): string | null {
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters — a short phrase works well.`;
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
  }
  const lowered = normalizePassword(password).toLowerCase();
  if (new Set(Array.from(lowered)).size === 1) {
    return 'That password is a single repeated character.';
  }
  const username = context.username?.toLowerCase();
  if (username && lowered.includes(username)) {
    return "Your password can't contain your username.";
  }
  const email = context.email?.toLowerCase();
  if (email && (lowered.includes(email) || lowered === email.split('@')[0])) {
    return "Your password can't be your email address.";
  }
  return null;
}

export function normalizeUsername(username: string): string {
  return username.trim();
}

/** Returns a user-facing problem with the handle, or null when it is acceptable. */
export function checkUsernameRules(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Usernames are ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters.`;
  }
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use only letters, numbers and underscores.';
  }
  const lowered = username.toLowerCase();
  if (RESERVED_USERNAMES.has(lowered)) {
    return 'That username is reserved.';
  }
  if (BLOCKED_USERNAME_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
    return "That username isn't allowed.";
  }
  return null;
}

/** A valid handle derived from a Google display name, as a starting suggestion. */
export function suggestUsername(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .slice(0, USERNAME_MAX_LENGTH);
  return checkUsernameRules(base) === null ? base : '';
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function checkEmailRules(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (email.length === 0 || email.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email)) {
    return 'Enter a valid email address.';
  }
  return null;
}
