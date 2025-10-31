#!/usr/bin/env bash
set -Eeuo pipefail

log() { echo ">>> $*"; }

REPO_DIR="$HOME/virtual-football-stats"
cd "$REPO_DIR"

log "repo: fetch/reset to origin/main"
git fetch origin main --prune
git reset --hard origin/main

log "node/npm versions"
node -v || true
npm -v  || true

log "pm2 stop (best effort)"
pm2 stop virtual-football-stats || true

log "npm cache clean (best effort)"
npm config set fund false --global || true
npm config set audit false --global || true
npm config set progress false --global || true
npm config set loglevel warn --global || true

# используем отдельный чистый кэш в /tmp
npm config set cache /tmp/npm-cache --global || true
rm -rf /tmp/npm-cache ~/.npm ~/.npm/_cacache ~/.cache/node-gyp || true
mkdir -p /tmp/npm-cache

log "git clean -xfd (preserve env)"
git clean -xfd -e ".env" -e ".env.local"

# --- npm ci с 3 попытками и автолечением кэша ---
attempt_ci() {
  log "npm ci (attempt $1)"
  npm ci && return 0

  log "npm ci failed — purge caches and retry"
  rm -rf node_modules /tmp/npm-cache ~/.npm ~/.npm/_cacache ~/.cache/node-gyp || true
  npm cache clean --force || true
  mkdir -p /tmp/npm-cache
  return 1
}

if ! attempt_ci 1; then
  if ! attempt_ci 2; then
    if ! attempt_ci 3; then
      echo "✖ npm ci failed after 3 attempts"; exit 1
    fi
  fi
fi

log "prisma generate (non-fatal)"
npx prisma generate || true

log "rebuild @next/swc (best effort)"
npx next telemetry disable || true
npx --yes @next/swc-linux-x64-gnu@canary >/dev/null 2>&1 || true

log "build"
npm run build

log "pm2 start"
# Если у тебя есть ecosystem.config.js — лучше:
# pm2 start ecosystem.config.js --update-env
pm2 delete virtual-football-stats || true
pm2 start "npm" --name virtual-football-stats -- start

pm2 status
echo "✓ deploy done"
