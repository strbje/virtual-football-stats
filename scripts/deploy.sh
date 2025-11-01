#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/virtual-football-stats"

log() { echo ">>> $*"; }

export NODE_ENV=production
export NEXT_TELEMETRY_DISABLED=1

cd "$APP_DIR"

log "repo: fetch/reset to origin/main"
git fetch --prune origin
git reset --hard origin/main
rm -f .git/index.lock .git/refs/remotes/origin/main.lock || true

log "node/npm versions"
node -v || true
npm -v  || true

log "pm2 stop (best effort)"
pm2 stop virtual-football-stats || true

log "purge build artifacts (ONLY .next)"
rm -rf .next .turbo .cache || true

# НИЧЕГО не трогаем в node_modules
# НЕ чистим next/dist/compiled, НЕ удаляем styled-jsx

log "install deps (npm ci)"
npm ci --no-audit --no-fund

log "prisma generate (non-fatal)"
npx prisma generate || true

log "build"
npm run build

log "start via PM2"
pm2 start "$APP_DIR/ecosystem.config.js" --update-env
pm2 save
pm2 status
