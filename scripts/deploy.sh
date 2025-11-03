#!/usr/bin/env bash
set -euo pipefail

log() { echo ">>> $*"; }
err() { echo "err: $*" >&2; }

APP_NAME="virtual-football-stats"

log "fetch/reset"
git fetch --all -p
git reset --hard origin/main

log "stop app"
pm2 stop "$APP_NAME" || true
pm2 list || true

log "purge build artifacts"
rm -rf .next dist || true

log "prepare clean install (atomically drop node_modules)"
# Иногда rm -rf спотыкается на ENOTEMPTY — используем rsync-хак
if [ -d node_modules ]; then
  rsync -a --delete --include='*/' --exclude='*' node_modules/ node_modules.empty/ 2>/dev/null || true
  rm -rf node_modules node_modules.empty || true
fi

log "npm cache clean"
npm cache clean --force || true

log "install deps (npm ci, attempt 1)"
# postinstall Prisma может падать при грязном кэше — глушим его внутри package.json (у тебя уже так)
npm ci --prefer-offline --no-audit --no-fund

log "clean old node_modules in background"
( find node_modules -type d -name '__old__*' -prune -exec rm -rf {} + 2>/dev/null || true ) &

log "verify next internals"
if ! [ -d node_modules/next ]; then
  err "next is not installed (node_modules/next missing)"
  log "install next/react/react-dom/styled-jsx explicitly"
  npm i -E next@15 react@18 react-dom@18 styled-jsx@5 --no-audit --no-fund
fi

log "prisma generate (non-fatal)"
if [ -f prisma/schema.prisma ]; then
  set +e
  npx prisma generate
  set -e
fi

log "build"
npm run build

log "start app"
pm2 start --name "$APP_NAME" "npm" -- start

log "done"
