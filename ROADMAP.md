# Roadmap

Future work — not scheduled. Current stack and deploy: [README.md](README.md), [deploy/README.md](deploy/README.md).

## Persistence and real-time UI

- **Supabase** as the system of record
- API writes validated telemetry to Supabase after processing
- Web subscribes to changes via **Supabase Realtime** (not WebSockets through NestJS)
- Backend becomes fully stateless; frontend remains functional if API is down (last known data from DB)

## Quality

- Vitest: `packages/shared` parsers, `apps/agent/src/privacy.ts`, ingest auth guard
- Agent typecheck in CI (Windows job or `--filter agent` on self-hosted runner)

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
- Surface SMTC / host-metrics failures instead of silent `null` / zeros

## Product and UX

- Rich dashboard: history, timeline, aggregates
- Multi-machine / multi-agent identity in payloads

## Internationalization

- UI copy and documentation localization (English only today; Ukrainian target for local job market)
