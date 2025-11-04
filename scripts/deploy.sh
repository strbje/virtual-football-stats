#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/virtual-football-stats"
cd "$APP_DIR"

log() { echo ">>> $*"; }

log "restore .env"
[ -f .env ] || touch .env

log "fetch/reset"
git fetch --prune origin
git reset --hard origin/main
rm -f .git/index.lock || true

log "stop app (ignore if missing)"
pm2 stop virtual-football-stats || true

log "purge build artifacts"
rm -rf .next || true

log "drop node_modules atomically"
# 1) сначала пробуем обычное удаление
if ! rm -rf node_modules 2>/dev/null; then
  # 2) локально чистим проблемные каталоги Next, которые чаще всего «залипают»
  rm -rf node_modules/next/dist/compiled 2>/dev/null || true
  rm -rf node_modules/.cache 2>/dev/null || true
  chmod -R u+w node_modules 2>/dev/null || true
  # 3) rimraf как надёжный fallback
  npx --yes rimraf node_modules || true
  # 4) крайний случай: переименовать и удалить позже — не блокирует деплой
  if [ -d node_modules ]; then
    mv node_modules "node_modules._trash_$(date +%s)" || true
  fi
fi

log "purge npm cache (safe)"
rm -rf "$HOME/.npm/_cacache" || true
npm cache verify || true

log "install deps (npm ci)"
# без скриптов — postinstall у нас не нужен, prisma сгенерим вручную
npm ci --ignore-scripts

log "prisma generate (non-fatal)"
npx prisma generate || true

log "build"
npm run -s build

log "start via PM2"
pm2 start "$APP_DIR/ecosystem.config.js" --update-env
pm2 save
pm2 status
