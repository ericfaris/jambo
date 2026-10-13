// ============================================================================
// Transactional email via Resend's REST API (no SDK — one fetch). Without
// RESEND_API_KEY outside production, messages are printed to the server log
// instead so the verify/reset links can be followed in dev.
// ============================================================================

import type { FetchLike } from './passwords.ts';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type SendEmail = (email: OutgoingEmail) => Promise<void>;

export function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env['RESEND_API_KEY'] && process.env['EMAIL_FROM']);
}

export function createResendMailer(fetchImpl: FetchLike): SendEmail {
  return async (email) => {
    const apiKey = process.env['RESEND_API_KEY'] ?? '';
    const from = process.env['EMAIL_FROM'] ?? '';
    if (!apiKey || !from) {
      if (isProduction()) throw new Error('Email is not configured (RESEND_API_KEY, EMAIL_FROM)');
      console.log(`[mail:dev] To: ${email.to}\n[mail:dev] Subject: ${email.subject}\n${email.text}`);
      return;
    }
    const response = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Resend rejected the email (HTTP ${response.status})`);
    }
  };
}
