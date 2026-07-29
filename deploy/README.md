# Deploy runbook

Production = one Linux host. Caddy on the host; API in Docker; web as static files. GitHub Actions pushes on every merge to `main`.

## Mental model

```
┌─ GitHub Actions (each push to main) ─────────────────────────┐
│  build web dist → push API image to GHCR → SSH to host       │
│  SCP: docker-compose.yml + web/dist → ~/pryladova/           │
│  remote: docker compose pull && docker compose up -d         │
└──────────────────────────────────────────────────────────────┘

┌─ Host (manual one-time + occasional edits) ──────────────────┐
│  ~/pryladova/.env          API secrets (INGEST_SECRET, etc.) │
│  ~/pryladova/web/          SPA static files (CI uploads)     │
│  ~/pryladova/docker-compose.yml  (CI uploads)                │
│  /etc/caddy/pryladova.env  edge config (domain, web root)      │
│  /etc/caddy/Caddyfile      routing + panel basic_auth hash     │
└──────────────────────────────────────────────────────────────┘

┌─ Your Windows PC ────────────────────────────────────────────┐
│  apps/agent/.env           API_URL + INGEST_SECRET (pnpm dev:agent:remote) │
└──────────────────────────────────────────────────────────────┘
```

**Not auto-deployed:** `~/pryladova/.env`, Caddy config, agent env. Change those on the host/PC yourself.

## Files in this folder

| File | Used by | Purpose |
|------|---------|---------|
| [`bootstrap.sh`](bootstrap.sh) | Host (once) | Create `~/pryladova/web`, seed API `.env` |
| [`env.example`](env.example) | API container | Template for `~/pryladova/.env` |
| [`host.env.example`](host.env.example) | Caddy | Template for `/etc/caddy/pryladova.env` |
| [`Caddyfile`](Caddyfile) | Caddy | TLS, routing, basic auth for panel |
| [`../docker-compose.yml`](../docker-compose.yml) | Host Docker | Runs API image on `127.0.0.1:3000` |

## Two env files (easy to mix up)

| File on host | Variables | Consumed by |
|--------------|-----------|-------------|
| `~/pryladova/.env` | `INGEST_SECRET`, `GEMINI_*`, `PORT` | API Docker container |
| `/etc/caddy/pryladova.env` | `PRYLADOVA_DOMAIN`, `PRYLADOVA_WEB_ROOT` | Caddy process |
| `/etc/caddy/Caddyfile` | Panel `basic_auth` bcrypt hash | Caddy (server-only; not in env) |

Same name pattern on `.env` files, different jobs. API secrets never go in the Caddy env file.

## First-time host setup

On the Linux host (Ubuntu assumed; adjust paths if user is not `ubuntu`).

### 1. Prerequisites

