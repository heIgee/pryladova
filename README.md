# Pryladova

Real-time desktop telemetry: a Windows agent reports the active window to a NestJS 12 (ESM) API; a React web panel displays the latest state.

Future work: [ROADMAP.md](ROADMAP.md).

## Prerequisites

- Node.js 22+
- pnpm
- Windows (agent)

## Install

```powershell
pnpm install
```

## Run (local dev)

**All apps** (one terminal):

```powershell
pnpm dev
```

Or three terminals:

**1. API** — `http://localhost:3000`

```powershell
pnpm dev:api
```

Optional env — copy `apps/api/.env.example` to `apps/api/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | — | Google AI Studio key; without it classification is disabled |
| `GEMINI_MODEL` | `gemini-3.1-flash-lite` | Gemini model id for window classification |
| `INGEST_SECRET` | — | Shared secret for `POST /api/telemetry` and `POST /api/host`; required in production |

When `GEMINI_API_KEY` is missing or the LLM call fails, telemetry is still stored with `classificationStatus: "failed"`.

Classification runs asynchronously after POST — the agent gets `204` immediately; the web panel may show a pending spinner verb until the result arrives.

**2. Agent** — polls active window (`POST /api/telemetry` on change) and host metrics (`POST /api/host` every poll)

```powershell
pnpm dev:agent         # local API (DEV_API_URL)
pnpm dev:agent:remote  # VPS API (API_URL)
```

Optional env — copy `apps/agent/.env.example` to `apps/agent/.env` (not committed; see `.gitignore`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DEV_API_URL` | `http://localhost:3000` | Dev API origin (`pnpm dev:agent`) |
| `API_URL` | — | Remote API origin (`pnpm dev:agent:remote`) |
| `POLL_INTERVAL_MS` | `2000` | Poll interval (ms) |
| `INGEST_SECRET` | — | Must match API when ingest auth is enabled |
| `BLOCKED_APPS` | — | Comma-separated app names merged with the default blocklist |

**Host metrics** (local Win32 / SMTC, every poll): idle time, CPU%, RAM%, uptime, now playing.

**Agent privacy** (local, before POST):

- Blocked apps (password managers, SSH/RDP, crypto wallets, etc.) send `Secure` / `Redacted` instead of raw titles.
- Window titles keep tab names; emails and file paths are redacted to `[email]` and `[path]`.

**3. Web** — `http://localhost:5173` (proxies `/api` to the API)

```powershell
pnpm dev:web
```

Open the web URL. Telemetry appears after the agent sends the first POST.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | API + agent + web in parallel |
| `pnpm dev:api` | NestJS API with watch |
| `pnpm dev:agent` | Telemetry agent (local API) |
| `pnpm dev:agent:remote` | Telemetry agent (remote VPS API) |
| `pnpm dev:web` | Vite dev server |
| `pnpm check` | Typecheck + lint + build (turbo) |
| `pnpm build` | Build all packages (turbo) |
| `pnpm typecheck` | Typecheck all packages (turbo) |
| `pnpm lint` / `pnpm lint:fix` | Biome check / fix |
| `pnpm knip` | Unused exports and dependencies |
| `pnpm test` | Vitest (shared, api, web, agent privacy) |
| `pnpm test:coverage` | Vitest with coverage report |
| `pnpm test:e2e` | Playwright API → web panel |

## Testing

Automated coverage focuses on privacy, typed contracts, ingest auth, async classification, and the API → web poll path. Windows agent capture stays manual.

| Command | What |
|---------|------|
| `pnpm test` | Vitest unit + integration (no agent native install) |
| `pnpm test:coverage` | Same, with lcov output |
| `pnpm test:e2e` | Playwright: fake ingest POST → panel |

First-time E2E: `pnpm exec playwright install chromium`

## Manual API check

```powershell
$body = '{"appName":"Test","windowTitle":"Hello","capturedAt":"2026-06-29T10:00:00.000Z"}'
Invoke-WebRequest -Uri http://localhost:3000/api/telemetry -Method POST -ContentType "application/json" -Body $body
Invoke-WebRequest -Uri http://localhost:3000/api/telemetry
```

If `INGEST_SECRET` is set on the API, add header `Authorization: Bearer <secret>` to the POST.

## Production

Single Linux host (currently Oracle VPS + DuckDNS). **Step-by-step runbook:** [`deploy/README.md`](deploy/README.md).

```
Browser ── basic auth ──► Caddy ── /              ► ~/pryladova/web (SPA)
                         Caddy ── /api/*          ► API container (basic auth)
Agent  ── Bearer ingest ─► Caddy ── POST ingest   ► API (Nest checks INGEST_SECRET)
                         API container ──────────► 127.0.0.1:3000
```

| Piece | Where | Auto on push to `main`? |
|-------|-------|-------------------------|
| API container | `~/pryladova/` + [`docker-compose.yml`](docker-compose.yml) | Yes |
| Web static files | `~/pryladova/web/` | Yes |
| API secrets | `~/pryladova/.env` ← [`deploy/env.example`](deploy/env.example) | No — edit on host |
| Caddy / TLS / panel auth | `/etc/caddy/Caddyfile` (+ domain/root via [`deploy/host.env.example`](deploy/host.env.example)) | No — edit on host |
| Agent | `apps/agent/.env` on Windows | No — edit on PC |

Push to `main` → [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds the image, uploads web + compose, restarts API.

Local `apps/api/.env` is for `pnpm dev` only.

## Layout

```
apps/agent   # Windows telemetry client
apps/api     # NestJS 12 API (ESM, in-memory state)
apps/web     # React + Vite + Tailwind v4
packages/shared   # Shared types and Zod schemas
deploy/           # runbook, bootstrap, Caddyfile, env examples
```
