import { useMemo, useState } from 'react';
import { getLocalProfileId } from '../../persistence/localProfile.ts';
import { isPasswordAuthAvailable } from '../../config/runtimeConfig.ts';
import { authApi, startGoogleAuth } from '../auth/authApi.ts';
import type { AuthUserProfile } from '../auth/authApi.ts';
import {
  AuthDialog,
  ForgotPasswordForm,
  GoogleIcon,
  NewPasswordForm,
  SignInForm,
  SignUpForm,
  UsernameForm,
} from '../auth/AuthForms.tsx';
import type { AuthSession } from '../useAuthSession.ts';

export interface AuthNotice {
  message: string;
  isError: boolean;
}

interface LoginModalProps {
  auth: AuthSession;
  onClose: () => void;
  /** A message to open with (e.g. the outcome of a Google redirect or an email link). */
  notice?: AuthNotice | null;
  initialView?: 'signin' | 'signup';
}

type View = 'signin' | 'signup' | 'forgot' | 'password' | 'username';

function daysLeft(expiresAt: number | null): number | null {
  if (expiresAt === null) return null;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function LoginModal({ auth, onClose, notice: initialNotice = null, initialView = 'signin' }: LoginModalProps) {
  const localProfileId = useMemo(() => getLocalProfileId(), []);
  const passwordAuth = isPasswordAuthAvailable();
  const [view, setView] = useState<View>(passwordAuth ? initialView : 'signin');
  const [notice, setNotice] = useState<AuthNotice | null>(initialNotice);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const user = auth.authUser;

  const onSignedIn = async (_user: AuthUserProfile, message?: string) => {
    setNotice(message ? { message, isError: false } : null);
    await auth.refresh();
    if (!message) onClose();
  };

  const resend = async () => {
    setResendState('sending');
    const result = await authApi.resendVerification();
    setResendState(result.ok ? 'sent' : 'idle');
    if (!result.ok) setNotice({ message: result.error ?? 'Could not send the email.', isError: true });
  };

  const signOut = async () => {
    await auth.logout();
    setNotice({ message: 'Signed out.', isError: false });
    setView('signin');
  };

  const noticeLine = notice && (
    <div className={`auth-notice${notice.isError ? ' auth-notice-error' : ''}`} role={notice.isError ? 'alert' : 'status'}>
      {notice.message}
    </div>
  );

  // ---- Signed in -----------------------------------------------------------
  if (user && view === 'password') {
    return (
      <AuthDialog eyebrow="Account" title={user.hasPassword ? 'Change Password' : 'Add a Password'} onClose={onClose}
        lede={user.hasPassword ? 'Every other device will be signed out.' : 'Then you can sign in with your username or email, as well as Google.'}>
        <NewPasswordForm
          mode="change"
          user={user}
          onDone={() => {
            setNotice({ message: user.hasPassword ? 'Password changed. Other devices were signed out.' : 'Password added.', isError: false });
            setView('signin');
            void auth.refresh();
          }}
          onCancel={() => setView('signin')}
        />
      </AuthDialog>
    );
  }

  if (user && view === 'username') {
    return (
      <AuthDialog eyebrow="Account" title="Change Username" onClose={onClose} lede="This is the name opponents see.">
        <UsernameForm
          initial={user.username ?? ''}
          onSaved={() => {
            setNotice({ message: 'Username saved.', isError: false });
            setView('signin');
            void auth.refresh();
          }}
        />
        <button type="button" className="auth-quiet" onClick={() => setView('signin')}>Cancel</button>
      </AuthDialog>
    );
  }

  if (user) {
    const remaining = daysLeft(user.unverifiedExpiresAt);
    return (
      <AuthDialog eyebrow="Account" title="Signed In" onClose={onClose}>
        <div className="auth-identity">
          <div className="auth-identity-name">{user.name}</div>
          {user.email && (
            <div className="auth-identity-email">
              {user.email}
              <span className={`auth-badge ${user.emailVerified ? 'auth-badge-ok' : 'auth-badge-warn'}`}>
                {user.emailVerified ? 'Confirmed' : 'Unconfirmed'}
              </span>
            </div>
          )}
        </div>
        {noticeLine}
        {!user.emailVerified && (
          <div className="auth-actions">
            <div className="auth-notice">
              Check your inbox for a confirmation link.
              {remaining !== null && ` Unconfirmed accounts are removed in ${remaining} day${remaining === 1 ? '' : 's'}.`}
            </div>
            <button type="button" className="auth-secondary" onClick={() => void resend()} disabled={resendState !== 'idle'}>
              {resendState === 'sent' ? 'Sent — check your inbox' : resendState === 'sending' ? 'Sending…' : 'Resend confirmation email'}
            </button>
          </div>
        )}
        <div className="auth-methods" aria-label="Sign-in methods">
          <div className="auth-method">
            <span>Username <span className="auth-method-state">· {user.username ?? 'not set'}</span></span>
            <button type="button" className="auth-link" onClick={() => setView('username')}>Change</button>
          </div>
          <div className="auth-method">
            <span>Password <span className="auth-method-state">{user.hasPassword ? '· set' : '· none'}</span></span>
            {(user.hasPassword || user.emailVerified) && (
              <button type="button" className="auth-link" onClick={() => setView('password')}>
                {user.hasPassword ? 'Change' : 'Add'}
              </button>
            )}
          </div>
          <div className="auth-method">
            <span>Google <span className="auth-method-state">{user.hasGoogle ? '· linked' : '· not linked'}</span></span>
            {!user.hasGoogle && (
              <button type="button" className="auth-link" onClick={() => startGoogleAuth(localProfileId, true)}>Link</button>
            )}
          </div>
        </div>
        <div className="auth-actions">
          <button type="button" className="auth-quiet" onClick={() => void signOut()}>Sign out</button>
          <button type="button" className="auth-quiet" onClick={onClose}>Back</button>
        </div>
      </AuthDialog>
    );
  }

  // ---- Signed out ----------------------------------------------------------
  const google = (
    <button type="button" className="auth-secondary" onClick={() => startGoogleAuth(localProfileId)}>
      <GoogleIcon />
      Continue with Google
    </button>
  );

  if (view === 'forgot') {
    return (
      <AuthDialog eyebrow="Account" title="Reset Password" onClose={onClose}
        lede="Enter the email on your account and we'll send you a link to choose a new password.">
        <ForgotPasswordForm onBack={() => setView('signin')} />
      </AuthDialog>
    );
  }

  if (view === 'signup') {
    return (
      <AuthDialog eyebrow="Account" title="Create Account" onClose={onClose}
        lede="Keep your record across devices and play under your own name.">
        {noticeLine}
        <SignUpForm
          localProfileId={localProfileId}
          onSignedUp={(created) => void onSignedIn(created, `Welcome, ${created.name}! We sent a confirmation link to ${created.email ?? 'your email'}.`)}
        />
        <div className="auth-or">or</div>
        {google}
        <div className="auth-switch">
          Already have an account? <button type="button" className="auth-link" onClick={() => { setNotice(null); setView('signin'); }}>Sign in</button>
        </div>
        <button type="button" className="auth-quiet" onClick={onClose}>Back</button>
      </AuthDialog>
    );
  }

  return (
    <AuthDialog eyebrow="Account" title="Sign In" onClose={onClose}
      lede="Sign in to keep your record and your name across devices.">
      {auth.isLoading && !notice && <div className="auth-hint">Checking sign-in status…</div>}
      {noticeLine}
      {passwordAuth && (
        <>
          <SignInForm
            localProfileId={localProfileId}
            onSignedIn={(signedIn) => void onSignedIn(signedIn)}
            onForgot={() => { setNotice(null); setView('forgot'); }}
          />
          <div className="auth-or">or</div>
        </>
      )}
      {google}
      {passwordAuth && (
        <div className="auth-switch">
          New to Jambo? <button type="button" className="auth-link" onClick={() => { setNotice(null); setView('signup'); }}>Create an account</button>
        </div>
      )}
      <button type="button" className="auth-quiet" onClick={onClose}>Back</button>
    </AuthDialog>
  );
}
