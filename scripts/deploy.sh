#!/usr/bin/env bash
set -eEuo pipefail

REPO_DIR="$HOME/virtual-football-stats"

log(){ echo ">>> $*"; }
on_err(){ echo "✖ deploy failed"; pm2 logs --lines 200 || true; }
trap on_err ERR

cd "$REPO_DIR"

log "repo: fetch/reset to origin/main"
git fetch --all
git reset --hard origin/main

log "node/npm versions"
node -v; npm -v

# --- остановим процесс, чтобы файлы не были «заняты»
log "pm2 stop (best effort)"
pm2 stop virtual-football-stats || true

# --- чистый кэш npm и тотальная уборка мусора (node_modules/.next и пр.)
log "npm cache clean"
npm cache clean --force || true

log "git clean -xfd (preserve env)"
# удалит все неотслеживаемые файлы/папки (включая node_modules, .next, .turbo и т.п.)
git clean -xfd -e .env -e .env.local || true

# --- сетевые настройки npm для стабильной установки
export NPM_CONFIG_CACHE=/tmp/npm-cache
export NPM_CONFIG_PREFER_ONLINE=true
export NPM_CONFIG_FETCH_RETRIES=6
export NPM_CONFIG_FETCH_RETRY_FACTOR=2
export NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
export NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
mkdir -p "$NPM_CONFIG_CACHE"

npm_install_with_fallback () {
  for i in 1 2; do
    log "npm ci (attempt $i)"
    if npm ci --no-audit --no-fund; then
      return 0
    fi
    log "ci failed, purge cache & retry"
    rm -rf "$NPM_CONFIG_CACHE" && mkdir -p "$NPM_CONFIG_CACHE"
    npm cache clean --force || true
  done
  log "fallback to npm install"
  npm install --no-audit --no-fund
}

npm_install_with_fallback

log "prisma generate (manual, non-fatal)"
npx prisma generate || true

# иногда swc в lockfile помечается «patched», но бинарь не подтянут — попробуем мягко пересобрать
log "rebuild @next/swc (best effort)"
npm rebuild @next/swc-linux-x64-gnu || true

log "build"
npm run build

log "pm2 reload"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

log "healthcheck (up to 30s)"
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
