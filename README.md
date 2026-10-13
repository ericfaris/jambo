# Jambo2

Digital implementation of Jambo with a pure TypeScript game engine, React UI, and AI opponents.

**Live:** [jambo.mooseflip.com](https://jambo.mooseflip.com)

## Quick Start

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run dev
npm run typecheck   # TypeScript 7
npx vite build
npm test
```

## Accounts (Google + username/password) and MongoDB Setup

The multiplayer/auth server serves the WebSocket and the HTTP auth API on port `3001`.
Players can sign in with Google or create an account with a username, email and
password. One account can carry both sign-in methods (link Google from the
Account dialog, or add a password to a Google account).

1. Copy `.env.example` to `.env` and set:
	- `MONGODB_URI` (Atlas connection string; without it accounts live in memory)
	- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
	- `RESEND_API_KEY`, `EMAIL_FROM` — transactional email via [Resend](https://resend.com)
	  (the sending domain needs Resend's SPF/DKIM DNS records)
	- `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` — a Cloudflare Turnstile widget
	  for the app's hostname
2. In Google Cloud Console, add OAuth redirect URI:
	- `http://localhost:5173/api/auth/google/callback`
3. Start app + server:

```bash
npm run dev
npm run server
```

Outside production the email and Turnstile settings may be empty: emails
(confirmation and reset links) are printed to the server log and the bot check
is skipped. In production (`NODE_ENV=production`, set by `docker-compose.yml`)
password sign-up and reset answer `503` until all four are configured.

### How password accounts work

Follows NIST SP 800-63B-4 (2025) and the OWASP cheat sheets:

- **Passwords**: at least 15 characters, any Unicode, no composition rules or
  forced rotation. Passwords found in Have I Been Pwned's breach corpus are
  refused (k-anonymity range API: only 5 hex chars of the SHA-1 leave the server).
- **Storage**: Argon2id (Node's built-in `crypto.argon2`, 19 MiB / t=2 / p=1),
  PHC-encoded so parameters can rise later (rehash on next sign-in).
- **Sign-in**: username or email. Errors never say which half was wrong, and
  unknown accounts cost the same hashing time. Throttled per IP (30 / 15 min)
  and per account (10 failures / 15 min).
- **Email**: required and confirmed by link (48 h). Unconfirmed accounts can
  play right away but are deleted after 7 days (Mongo TTL index). Reset links
  go only to confirmed addresses, expire after 30 minutes, and work once.
  "Forgot password" gives the same reply whether or not the address has an account.
- **Sessions**: an HttpOnly, SameSite=Lax cookie holding a random id. Every
  sign-in gets a fresh id. A password change or reset signs out every other session.
- **CSRF**: state-changing calls must be same-origin JSON (Origin check plus
  `Content-Type: application/json`).
- **Linking**: a sign-up whose email already has an account is refused, and
  the address's owner gets an email explaining how to sign in. Accounts are
  never merged silently. A Google sign-in with a verified email takes the
  address from an *unconfirmed* password account (pre-hijacking defense).
- **Usernames**: 3–20 letters, digits or `_`, unique regardless of case. They
  are the in-game display name. Google accounts pick one on first sign-in.

Auth endpoints (`src/multiplayer/auth.ts`, `accountApi.ts`):
- `GET /api/auth/google/start` (`?link=1` adds Google to the signed-in account), `GET /api/auth/google/callback`
- `GET /api/auth/session`, `POST /api/auth/logout`
- `POST /api/auth/signup`, `POST /api/auth/login`
- `POST /api/auth/verify-email`, `POST /api/auth/verify-email/resend`
- `POST /api/auth/password/forgot`, `POST /api/auth/password/reset`, `POST /api/auth/password/change`
- `POST /api/auth/username`

In production the redirect URI / `APP_BASE_URL` are the public domain
(`https://jambo.mooseflip.com`) instead of `localhost:5173`. Email links are
built from `APP_BASE_URL`.

## Deployment

Jambo2 is self-hosted on a local Docker lab and exposed publicly at
[jambo.mooseflip.com](https://jambo.mooseflip.com) via a Cloudflare Tunnel
(no longer on Railway). A single Node process serves the built client, the
WebSocket, and the HTTP auth API on container port `3001`, bound to
`127.0.0.1:8500` on the host — the tunnel is the only public entry point.

```bash
docker compose up -d --build
```

Production env values live in `.env` (gitignored). `VITE_CAST_APP_ID` is a
build-time arg baked into the client bundle, so it is passed via
`build.args` in `docker-compose.yml` as well as a runtime env var. CI
(`.github/workflows/ci-cd.yml`) runs build/tests and a Docker build check
only — there is no registry push or remote deploy.

## Tech Stack

- React 19 + TypeScript + Vite
- Zustand state management
- Zod validation
- Tailwind CSS
- Vitest test runner

## Project Structure

- src/engine/ — pure game engine and resolver pipeline
- src/ai/ — AI policies and simulation support
- src/ui/ — React components and interaction panels
- src/hooks/ — Zustand integration
- src/persistence/ — serialization and save/load
- tests/ — engine, AI, UI, and multiplayer tests

## Documentation

Canonical docs live in [docs/INDEX.md](docs/INDEX.md).

Primary references:

- Rules and cards: [docs/CARD_REFERENCE.md](docs/CARD_REFERENCE.md)
- Product requirements: [docs/PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Documentation policy: [docs/DOCS_POLICY.md](docs/DOCS_POLICY.md)

Legacy/superseded docs are retained under [docs/archive/](docs/archive/) for historical context only.

## Docs Changelog

- 2026-02-15: Established canonical documentation set in [docs/INDEX.md](docs/INDEX.md).
- 2026-02-15: Consolidated active docs and moved superseded material to [docs/archive/](docs/archive/).
- 2026-02-15: Added documentation governance rules in [docs/DOCS_POLICY.md](docs/DOCS_POLICY.md).
