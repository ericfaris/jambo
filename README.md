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

## Google OAuth + MongoDB Setup

The multiplayer/auth server now serves both WebSocket and HTTP auth endpoints on port `3001`.

1. Copy `.env.example` to `.env` and set:
	- `MONGODB_URI` (Atlas connection string)
	- `GOOGLE_CLIENT_ID`
	- `GOOGLE_CLIENT_SECRET`
2. In Google Cloud Console, add OAuth redirect URI:
	- `http://localhost:5173/api/auth/google/callback`
3. Start app + server:

```bash
npm run dev
npm run server
```

Auth endpoints used by UI:
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `GET /api/auth/session`
- `POST /api/auth/logout`

In production the redirect URI / `APP_BASE_URL` are the public domain
(`https://jambo.mooseflip.com`) instead of `localhost:5173`.

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
