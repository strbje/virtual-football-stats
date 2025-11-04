#!/usr/bin/env bash
set -euo pipefail

APP_NAME="virtual-football-stats"
APP_DIR="$HOME/virtual-football-stats"
SECRETS_ENV="$HOME/secrets/virtual-football-stats.env"
PORT="${PORT:-3000}"

log(){ echo ">>> $*"; }

log "restore .env"
mkdir -p "$(dirname "$SECRETS_ENV")"
[[ -f "$SECRETS_ENV" ]] || { echo "ERROR: $SECRETS_ENV not found"; exit 42; }
ln -sf "$SECRETS_ENV" "$APP_DIR/.env"

cd "$APP_DIR"

log "fetch/reset"
git fetch origin main -q || true
git reset --hard origin/main

log "stop app (ignore if missing)"
pm2 delete "$APP_NAME" 2>/dev/null || true

log "purge build artifacts"
rm -rf .next

log "drop node_modules atomically"
if [[ -d node_modules ]]; then
  mv node_modules "node_modules.trash.$RANDOM" || true
fi
rm -rf node_modules.trash.* >/dev/null 2>&1 || true

log "npm cache bootstrap"
mkdir -p "$HOME/.npm/_cacache/tmp" || true
npm config set fund false
npm config set audit false

log "npm ci (or fallback to install)"
if ! npm ci; then
  npm install --no-audit --no-fund
fi

log "ensure styled-jsx present (next require-hook)"
if ! node -e "require('styled-jsx/package.json')" >/dev/null 2>&1; then
  npm i -D styled-jsx
fi

log "prisma generate (best-effort)"
npx prisma generate || true

log "build"
npm run build

log "free port $PORT if busy"
if ss -lntp 2>/dev/null | grep -q ":$PORT "; then
  fuser -k "$PORT/tcp" 2>/dev/null || true
fi

log "start app"
PORT="$PORT" pm2 start npm --name "$APP_NAME" -- start
pm2 save

log "done"
