#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$HOME/virtual-football-stats"

log() { echo ">>> $*"; }

cd "$REPO_DIR"

log "repo: fetch/reset to origin/main"
git fetch --all
git reset --hard origin/main

log "node/npm versions"
node -v
npm -v

log "cleanup (node_modules, .next)"
rm -rf node_modules .next

log "npm cache clean"
npm cache verify || true
npm cache clean --force
rm -rf ~/.npm/_cacache || true

# дать npm больше шансов докачать тарболы
export NPM_CONFIG_FETCH_RETRIES=5
export NPM_CONFIG_FETCH_RETRY_FACTOR=2
export NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
export NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

# установка с 3 попытками
npm_ci_with_retries () {
  for i in 1 2 3; do
    log "npm ci (attempt $i)"
    if npm ci --no-audit --no-fund; then
      return 0
    fi
    log "npm ci failed, cleaning cache and retrying…"
    npm cache clean --force
    rm -rf ~/.npm/_cacache || true
    sleep 2
  done
  return 1
}

npm_ci_with_retries

log "prisma generate"
npx prisma generate || true

# иногда swc бинари не докачиваются — попробуем перестроить (не фейлим деплой)
log "rebuild swc (best effort)"
npm rebuild @next/swc-linux-x64-gnu || true

log "build"
npm run build

log "pm2 reload"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

log "healthcheck (wait up to 30s)"
for i in {1..30}; do
  if curl -sfI http://127.0.0.1:3000/api/health >/dev/null; then
    echo "health: OK"
    exit 0
  fi
  sleep 1
done

echo "health: FAIL"
pm2 logs --lines 200 || true
exit 1
