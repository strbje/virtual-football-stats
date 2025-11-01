#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/virtual-football-stats"

log() { echo ">>> $*"; }

safe_rm_dir() {
  # безопасное и идемпотентное удаление каталога с ретраями
  local target="$1"
  if [ -d "$target" ]; then
    chmod -R u+rwX "$target" || true
    rm -rf "$target" 2>/dev/null || true
    # если что-то удерживает файлы — подождём и повторим
    for i in 1 2 3; do
      [ -d "$target" ] || break
      sleep 1
      chmod -R u+rwX "$target" || true
      rm -rf "$target" 2>/dev/null || true
    done
    # финальный хард-клин: удаляем содержимое поэлементно
    if [ -d "$target" ]; then
      find "$target" -mindepth 1 -exec rm -rf {} + 2>/dev/null || true
      rmdir "$target" 2>/dev/null || true
    fi
  fi
}

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
pm2 stop 1 || true
pm2 stop 2 || true

log "purge build artifacts"
safe_rm_dir "node_modules"
safe_rm_dir ".next"

log "purge npm cache"
# чистим ТОЛЬКО кэш npm, не трогаем /tmp целиком
npm cache clean --force || true
rm -rf "$HOME/.npm/_cacache" || true

log "install deps (npm ci)"
# без optional, без audit/fund — стабильнее и быстрее
npm ci --omit=optional --no-audit --no-fund

# sanity-check критичных модулей, которые раньше сыпались
if [ ! -f node_modules/styled-jsx/package.json ]; then
  log "styled-jsx missing, installing explicitly"
  npm i styled-jsx@5.1.6 --no-audit --no-fund
fi
if [ ! -d node_modules/next/dist/compiled ]; then
  # такое бывает при кривом распаковке — добьём оператором rebuild
  log "next compiled bundle missing, forcing npm rebuild"
  npm rebuild --no-audit --no-fund || true
fi

log "prisma generate (non-fatal)"
npx prisma generate || true

log "prebuild"
mkdir -p .next

log "build"
npm run build

log "start via PM2"
pm2 start "$APP_DIR/ecosystem.config.js" --update-env
pm2 save
pm2 status
