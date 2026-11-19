# Roadmap

Future work — not scheduled. Stack and deploy: [README.md](README.md), [deploy/README.md](deploy/README.md).

## Persistence and real-time UI

- No pre-rollup for history aggregates until query cost justifies it

## Identity and config (self-hosted)

- Multi-agent panel UX — label/select machines (`AGENT_ID` already in ingest)
- **Settings → Integrations** in panel — masked keys, docs links

## Integrations (bento tiles)

Server-side fetch + cache (minutes-scale TTL). Pattern: copy `integrations/weather.service.ts`. No API keys in the browser.

### Env-key tiles

- **Service ping grid** — ICMP or HTTP checks from API cron (router, NAS, self)

### OAuth (later)

- **Gmail metadata** — unread badge in status strip (re-consent)
- **Telegram bot** — unread count or last saved message

### Narrow / defer

- **Home Assistant** — room temp/humidity; homelab-only
- **Discord** — guild bot or own account only; no local RPC / voice state

### Out of scope

- WakaTime, Oura, Trakt, Strava, Last.fm
- Mic/camera active indicators unless opt-in
- Polling third-party APIs from the React frontend

### Bento layout

- **Status strip** — Discord when wired; separate from window / machine / media
- **One live motion element** — network sparkline or CPU mini-chart from WS ticks
- No productivity scoring, distraction alerts, or work/personal guilt chips

## API / ops

- E2E coverage for production auth path — partial in `e2e/panel*.spec.ts`
- **Integration health** — per-tile stale/error flags on panel
- **Panel WS payload budgets** — as optional host fields (network, GPU) grow

## Agent telemetry (extensions)

Extend `hostPayloadSchema` in shared. Host metrics stay ephemeral — sparklines in API memory or client ring buffer, not Supabase. No WMI on the hot path.

- **`GetIfTable2` network throughput** — upload/download MB/s from adapter byte counter deltas
- **`GetSystemPowerStatus`** — AC / battery % / time remaining
- **`SetWinEventHook` (`EVENT_SYSTEM_FOREGROUND`)** — event-driven foreground; drop poll-based `active-win`
- **Optional GPU via shared memory** — Afterburner / HWiNFO SHM when present
- **Per-process network (defer)** — `GetExtendedTcpTable` + PID→name

## Agent privacy

- Locale-specific blocklist rules
- User-defined regex rules beyond `BLOCKED_APPS`

## Agent hardening

- **Circuit breaker** (`opossum`) around API calls
- **Node.js SEA** for distributable `.exe`
## Product and UX

- **Week history view** — app-switching patterns across days

## Internationalization

- Ukrainian UI localization
