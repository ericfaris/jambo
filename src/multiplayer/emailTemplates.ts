import type { OutgoingEmail } from './mailer.ts';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(to: string, subject: string, paragraphs: string[], action?: { label: string; url: string }): OutgoingEmail {
  const footer = "If you didn't expect this email, you can ignore it.";
  const text = [
    ...paragraphs,
    ...(action ? [`${action.label}: ${action.url}`] : []),
    footer,
    '— Jambo',
  ].join('\n\n');
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="background:#d4a850;color:#2a1608;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">${escapeHtml(action.label)}</a></p>
<p style="font-size:13px;color:#7a6650">Or paste this link into your browser:<br>${escapeHtml(action.url)}</p>`
    : '';
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;background:#f6efe2;color:#2a1608;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fffaf0;border:1px solid #e3d3b4;border-radius:12px;padding:28px">
<h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(subject)}</h1>
${paragraphs.map((p) => `<p style="line-height:1.5">${escapeHtml(p)}</p>`).join('\n')}
${button}
<p style="font-size:13px;color:#7a6650;margin-top:24px">${escapeHtml(footer)}</p>
</div></body></html>`;
  return { to, subject, text, html };
}

export function verifyEmailMessage(to: string, username: string, url: string): OutgoingEmail {
  return render(to, 'Confirm your Jambo email', [
    `Welcome to the market, ${username}!`,
    'Confirm this is your email address so you can recover your account if you ever forget your password. Unconfirmed accounts are removed after 7 days.',
  ], { label: 'Confirm email', url });
}

export function resetPasswordMessage(to: string, username: string | null, url: string): OutgoingEmail {
  return render(to, 'Reset your Jambo password', [
    `Someone asked to reset the password for ${username ?? 'your Jambo account'}.`,
    'This link works once and expires in 30 minutes.',
  ], { label: 'Choose a new password', url });
}

export function passwordChangedMessage(to: string, username: string | null): OutgoingEmail {
  return render(to, 'Your Jambo password was changed', [
    `The password for ${username ?? 'your Jambo account'} was just changed, and every other device was signed out.`,
    "If this wasn't you, reset your password right away from the sign-in screen.",
  ]);
}

/** Sent to an address someone tried to sign up with when it already has an account. */
export function emailInUseMessage(to: string, account: { username: string | null; hasPassword: boolean; hasGoogle: boolean }, appUrl: string): OutgoingEmail {
  const how = account.hasPassword
    ? `Sign in with your username${account.username ? ` (${account.username})` : ''} or this email, or use "Forgot password?" if you need a new one.`
    : 'This account signs in with Google. Use "Continue with Google", then add a password from your account screen if you want one.';
  return render(to, 'You already have a Jambo account', [
    'Someone tried to create a new Jambo account with this email address, but it already belongs to an account.',
    how,
  ], { label: 'Open Jambo', url: appUrl });
}