- Docker Engine + Compose plugin
- [Caddy](https://caddyserver.com/docs/install)
- DNS A record for your domain → host IP (e.g. DuckDNS)

### 2. Bootstrap API layout

```bash
git clone https://github.com/heigee/pryladova.git   # or your fork
cd pryladova
chmod +x deploy/bootstrap.sh
./deploy/bootstrap.sh
```

Edit API env:

```bash
nano ~/pryladova/.env
# Required: INGEST_SECRET=<long random string>
# Optional: GEMINI_API_KEY, GEMINI_MODEL
```

### 3. Caddy edge config

**Env file** (domain + web root):

```bash
sudo cp deploy/host.env.example /etc/caddy/pryladova.env
sudo nano /etc/caddy/pryladova.env
```

Set `PRYLADOVA_DOMAIN` and `PRYLADOVA_WEB_ROOT` (usually `/home/<user>/pryladova/web`).

Load env into Caddy (systemd drop-in):

```bash
sudo mkdir -p /etc/systemd/system/caddy.service.d
sudo tee /etc/systemd/system/caddy.service.d/pryladova.conf <<'EOF'
[Service]
EnvironmentFile=/etc/caddy/pryladova.env
EOF
sudo systemctl daemon-reload
```

**Caddyfile** (routing + panel password hash):

```bash
# Option A: this app is the only site on the host
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile

# Option B: other sites already on the host — add to existing Caddyfile:
#   import /home/ubuntu/pryladova/deploy/Caddyfile
```

Replace both `REPLACE_WITH_BCRYPT_HASH` lines in `/etc/caddy/Caddyfile` with your hash (`caddy hash-password`). **Do not commit the real hash.** When updating the Caddyfile from repo later, re-paste your existing hash.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --envfile /etc/caddy/pryladova.env
sudo systemctl restart caddy
```

`validate` needs `--envfile` — without it `{$PRYLADOVA_DOMAIN}` is empty, the opening `{` becomes a global block, and `@ingest` errors. Use `restart` (not `reload`) after changing `pryladova.env`.

### 4. GitHub Actions secrets

Repo → Settings → Secrets → Actions → Repository secrets:

| Secret | How to get it |
|--------|----------------|
| `VPS_SSH_KEY` | Private key that can SSH as deploy user |
| `VPS_HOST` | Host IP or hostname |
| `VPS_USER` | SSH user (optional; default `ubuntu`) |
| `VPS_SSH_KNOWN_HOST` | `ssh-keyscan -H <VPS_HOST> 2>/dev/null` |

Ensure the deploy user can run `docker` without sudo (in `docker` group):

```bash
sudo usermod -aG docker <USER>
```

### 5. First deploy

Merge to `main`. Workflow builds image, uploads web + compose, restarts API container.

### 6. Windows agent (remote API)

`apps/agent/.env` on your PC:

```env
API_URL=https://<PRYLADOVA_DOMAIN>
INGEST_SECRET=<same value as ~/pryladova/.env>
```

```powershell
pnpm dev:agent:remote
```

Startup logs `profile=remote api=https://...`. Local API stays `pnpm dev:agent` (`DEV_API_URL`).

## What each deploy does

From [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml):

1. Build `apps/web` → `dist/`
2. Build + push `ghcr.io/heigee/pryladova-api:latest` (and `:sha`)
3. SSH: `mkdir -p ~/pryladova/web`
4. SCP `docker-compose.yml` → `~/pryladova/`
5. SCP `apps/web/dist/*` → `~/pryladova/web/`
6. Remote: `docker login ghcr.io` → `docker compose pull` → `docker compose up -d`

Web files update immediately. API restarts with the new image. No Caddy reload unless you changed Caddy config manually.

## Verify

On the host:

```bash
curl -s http://127.0.0.1:3000/api/health          # {"ok":true}
docker compose -f ~/pryladova/docker-compose.yml ps
```

From your PC:

```bash
# Panel (will prompt for basic auth)
curl -u admin: https://<PRYLADOVA_DOMAIN>/api/telemetry

# Ingest (replace SECRET)
curl -X POST https://<PRYLADOVA_DOMAIN>/api/telemetry \
  -H "Authorization: Bearer SECRET" \
  -H "Content-Type: application/json" \
  -d '{"appName":"Test","windowTitle":"Hi","capturedAt":"2026-01-01T00:00:00.000Z"}'
```

## Routing reference

| Request | Edge auth | App auth |
|---------|-----------|----------|
| `GET /` (SPA) | Caddy basic auth | — |
| `GET /api/*` (panel) | Caddy basic auth | — |
| `POST /api/telemetry`, `POST /api/host` | None | Nest `INGEST_SECRET` Bearer |

## Troubleshooting

| Symptom | Check |
|---------|-------|
| 502 on `/api/*` | `docker compose ps` in `~/pryladova`; `curl localhost:3000/api/health` |
| Agent 401 | `INGEST_SECRET` match between agent `.env` and `~/pryladova/.env` |
| Panel 401 | Caddy `basic_auth` user/password; hash in `/etc/caddy/Caddyfile` |
| Caddy fails to start | `sudo caddy validate --config /etc/caddy/Caddyfile --envfile /etc/caddy/pryladova.env`; env vars set? |
| `docker pull` 403 | GHCR package visibility; deploy workflow logs in via `GITHUB_TOKEN` |
