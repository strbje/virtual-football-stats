#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$HOME/virtual-football-stats"
APP_NAME="virtual-football-stats"
BRANCH="main"

cd "$APP_DIR"

echo ">>> repo: fetch/reset to origin/$BRANCH"
git fetch origin "$BRANCH" --prune
git reset --hard "origin/$BRANCH"

echo ">>> node/npm versions"
node -v || true
npm -v || true

echo ">>> pm2 stop (best effort)"
pm2 stop "$APP_NAME" || true

# ---------- npm безопасные настройки ----------
# не трогаем /etc/npmrc, используем только user config
export NPM_CONFIG_GLOBALCONFIG=/dev/null
export NPM_CONFIG_USERCONFIG="$HOME/.npmrc"
export npm_config_cache="$HOME/.npm/_cacache"
export npm_config_fetch_retries=5
export npm_config_fetch_retry_maxtimeout=600000
export npm_config_fetch_retry_mintimeout=20000
export npm_config_loglevel=warn
export npm_config_audit=false
export npm_config_fund=false

# ---------- очистка артефактов ----------
echo ">>> purge build artifacts"
rm -rf .next

echo ">>> purge npm caches (user & /tmp)"
rm -rf "$HOME/.npm/_cacache" /tmp/npm-cache 2>/dev/null || true
mkdir -p /tmp/npm-cache

echo ">>> install deps (attempt 1)"
rm -rf node_modules
# npm ci использует lockfile, никакой реконструкции зависимостей
if ! npm ci --cache /tmp/npm-cache --prefer-offline=false; then
  echo ">>> npm ci failed — deep purge & retry"
  rm -rf node_modules "$HOME/.npm/_cacache" /tmp/npm-cache
  mkdir -p /tmp/npm-cache
  npm ci --cache /tmp/npm-cache --prefer-offline=false
fi

echo ">>> prisma generate (non-fatal)"
npx prisma generate || true

echo ">>> rebuild @next/swc (best effort)"
npx next telemetry disable || true
# В новых версиях SWC собирается при build, но пусть будет:
# (если не нужен — можно удалить следующую строку)
true

echo ">>> build"
npm run build

echo ">>> pm2 start/restart"
# убедимся, что актуален ecosystem.config.js
pm2 startOrRestart ecosystem.config.js --only "$APP_NAME"

echo ">>> save pm2"
pm2 save

echo "✓ deploy done"
