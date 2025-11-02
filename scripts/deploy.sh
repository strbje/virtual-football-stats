#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/virtual-football-stats"
export NEXT_TELEMETRY_DISABLED=1

cd "$APP_DIR"

echo ">>> fetch/reset"
git fetch --prune origin
git reset --hard origin/main
rm -f .git/*.lock || true

echo ">>> stop app"
pm2 stop virtual-football-stats || true

echo ">>> clean build artifacts"
rm -rf .next .turbo .cache

echo ">>> clean install (fresh node_modules)"
# Корректно чистим node_modules, включая скрытые файлы
if [ -d node_modules ]; then
  # иногда права “залипают” — возвращаем доступ на удаление
  chmod -R u+rw node_modules 2>/dev/null || true
  # удаляем содержимое (включая скрытые), затем сам каталог
  bash -lc 'shopt -s dotglob nullglob; rm -rf node_modules/* node_modules/.* 2>/dev/null || true'
  rmdir node_modules 2>/dev/null || true
fi

npm ci --no-audit --omit=optional

echo ">>> verify next internals"
test -f node_modules/next/dist/compiled/@napi-rs/triples/index.js || { echo "next compiled missing"; exit 1; }

echo ">>> prisma"
npx prisma generate || true

echo ">>> build"
npm run build

echo ">>> start"
NODE_ENV=production pm2 start "$APP_DIR/ecosystem.config.js" --update-env
pm2 save
pm2 status
