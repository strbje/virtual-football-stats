#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$HOME/virtual-football-stats"
log(){ echo ">>> $*"; }

cd "$REPO_DIR"
log "repo: fetch/reset to origin/main"
git fetch --all
git reset --hard origin/main

log "node/npm versions"
node -v; npm -v

log "cleanup"
rm -rf node_modules .next
rm -rf ~/.npm ~/.cache || true

# быстрый, «чистый» кеш в /tmp + ретраи
export NPM_CONFIG_CACHE=/tmp/npm-cache
export NPM_CONFIG_TMP=/tmp
export NPM_CONFIG_PREFER_ONLINE=true
export NPM_CONFIG_FETCH_RETRIES=6
export NPM_CONFIG_FETCH_RETRY_FACTOR=2
export NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
export NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
mkdir -p "$NPM_CONFIG_CACHE"

npm_install_with_fallback () {
  for i in 1 2; do
    log "npm ci (attempt $i)"
    if npm ci --no-audit --no-fund; then return 0; fi
    log "ci failed, purge cache & retry"
    rm -rf "$NPM_CONFIG_CACHE" && mkdir -p "$NPM_CONFIG_CACHE"
  done
  log "fallback to npm install"
  npm install --no-audit --no-fund
}

npm_install_with_fallback

log "prisma generate"
npx prisma generate || true

log "rebuild swc (best effort)"
npm rebuild @next/swc-linux-x64-gnu || true

log "build"
npm run build

log "pm2 reload"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

log "healthcheck"
for i in {1..30}; do
  curl -sfI http://127.0.0.1:3000/api/health >/dev/null && { echo "health: OK"; exit 0; }
  sleep 1
done
echo "health: FAIL"; pm2 logs --lines 200 || true; exit 1
