// Building blocks and forms for the account dialogs. Each form owns its own
// submit state and reports a signed-in user (or completion) upward.

import { useEffect, useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  checkEmailRules,
  checkPasswordRules,
  checkUsernameRules,
  PASSWORD_MIN_LENGTH,
  passwordLength,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../../multiplayer/accountRules.ts';
import { authApi } from './authApi.ts';
import type { AuthResult, AuthUserProfile } from './authApi.ts';
import { isTurnstileRequired, TurnstileWidget } from './TurnstileWidget.tsx';
import './Auth.css';

// ---------------------------------------------------------------------------
// Shell + fields
// ---------------------------------------------------------------------------

export function AuthDialog({ eyebrow, title, lede, onClose, children }: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  /** Omit to make the dialog non-dismissable (Escape and scrim clicks do nothing). */
  onClose?: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  useEffect(() => {
    if (!onClose) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="auth-scrim" onClick={onClose}>
      <div
        className="auth-dialog dialog-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="auth-eyebrow">{eyebrow}</div>
        <div className="auth-title" id={titleId}>{title}</div>
        <div className="auth-rule" />
        {lede && <div className="auth-lede">{lede}</div>}
        {children}
      </div>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  autoComplete: string;
  hint?: ReactNode;
  error?: string | null;
  autoFocus?: boolean;
  maxLength?: number;
  inputMode?: 'email' | 'text';
}

export function Field({ label, value, onChange, type = 'text', autoComplete, hint, error, autoFocus, maxLength, inputMode }: FieldProps) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === 'password';
  const input = (
    <input
      id={id}
      className="auth-input"
      type={isPassword && revealed ? 'text' : type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      autoComplete={autoComplete}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      autoFocus={autoFocus}
      maxLength={maxLength}
      inputMode={inputMode}
      aria-invalid={error ? true : undefined}
      aria-describedby={hint || error ? `${id}-help` : undefined}
    />
  );
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      {isPassword ? (
        <div className="auth-input-row">
          {input}
          <button
            type="button"
            className="auth-reveal"
            onClick={() => setRevealed((r) => !r)}
            aria-pressed={revealed}
            aria-label={revealed ? 'Hide password' : 'Show password'}
          >
            {revealed ? 'Hide' : 'Show'}
          </button>
        </div>
      ) : input}
      <div id={`${id}-help`}>
        {error ? <div className="auth-error" role="alert">{error}</div> : hint && <div className="auth-hint">{hint}</div>}
      </div>
    </div>
  );
}

function PasswordLengthHint({ password }: { password: string }) {
  const length = passwordLength(password);
  if (length === 0) return <>At least {PASSWORD_MIN_LENGTH} characters. A short phrase like “four ripe mangoes at dawn” is easy to remember.</>;
  if (length < PASSWORD_MIN_LENGTH) return <>{PASSWORD_MIN_LENGTH - length} more character{PASSWORD_MIN_LENGTH - length === 1 ? '' : 's'} to go.</>;
  return <span className="auth-hint-ok">Long enough ✓</span>;
}

export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24.0 24.0 0 0 0 0 21.56l7.98-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
    </svg>
  );
}

/** Server errors land on the field they name; anything else shows under the form. */
function useServerErrors() {
  const [result, setResult] = useState<AuthResult | null>(null);
  return {
    setResult,
    fieldError: (field: string) => (result && !result.ok && result.field === field ? result.error : null),
    formError: result && !result.ok && (!result.field || result.field === 'turnstile' || result.field === 'token') ? result.error : null,
  };
}

function useTurnstileToken() {
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  return {
    token,
    ready: !isTurnstileRequired() || token !== '',
    widget: <TurnstileWidget onToken={setToken} resetKey={resetKey} />,
    /** A token is single-use: get a fresh one after any submit. */
    renew: () => setResetKey((k) => k + 1),
  };
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export function SignInForm({ localProfileId, onSignedIn, onForgot }: {
  localProfileId: string;
  onSignedIn: (user: AuthUserProfile) => void;
  onForgot: () => void;
}) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { setResult, formError } = useServerErrors();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const result = await authApi.login({ identifier, password, localProfileId });
    setBusy(false);
    setResult(result);
    if (result.ok && result.user) onSignedIn(result.user);
  };

  return (
    <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
      <Field label="Username or email" value={identifier} onChange={setIdentifier} autoComplete="username" autoFocus maxLength={254} />
      <Field label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" />
      {formError && <div className="auth-error" role="alert">{formError}</div>}
      <button type="submit" className="auth-primary" disabled={busy || !identifier.trim() || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <div className="auth-link-row">
        <button type="button" className="auth-link" onClick={onForgot}>Forgot password?</button>
      </div>
    </form>
  );
}

