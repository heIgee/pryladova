# Roadmap

Future work — not scheduled. Current stack and deploy: [README.md](README.md), [deploy/README.md](deploy/README.md).

## Persistence and real-time UI

**Supabase** as the system of record for window history. Live host metrics (CPU, RAM, uptime, media) stay ephemeral in the API — not a stored time series.

- **Persist window segments, not polls** — the agent already POSTs only on focus change, so each ingest closes the open segment and opens the next
- Aggregate on read (day view = time per app); no pre-rollup until query cost justifies one
- **Persist settings** (classification toggle survives API restart)
- Web reads history through the API first. **Supabase Realtime** direct to the browser comes after: it needs anon-key RLS policies, and the panel still depends on the API for ephemeral host state either way

### Segment semantics

- One open segment per agent, enforced by a partial unique index (`ended_at is null`) rather than application code
- Both interval ends come from agent `capturedAt`, so durations do not inherit network latency
- **Stale close** — host POSTs refresh `last_seen_at`; after a gap (sleep, crash, network loss) the open segment closes at `last_seen_at`, not at wake, and records why it closed
- Decide whether `idleMs` closes a segment or accrues inside it — "time focused" and "time active" are different claims
- Redacted segments are stored as `Secure` / `Redacted`: accurate totals, no leaked titles
- `agent_id` column from the first migration, before multi-agent needs it
- Optional `eventId` on the telemetry payload with a unique constraint — required before the agent retry queue can replay without double-counting
- Late arrivals (`capturedAt` older than the open segment) are ignored and logged
- Migrations live in the repo, not in the Supabase dashboard

## Identity and config (self-hosted)

Today: one hub — Caddy **basic auth** for panel reads, shared **`INGEST_SECRET`** Bearer for agent ingest. No user accounts, no per-agent id, no integration token storage.

**Security model (intentional):** Nest does not guard panel routes (`GET/PUT /api/settings`, `GET /api/telemetry`). Production relies on Caddy basic auth + API bound to localhost in Docker. Nest-layer guards are deferred (defense-in-depth for dev/exposed ports).

- Per-agent identity in env → include in ingest; panel labels machines when multi-agent lands
- **Integration keys on the server** — env-based secrets (same pattern as existing API keys): configure once, restart API
- Optional **Settings → Integrations** in panel (behind existing auth): masked keys, docs links; full UI persistence waits on settings store
- OAuth integrations only when API keys aren't enough — defer heavier flows until simpler tiles ship

## Integrations (bento tiles)

Server-side fetch + cache (minutes-scale TTL). Not agent OAuth except where OS already provides data.

### Server env keys

- **GitHub** — recent activity / contribution summary; infrequent poll
- **Steam** — online / in-game / avatar; optional recently played
- **Discord** — narrow scope: no clean friends-list API; own account or guild bot presence — defer or narrow

### Bento layout

- Group **online status** (Steam, Discord when wired) separately from window / machine / media
- **Day strip** from aggregated segments — time per app/game, no productivity scoring or distraction alerts
- Classification category chips optional; work/personal chips not a product direction

## API / ops

- Panel Nest auth (optional defense-in-depth when API run outside Caddy)
- E2E coverage for production auth path (Caddy basic auth + ingest secret)
- External uptime checks against `/api/health` need Caddy basic-auth credentials (see deploy README)
- LLM classification treats window title and app name as untrusted input; trust boundary is the agent/OS
- Reject or sanitize non-raster `thumbnailDataUrl` at the API/shared boundary (SVG etc.)
- Contract tests: API responses satisfy shared Zod output schemas

## Agent privacy

- Locale-specific blocklist rules
- User-defined regex rules beyond `BLOCKED_APPS`
- Blocklist matches executable tokens only (display name vs process name gaps)
- Blocked-app dedup between two different secure apps (same snapshot key suppresses transition)

## Agent hardening

- **Circuit breaker** (`opossum`) around API calls
- **Local retry queue** (`better-sqlite3`) for offline / API outage tolerance
- **Node.js SEA** (Single Executable Application) for a distributable `.exe` — alternative to long-running Node + pm2
- Graceful shutdown (clear poll interval on SIGINT/SIGTERM)
- `pickCurrentSession` stable tie-breaking when multiple SMTC sessions share rank
- Degrade gracefully when `active-win` fails — don't skip window telemetry after a successful host POST
- Reset track/thumbnail cache when SMTC session clears (avoid stale re-fetch when media resumes)

## Product and UX

- Rich dashboard: history, timeline, aggregates (segment-based)
- Multi-machine / multi-agent identity in payloads
- Weather popover full a11y (arrow keys, focus trap, `aria-activedescendant`)
- Consolidate WMO weather code → icon mapping in shared (web header duplicates text mapping today)
- Host CPU/RAM/media can go stale if host POSTs stop while window telemetry still updates
- Use shared release from `GET /api/health` for deploy verification (web uses build-time `VITE_APP_RELEASE` today)

## Internationalization

- UI copy and documentation localization (English only today; Ukrainian target for local job market)
