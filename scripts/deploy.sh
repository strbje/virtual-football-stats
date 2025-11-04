#!/usr/bin/env bash
set -euo pipefail

APP_NAME="virtual-football-stats"
APP_DIR="$HOME/virtual-football-stats"
SECRETS_ENV="$HOME/secrets/virtual-football-stats.env"
PORT="${PORT:-3000}"

echo ">>> restore .env"
mkdir -p "$(dirname "$SECRETS_ENV")"
if [[ ! -f "$SECRETS_ENV" ]]; then
  echo "ERROR: $SECRETS_ENV not found. Put your env there."; exit 42
fi
ln -sf "$SECRETS_ENV" "$APP_DIR/.env"

echo ">>> fetch/reset"
cd "$APP_DIR"
git fetch origin main -q || true
git reset --hard origin/main

echo ">>> stop app (ignore if missing)"
pm2 delete "$APP_NAME" 2>/dev/null || true
pm2 delete all 2>/dev/null || true
# «ошибка» M2][ERROR] ... not found — косметика, мы её глушим выше

echo ">>> purge build artifacts"
rm -rf .next

echo ">>> drop node_modules atomically"
rm -rf node_modules

echo ">>> npm cache bootstrap"
# Иногда у GitHub Actions/чистых VM нет каталога кэша
mkdir -p "$HOME/.npm/_cacache/tmp" || true
npm config set fund false
npm config set audit false

echo ">>> npm ci (or fallback to install)"
npm ci || npm install --no-audit --no-fund

echo ">>> prisma generate (best-effort)"
# Не роняем деплой, если prisma schema вдруг не поменялась
npx prisma generate || true

echo ">>> build"
npm run build

echo ">>> start app"
# Гарантируем, что порт свободен
if ss -lntp 2>/dev/null | grep -q ":$PORT "; then
  echo ">>> free port $PORT"
  fuser -k "$PORT/tcp" 2>/dev/null || true
fi

# Один инстанс в fork-режиме
PORT="$PORT" pm2 start npm --name "$APP_NAME" -- start
pm2 save

echo ">>> done"
