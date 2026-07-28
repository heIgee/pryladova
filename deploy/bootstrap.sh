#!/usr/bin/env bash
set -euo pipefail

PRYLADOVA_HOME="${PRYLADOVA_HOME:-$HOME/pryladova}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "${PRYLADOVA_HOME}/web"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker not found — install Docker Engine + Compose plugin first"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "error: docker compose plugin not found"
  exit 1
fi

if [[ ! -f "${PRYLADOVA_HOME}/.env" ]]; then
  cp "${SCRIPT_DIR}/env.example" "${PRYLADOVA_HOME}/.env"
  chmod 600 "${PRYLADOVA_HOME}/.env"
  echo "created ${PRYLADOVA_HOME}/.env — set INGEST_SECRET (and optional GEMINI_*)"
else
  echo "ok: ${PRYLADOVA_HOME}/.env exists"
fi

cat <<EOF

Host layout ready at ${PRYLADOVA_HOME}

Next:
  1. Edit ${PRYLADOVA_HOME}/.env
  2. Copy deploy/host.env.example → /etc/caddy/pryladova.env (domain + web root); set basic_auth hash in /etc/caddy/Caddyfile
  3. Configure Caddy — see deploy/README.md
  4. Add GitHub deploy secrets; push to main

EOF
