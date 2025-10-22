#!/usr/bin/env bash
set -euo pipefail

cd ~/virtual-football-stats

# тянем последний main
git fetch --all
git reset --hard origin/main

# зависимости
npm ci --no-audit --no-fund

# prisma-клиент (если схема есть)
npx prisma generate || true

# сборка
npm run build

# рестарт через PM2
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

# --- healthcheck с ретраями (ждем, пока Next.js поднимется) ---
echo ">>> healthcheck (port 3000)"
for i in {1..30}; do
  if curl -sfI http://127.0.0.1:3000/ >/dev/null; then
    echo "OK"
    exit 0
  fi
  sleep 1
done

echo "Service didn't become ready in time"
pm2 logs virtual-football-stats --lines 200
exit 1
