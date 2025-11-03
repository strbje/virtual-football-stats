#!/usr/bin/env bash
set -euo pipefail

log() { echo ">>> $*"; }
warn(){ echo "err: $*" >&2; }

APP_NAME="virtual-football-stats"

log "fetch/reset"
git fetch --all -p
git reset --hard origin/main

log "stop app"
pm2 stop "$APP_NAME" || true
pm2 list || true

log "purge build artifacts"
rm -rf .next dist || true

log "drop node_modules atomically"
if [ -d node_modules ]; then
  rsync -a --delete --include='*/' --exclude='*' node_modules/ node_modules.__empty__/ 2>/dev/null || true
  rm -rf node_modules node_modules.__empty__ || true
fi

log "npm cache clean"
npm cache clean --force || true

log "npm ci"
npm ci --prefer-offline --no-audit --no-fund

log "ensure next/react present"
if ! [ -d node_modules/next ]; then
  warn "next missing, installing explicitly"
  npm i -E next@15 react@18 react-dom@18 styled-jsx@5 --no-audit --no-fund
fi

log "prisma generate (best-effort)"
if npx --yes prisma --version >/dev/null 2>&1; then
  npx prisma generate || warn "prisma generate failed (non-fatal)"
else
  warn "prisma CLI not found, skipping generate"
fi

log "build"
npm run build

log "start app"
pm2 start --name "$APP_NAME" "npm" -- start

log "done"
