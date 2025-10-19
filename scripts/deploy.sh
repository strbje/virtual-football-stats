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
