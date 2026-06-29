# Pryladova

Real-time desktop telemetry: a Windows agent reports the active window to a NestJS 12 (ESM) API; a React web panel displays the latest state.

Architecture details: [MVP.md](MVP.md).

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

When `GEMINI_API_KEY` is missing or the LLM call fails, telemetry is still stored with `classificationStatus: "failed"`.

Classification runs asynchronously after POST — the agent gets `204` immediately; the web panel may show a pending spinner verb until the result arrives.

**2. Agent** — polls active window, POSTs to API on change

```powershell
pnpm dev:agent
```

Optional env — copy `apps/agent/.env.example` to `apps/agent/.env` (not committed; see `.gitignore`):

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:3000` | API base URL |
| `POLL_INTERVAL_MS` | `2000` | Poll interval (ms) |
| `BLOCKED_APPS` | — | Comma-separated app names merged with the default blocklist |

**Agent privacy** (local, before POST):

- Blocked apps (password managers, SSH/RDP, crypto wallets, etc.) send `Secure` / `Redacted` instead of raw titles.
- Window titles keep tab names; emails and file paths are redacted to `[email]` and `[path]`.

**3. Web** — `http://localhost:5173` (proxies `/telemetry` to API)

```powershell
pnpm dev:web
```

Open the web URL. Telemetry appears after the agent sends the first POST.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | API + agent + web in parallel |
| `pnpm dev:api` | NestJS API with watch |
| `pnpm dev:agent` | Telemetry agent |
| `pnpm dev:web` | Vite dev server |
| `pnpm build` | Build shared, then all apps |
| `pnpm typecheck` | Typecheck all packages |

## Manual API check

```powershell
$body = '{"appName":"Test","windowTitle":"Hello","capturedAt":"2026-06-29T10:00:00.000Z"}'
Invoke-WebRequest -Uri http://localhost:3000/telemetry -Method POST -ContentType "application/json" -Body $body
Invoke-WebRequest -Uri http://localhost:3000/telemetry
```

## Layout

```
apps/agent   # Windows telemetry client
apps/api     # NestJS 12 API (ESM, in-memory state)
apps/web     # React + Vite + Tailwind v4
packages/shared   # Shared types and Zod schemas
```
