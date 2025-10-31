#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/virtual-football-stats"

echo ">>> repo: fetch/reset to origin/main"
cd "$APP_DIR"
git fetch --prune origin
git reset --hard origin/main
rm -f .git/index.lock .git/refs/remotes/origin/main.lock || true

echo ">>> node/npm versions"
node -v || true
npm -v  || true

echo ">>> pm2 stop (best effort)"
pm2 stop virtual-football-stats || true

echo ">>> purge build artifacts"
rm -rf .next node_modules

echo ">>> purge user npm cache (safe)"
rm -rf "$HOME/.npm/_cacache" || true
rm -rf /tmp/* || true

echo ">>> install deps"
npm ci

echo ">>> prisma generate (non-fatal)"
npx prisma generate || true

echo ">>> build"
npm run build

echo ">>> start via PM2"
pm2 start "$APP_DIR/ecosystem.config.js" --update-env
pm2 save
pm2 status
