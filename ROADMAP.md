# Roadmap

Future work — not scheduled. Current stack and deploy: [README.md](README.md), [deploy/README.md](deploy/README.md).

## Persistence and real-time UI

- **Supabase** as the system of record
- API writes validated telemetry to Supabase after processing
- Web subscribes to changes via **Supabase Realtime** (not WebSockets through NestJS)
- Backend becomes fully stateless; frontend remains functional if API is down (last known data from DB)
- **Persist window segments, not polls** — closed intervals on focus change; live host metrics stay ephemeral
- Roll up segments before write (day view = time per app), not raw poll rows
- Optional sampled host history if graphs matter — default is don't store host time series

## Identity and config (self-hosted)

Today: one hub — Caddy **basic auth** for panel reads, shared **`INGEST_SECRET`** Bearer for agent ingest. No user accounts, no per-agent id, no integration token storage.

- Per-agent identity in env → include in ingest; panel labels machines when multi-agent lands
- **Integration keys on the server** — env-based secrets (same pattern as existing API keys): configure once, restart API
- Optional **Settings → Integrations** in panel (behind existing auth): masked keys, docs links; full UI persistence waits on settings store
- OAuth integrations only when API keys aren't enough — defer heavier flows until simpler tiles ship

## Integrations (bento tiles)

Server-side fetch + cache (minutes-scale TTL). Not agent OAuth except where OS already provides data.

### Agent / OS (no extra keys)

- **SMTC album art** — send on track change only, not every host poll
- Surface SMTC / host-metrics failures instead of silent `null` / zeros

### Server env keys

- **Weather** — location-based conditions tile (keyless or API-key provider)
- **GitHub** — recent activity / contribution summary; infrequent poll
- **Steam** — online / in-game / avatar; optional recently played
- **Discord** — narrow scope: no clean friends-list API; own account or guild bot presence — defer or narrow

### Bento layout

- Group **online status** (Steam, Discord when wired) separately from window / machine / media
- **Day strip** from aggregated segments — time per app/game, no productivity scoring or distraction alerts
- Classification category chips optional; work/personal chips not a product direction

## API / ops

- Persist settings (classification toggle survives restart)
- Ingest rate limit + request body size cap

## Agent privacy

- Locale-specific blocklist rules
- User-defined regex rules beyond `BLOCKED_APPS`

## Agent hardening

- **Circuit breaker** (`opossum`) around API calls
- **Local retry queue** (`better-sqlite3`) for offline / API outage tolerance
- **Node.js SEA** (Single Executable Application) for a distributable `.exe` — alternative to long-running Node + pm2

## Product and UX

- Rich dashboard: history, timeline, aggregates (segment-based)
- Multi-machine / multi-agent identity in payloads

## Internationalization

- UI copy and documentation localization (English only today; Ukrainian target for local job market)
