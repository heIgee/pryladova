# Pryladova

Real-time telemetry and presence system. A local agent reports desktop activity to a backend API; a minimal web panel displays the current state.

## Goals

- Distributed architecture suitable for portfolio and production extension
- Type-safe contracts shared across agent, API, and web
- Privacy-aware telemetry collection on the client
- Stateless, event-driven backend once persistence is introduced

## Architecture (current scope)

```
┌─────────────┐     HTTP      ┌─────────────┐     HTTP      ┌─────────────┐
│  apps/agent │ ────────────► │  apps/api   │ ◄──────────── │  apps/web   │
│  (Windows)  │               │  (NestJS)   │   poll/REST   │  (React)    │
└─────────────┘               └─────────────┘               └─────────────┘
       │                             │
       └──────── packages/shared ────┘
```

| Component | Role |
|-----------|------|
| `apps/agent` | Polls active window on Windows; applies privacy filter; sends telemetry to API |
| `apps/api` | Validates payloads; holds current telemetry in memory; exposes read endpoint for web |
| `apps/web` | Minimal panel: a few lines showing latest telemetry |
| `packages/shared` | Shared TypeScript types and constants (status shapes, API contract) |

### Data flow

1. Agent reads the active window title (and related metadata as needed).
2. Agent runs a local privacy blocklist (regex). Matches are replaced with a generic status (e.g. `Browsing` / `Secure`) without sending the raw title.
3. Agent POSTs the payload to the API.
4. API validates against shared types and updates in-memory state.
5. Web polls the API (or uses an equivalent simple read path) and renders the latest values.

No database, LLM, or real-time subscription layer in the current scope.

## Monorepo layout

```
pryladova/
├── apps/
│   ├── agent/          # Local Node.js telemetry client
│   ├── api/            # NestJS backend
│   └── web/            # React + Vite frontend
├── packages/
│   └── shared/         # @pryladova/shared — types, constants
├── pnpm-workspace.yaml
└── package.json
```

### Workspace dependencies

Apps depend on shared types via pnpm workspaces:

```json
"dependencies": {
  "@pryladova/shared": "workspace:*"
}
```

pnpm symlinks `packages/shared` into each app’s `node_modules`. Contract changes surface as TypeScript errors across all consumers.

### Deployment model (when introduced)

The monorepo is for development ergonomics, not for shipping the full tree to every host.

| Target | Scope | Mechanism |
|--------|-------|-----------|
| VPS | `apps/api` + `packages/shared` | Docker image built from filtered workspace paths |
| Vercel | `apps/web` + `packages/shared` | Root directory `apps/web`; workspace-aware build |

The API container does not include the web app or agent. Vercel does not build or deploy the API.

## Agent (`apps/agent`)

- **Platform:** Windows (development machine)
- **Window detection:** Native module (e.g. `active-win`)
- **Runtime:** Node.js process (background via `pm2` or equivalent — no standalone executable in current scope)
- **Privacy:** Local blocklist before any network send. Default patterns include sensitive keywords (`bank`, `password`, `incognito`, etc.); list is configurable and extensible.
- **Resilience:** Direct HTTP to API. Retry and offline queue are deferred.

## API (`apps/api`)

- **Framework:** NestJS
- **State:** In-memory store for latest telemetry (single source for web reads)
- **Responsibilities:** Request validation, shared-type enforcement, expose current status for the web panel
- **Hosting:** Local dev first; VPS + Docker when deployment is added

## Web (`apps/web`)

- **Stack:** React, Vite
- **UI:** Minimal — a few lines of live telemetry (window/app context as allowed by privacy rules, timestamps, connection health as needed)
- **Data access:** Poll API for current state
- **Hosting:** Local dev first; Vercel when deployment is added

## Shared package (`packages/shared`)

- Telemetry payload types
- API request/response shapes
- Status enums and constants used by agent, API, and web
- Zod (or equivalent) schemas at module boundaries when validation is wired

## Tech stack (current scope)

| Layer | Choice |
|-------|--------|
| Monorepo | pnpm workspaces |
| Language | TypeScript |
| Agent | Node.js |
| API | NestJS |
| Web | React, Vite |

## Environment and secrets

- No secrets in the repository
- API keys, Supabase credentials, and LLM keys belong in environment configuration when those integrations are added
- Follow per-app env loading patterns once scaffolded

## Deferred

Items below are part of the target architecture but out of scope until explicitly scheduled.

### Persistence and real-time UI

- **Supabase** as the system of record
- API writes validated telemetry to Supabase after processing
- Web subscribes to changes via **Supabase Realtime** (not WebSockets through NestJS)
- Backend becomes fully stateless; frontend remains functional if API is down (last known data from DB)

### LLM classification

- **DeepSeek API** (or equivalent) to classify window context into task categories
- In-memory cache on the API to deduplicate similar inputs and reduce cost/latency
- Fixed status taxonomy (enum) vs free-form labels — to be decided at implementation

### Agent hardening

- **Circuit breaker** (`opossum`) around API calls
- **Local retry queue** (`better-sqlite3`) for offline / API outage tolerance
- **Node.js SEA** (Single Executable Application) for a distributable `.exe` — alternative to long-running Node + pm2

### Monorepo tooling

- **Turborepo** (`turbo.json`) for parallel `dev` / `build` across apps and cacheable pipelines

### Infrastructure and CI/CD

- Dockerized NestJS on ARM VPS
- Nginx reverse proxy
- GitHub Actions: build API image, push to registry, deploy to VPS
- Vercel project linked to `apps/web` with smart monorepo builds

### Product and UX

- Rich dashboard: history, timeline, aggregates
- Multi-machine / multi-agent identity in payloads
- Authentication and access control (public vs private panel)
- Extended privacy blocklist (locale-specific keywords, user-defined rules)

### Internationalization

- UI copy and documentation localization (current scope: English only)
