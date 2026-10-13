// Dialogs the app opens on its own: a password-reset link (?reset=…) and the
// one-time "choose your username" step for Google accounts without one.

import { useState } from 'react';
import { suggestUsername } from '../../multiplayer/accountRules.ts';
import type { AuthUserProfile } from './authApi.ts';
import { AuthDialog, NewPasswordForm, UsernameForm } from './AuthForms.tsx';

export function ResetPasswordDialog({ token, onClose, onDone }: { token: string; onClose: () => void; onDone: () => void }) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <AuthDialog eyebrow="Account" title="Password Saved" onClose={onClose}
        lede="Sign in with your new password. Any other devices were signed out.">
        <button type="button" className="auth-primary" onClick={onDone}>Sign in</button>
      </AuthDialog>
    );
  }
  return (
    <AuthDialog eyebrow="Account" title="New Password" onClose={onClose} lede="Choose a new password for your account.">
      <NewPasswordForm mode="reset" token={token} onDone={() => setDone(true)} onCancel={onClose} />
    </AuthDialog>
  );
}

export function ChooseUsernameDialog({ user, onSaved, onSignOut }: {
  user: AuthUserProfile;
  onSaved: (user: AuthUserProfile) => void;
  onSignOut: () => void;
}) {
  return (
    <AuthDialog eyebrow="Welcome" title="Pick a Username"
      lede="This is the name opponents see across the table. You can change it later.">
      <UsernameForm initial={suggestUsername(user.name)} onSaved={onSaved} />
      <button type="button" className="auth-quiet" onClick={onSignOut}>Sign out instead</button>
    </AuthDialog>
  );
}
