# Roadmap

Future work — not scheduled. Stack and deploy: [README.md](README.md), [deploy/README.md](deploy/README.md).

## Persistence and real-time UI

- **Supabase Realtime** direct to the browser — needs anon-key RLS; panel still needs API for ephemeral host state
- **`eventId` on telemetry** — unique constraint before agent retry queue can replay without double-counting
- **Session lock** — decide whether lock closes a segment or accrues like idle
- No pre-rollup for history aggregates until query cost justifies it

## Identity and config (self-hosted)

- Multi-agent panel UX — label/select machines (`AGENT_ID` already in ingest)
- **Integration keys on the server** — env-based secrets; configure once, restart API
- **Settings → Integrations** in panel — masked keys, docs links; full UI persistence waits on settings store
- OAuth only when API keys aren't enough — defer until more env-key tiles ship

## Integrations (bento tiles)

Server-side fetch + cache (minutes-scale TTL). Pattern: copy `integrations/weather.service.ts`. No API keys in the browser.

### Env-key tiles (ship first)

- **Home Assistant** — room temp, humidity, or entity ON/OFF; local URL + long-lived token
- **Service ping grid** — ICMP or HTTP checks from API cron (router, NAS, self)

Shipped: **GitHub** (commits today, open PRs, latest CI on 3 recent repos) and **Steam** (presence, avatar, session playtime, recently played) — env keys in API, 5m cache, bento tiles beside history.

### OAuth (later)

- **Google Calendar** — "in meeting" badge + next event
- **Last.fm** — recent 4–6 tracks grid (complements SMTC now-playing)
- **Telegram bot** — unread count or last saved message

### Narrow / defer

- **Discord** — guild bot or own account only; no local RPC / voice state

### Out of scope

- WakaTime, Oura, Trakt, Strava
- Mic/camera active indicators unless opt-in
- Polling third-party APIs from the React frontend

### Bento layout

- **Real CSS grid spans** — History left, integration tiles right (shipped for GitHub/Steam); widen further as tiles grow
- **Status strip** — Discord when wired; separate from window / machine / media
- **Day strip / timeline** — horizontal time-per-app view alongside bar chart
- **History date picker** — not just "today"
- **One live motion element** — network sparkline or CPU mini-chart from WS ticks
- **Defer `react-grid-layout`** until tile set stabilizes
- No productivity scoring, distraction alerts, or work/personal guilt chips

## API / ops

- **Horizontal scaling (multi-instance API)** — segment writes, heartbeat debounce, and stale sweep need coordination (advisory locks, outbox, or single writer)
- E2E coverage for production auth path — partial in `e2e/panel*.spec.ts`
- Reject non-raster `thumbnailDataUrl` at API/shared boundary (SVG etc.)
- Contract tests: API responses satisfy shared Zod output schemas
- **Integration health** — per-tile stale/error flags on panel
- **Panel WS payload budgets** — as optional host fields (network, GPU) grow

## Agent telemetry (extensions)

Extend `hostPayloadSchema` in shared. Host metrics stay ephemeral — sparklines in API memory or client ring buffer, not Supabase. No WMI on the hot path.

- **`GetIfTable2` network throughput** — upload/download MB/s from adapter byte counter deltas
- **`GetSystemPowerStatus`** — AC / battery % / time remaining
- **`SetWinEventHook` (`EVENT_SYSTEM_FOREGROUND`)** — event-driven foreground; drop poll-based `active-win`
- **`WTSRegisterSessionNotification`** — locked/unlocked session badge
- **Optional GPU via shared memory** — Afterburner / HWiNFO SHM when present
- **Per-process network (defer)** — `GetExtendedTcpTable` + PID→name

## Agent privacy

- Locale-specific blocklist rules
- User-defined regex rules beyond `BLOCKED_APPS`
- Blocklist matches executable tokens only (display name vs process name gaps)
- Blocked-app dedup between two different secure apps

## Agent hardening

- **Circuit breaker** (`opossum`) around API calls
- **Local retry queue** (`better-sqlite3`) — pairs with `eventId` for idempotent replay
- **Node.js SEA** for distributable `.exe`
- Graceful shutdown — `clearInterval` on SIGINT/SIGTERM (shutdown message exists; poll loop does not stop)
- `pickCurrentSession` stable tie-breaking when multiple SMTC sessions share rank
- Degrade gracefully when `active-win` fails — don't skip window telemetry after a successful host tick
- Reset track/thumbnail cache when SMTC session clears

## Product and UX

- **Multi-day history** — week view, app-switching patterns
- **`close_reason` in timeline UI** — stale vs focus_change vs shutdown
- Weather popover full a11y (arrow keys, focus trap, `aria-activedescendant`)
- Consolidate WMO weather code → icon mapping in shared
- Host CPU/RAM/media stale when host ticks stop but window telemetry still updates
- Use release from `GET /api/health` for deploy verification (web uses build-time `VITE_APP_RELEASE` today)

## Internationalization

- Ukrainian UI localization