export function SignUpForm({ localProfileId, onSignedUp }: {
  localProfileId: string;
  onSignedUp: (user: AuthUserProfile) => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const { setResult, fieldError, formError } = useServerErrors();
  const turnstile = useTurnstileToken();

  const localErrors = {
    username: username ? checkUsernameRules(username) : null,
    email: touched && email ? checkEmailRules(email) : null,
    password: touched && password ? checkPasswordRules(password, { username, email }) : null,
  };
  const canSubmit = !busy && turnstile.ready && !!username && !!email && !!password
    && !checkUsernameRules(username) && !checkEmailRules(email) && !checkPasswordRules(password, { username, email });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setBusy(true);
    const result = await authApi.signup({ username, email, password, localProfileId, turnstileToken: turnstile.token });
    setBusy(false);
    setResult(result);
    turnstile.renew();
    if (result.ok && result.user) onSignedUp(result.user);
  };

  return (
    <form className="auth-form" onSubmit={(e) => void submit(e)} onBlur={() => setTouched(true)} noValidate>
      <Field
        label="Username"
        value={username}
        onChange={setUsername}
        autoComplete="username"
        autoFocus
        maxLength={USERNAME_MAX_LENGTH}
        hint={`What opponents see. ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} letters, numbers or _.`}
        error={fieldError('username') ?? localErrors.username}
      />
      <Field
        label="Email"
        type="email"
        inputMode="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        maxLength={254}
        hint="Only for confirming your account and resetting your password. Never shown to anyone."
        error={fieldError('email') ?? localErrors.email}
      />
      <Field
        label="Password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        hint={<PasswordLengthHint password={password} />}
        error={fieldError('password') ?? localErrors.password}
      />
      {turnstile.widget}
      {formError && <div className="auth-error" role="alert">{formError}</div>}
      <button type="submit" className="auth-primary" disabled={!canSubmit}>
        {busy ? 'Creating account…' : 'Create account'}
      </button>
    </form>
  );
}

export function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const { setResult, fieldError, formError } = useServerErrors();
  const turnstile = useTurnstileToken();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || checkEmailRules(email) || !turnstile.ready) return;
    setBusy(true);
    const result = await authApi.forgotPassword({ email, turnstileToken: turnstile.token });
    setBusy(false);
    setResult(result);
    turnstile.renew();
    if (result.ok) setSent(true);
  };

  if (sent) {
    return (
      <div className="auth-actions">
        <div className="auth-notice" role="status">
          If an account with a confirmed email matches <strong>{email.trim()}</strong>, a reset link is on its way. It works once and expires in 30 minutes.
        </div>
        <button type="button" className="auth-primary" onClick={onBack}>Back to sign in</button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
      <Field label="Email" type="email" inputMode="email" value={email} onChange={setEmail} autoComplete="email" autoFocus maxLength={254} error={fieldError('email')} />
      {turnstile.widget}
      {formError && <div className="auth-error" role="alert">{formError}</div>}
      <button type="submit" className="auth-primary" disabled={busy || !!checkEmailRules(email) || !turnstile.ready}>
        {busy ? 'Sending…' : 'Send reset link'}
      </button>
      <button type="button" className="auth-quiet" onClick={onBack}>Back to sign in</button>
    </form>
  );
}

/** New password for a reset link (`token`) or a signed-in change (`hasPassword` asks for the current one). */
export function NewPasswordForm({ mode, user, token, onDone, onCancel }: {
  mode: 'reset' | 'change';
  user?: AuthUserProfile | null;
  token?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const needsCurrent = mode === 'change' && !!user?.hasPassword;
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const { setResult, fieldError, formError } = useServerErrors();
  const context = { username: user?.username, email: user?.email };
  const localError = password ? checkPasswordRules(password, context) : null;
  const passwordField = mode === 'reset' ? 'password' : 'newPassword';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !password || checkPasswordRules(password, context) || (needsCurrent && !current)) return;
    setBusy(true);
    const result = mode === 'reset'
      ? await authApi.resetPassword({ token: token ?? '', password })
      : await authApi.changePassword({ ...(needsCurrent ? { currentPassword: current } : {}), newPassword: password });
    setBusy(false);
    setResult(result);
    if (result.ok) onDone();
  };

  return (
    <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
      {/* Lets password managers attach the new password to the right account. */}
      {user?.username && <input type="text" autoComplete="username" value={user.username} readOnly hidden />}
      {needsCurrent && (
        <Field label="Current password" type="password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus error={fieldError('currentPassword')} />
      )}
      <Field
        label="New password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        autoFocus={!needsCurrent}
        hint={<PasswordLengthHint password={password} />}
        error={fieldError(passwordField) ?? localError}
      />
      {formError && <div className="auth-error" role="alert">{formError}</div>}
      <button type="submit" className="auth-primary" disabled={busy || !password || !!localError || (needsCurrent && !current)}>
        {busy ? 'Saving…' : 'Save password'}
      </button>
      <button type="button" className="auth-quiet" onClick={onCancel}>Cancel</button>
    </form>
  );
}

export function UsernameForm({ initial, onSaved }: { initial: string; onSaved: (user: AuthUserProfile) => void }) {
  const [username, setUsername] = useState(initial);
  const [busy, setBusy] = useState(false);
  const { setResult, fieldError, formError } = useServerErrors();
  const localError = username ? checkUsernameRules(username) : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !username || localError) return;
    setBusy(true);
    const result = await authApi.setUsername(username);
    setBusy(false);
    setResult(result);
    if (result.ok && result.user) onSaved(result.user);
  };

  return (
    <form className="auth-form" onSubmit={(e) => void submit(e)} noValidate>
      <Field
        label="Username"
        value={username}
        onChange={setUsername}
        autoComplete="username"
        autoFocus
        maxLength={USERNAME_MAX_LENGTH}
        hint={`What opponents see. ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} letters, numbers or _.`}
        error={fieldError('username') ?? localError}
      />
      {formError && <div className="auth-error" role="alert">{formError}</div>}
      <button type="submit" className="auth-primary" disabled={busy || !username || !!localError}>
        {busy ? 'Saving…' : 'Save username'}
      </button>
    </form>
  );
}
