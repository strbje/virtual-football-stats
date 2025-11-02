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
rm -rf node_modules
npm cache clean --force
# критично: не подсовывать production-омит на этапе сборки
unset NPM_CONFIG_PRODUCTION
unset NODE_ENV
npm ci

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
