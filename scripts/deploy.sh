#!/usr/bin/env bash
set -euo pipefail

cd ~/virtual-football-stats

echo ">>> repo: fetch/reset to origin/main"
git fetch --all
git reset --hard origin/main

echo ">>> node/npm versions"
node -v || true
npm -v  || true

echo ">>> npm cleanup (cache + node_modules + .next)"
rm -rf node_modules .next
npm cache clean --force

# на всякий случай немного повышаем терпимость npm к сетевым глюкам
npm config set fetch-retries 5
npm config set fetch-retry-factor 2
npm config set fetch-retry-maxtimeout 60000
npm config set fetch-retry-mintimeout 10000

echo ">>> npm ci (чистая установка)"
npm ci --no-audit --no-fund

echo ">>> prisma generate (не валим деплой, если схемы нет)"
npx prisma generate || true

echo ">>> build"
npm run build

echo ">>> PM2 reload/start"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js --update-env
pm2 save

# -------- healthcheck с ретраями --------
echo ">>> healthcheck (ждём до 30с, пока поднимется next)"
for i in {1..30}; do
  if curl -sfI http://127.0.0.1:3000/api/health >/dev/null; then
    echo "health: OK"
    exit 0
  fi
  sleep 1
done

echo "health: FAIL"
echo ">>> .next содержимое:"
ls -la .next || true
echo ">>> PM2 logs (последние 200 строк):"
pm2 logs --lines 200 || true
exit 1
