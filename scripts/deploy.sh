#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$HOME/virtual-football-stats"
APP_NAME="virtual-football-stats"

export NEXT_TELEMETRY_DISABLED=1
export npm_config_update_notifier=false

log(){ printf "\n>>> %s\n" "$*"; }

cd "$APP_DIR"

log "fetch/reset"
git fetch --prune origin
git reset --hard origin/main
rm -f .git/*.lock || true

log "stop app"
pm2 stop "$APP_NAME" || true

log "purge build artifacts"
rm -rf .next .turbo .cache || true

log "prepare clean install (atomically drop node_modules)"
TS="$(date +%s)"
if [ -d node_modules ]; then
  # выносим папку целиком, чтобы ничего её не держало
  mv node_modules "node_modules.__old__$TS" || true
fi

log "npm cache clean"
npm cache clean --force || true

install_once () {
  # точные версии — по lock-файлу
  npm ci --no-audit --omit=optional
}

log "install deps (npm ci, attempt 1)"
if ! install_once; then
  log "install failed, retry after hard cleanup"
  # если вдруг внутри остался мусор — подчистим
  rm -rf node_modules || true
  npm cache clean --force || true
  log "install deps (npm ci, attempt 2)"
  install_once
fi

# старые node_modules удаляем асинхронно (не блокируем сборку)
if [ -d "node_modules.__old__$TS" ]; then
  log "clean old node_modules in background"
  (rm -rf "node_modules.__old__$TS" >/dev/null 2>&1 || true) &
fi

log "verify next internals"
# быстрый sanity-check, чтобы рано упасть, если next не поставился
if [ ! -f node_modules/next/package.json ]; then
  echo "next is not installed (node_modules/next missing)"; exit 1;
fi
# иногда сборка падает без компилированных пакетов
test -f node_modules/next/dist/compiled/@napi-rs/triples/index.js || {
  echo "next compiled subdeps missing"; exit 1;
}

log "prisma generate (non-fatal)"
# у некоторых окружений бывают скачки сети — не валим билд, если generate отваливается
npx prisma generate || true

log "build"
npm run build

log "start pm2"
NODE_ENV=production pm2 start "$APP_DIR/ecosystem.config.js" --only "$APP_NAME" --update-env
pm2 save
pm2 status

