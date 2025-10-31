#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/virtual-football-stats"
export NPM_CONFIG_CACHE="/tmp/npm-cache"
mkdir -p "$NPM_CONFIG_CACHE"

echo ">>> repo: fetch/reset to origin/main"
cd "$APP_DIR"

# Сброс возможных зависших git-локов
rm -f .git/index.lock .git/refs/remotes/origin/main.lock || true
git gc --prune=now || true
git remote prune origin || true
git fetch --prune origin
git reset --hard origin/main

echo ">>> node/npm versions"
node -v
npm -v

echo ">>> pm2 stop (best effort)"
pm2 stop "virtual-football-stats" || true

echo ">>> purge build artifacts"
rm -rf .next package-lock.json node_modules || true

echo ">>> purge npm caches (user & /tmp)"
rm -rf "$NPM_CONFIG_CACHE" ~/.npm/_cacache || true
mkdir -p "$NPM_CONFIG_CACHE"

echo ">>> npm tune retries"
npm config set fetch-retries 5
npm config set fetch-retry-factor 2
npm config set fetch-retry-maxtimeout 120000
npm config set fetch-retry-mintimeout 2000

# Гарантируем наличие проблемных пакетов до ci
echo ">>> ensure critical deps"
# styled-jsx — прод-зависимость у Next 15
npm i -S styled-jsx@^5.1.1
# tailwind/postcss — дев-зависимости; КЛАССИЧЕСКАЯ схема
npm i -D tailwindcss postcss autoprefixer

echo ">>> install deps (attempt 1)"
if ! npm ci --no-audit --prefer-offline=false; then
  echo "npm ci failed — will purge caches and retry"
  rm -rf "$NPM_CONFIG_CACHE" ~/.npm/_cacache || true
  mkdir -p "$NPM_CONFIG_CACHE"
  npm ci --no-audit --prefer-offline=false
fi

echo ">>> prisma generate (non-fatal)"
npx prisma generate || true

echo ">>> rebuild @next/swc (best effort)"
npx next telemetry disable || true

echo ">>> build"
npm run build

echo ">>> pm2 start/reload"
if pm2 describe "virtual-football-stats" >/dev/null 2>&1; then
  pm2 reload "virtual-football-stats" --update-env
else
  pm2 start ecosystem.config.js
fi

pm2 save
echo "✓ deploy done"
