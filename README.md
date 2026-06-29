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

**2. Agent** — polls active window, POSTs to API on change

```powershell
pnpm dev:agent
```

Optional env — copy `apps/agent/.env.example` to `apps/agent/.env` (not committed; see `.gitignore`):

| Variable | Default | Description |
|----------|---------|-------------|
| `API_URL` | `http://localhost:3000` | API base URL |
| `POLL_INTERVAL_MS` | `2000` | Poll interval (ms) |

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
