#!/usr/bin/env bash
set -euo pipefail

cd ~/virtual-football-stats

echo ">>> repo: fetch/reset to origin/main"
git fetch origin main
git reset --hard origin/main

echo ">>> node/npm versions"
node -v
npm -v

echo ">>> npm cleanup (cache + node_modules + .next)"
npm cache clean --force >/dev/null 2>&1 || true
rm -rf node_modules .next

echo ">>> npm ci (clean install, ignore lifecycle scripts)"
npm ci --no-audit --no-fund --ignore-scripts

echo ">>> prisma generate (manual)"
npx prisma generate || true

echo ">>> build"
npm run build

echo ">>> pm2 reload"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save

echo ">>> healthcheck (wait up to 30s)"
for i in {1..30}; do
  if curl -sfI http://127.0.0.1:3000/api/health >/dev/null; then
    echo "health: OK"
    exit 0
  fi
  sleep 1
done

echo "health: FAIL"
ls -la .next || true
pm2 logs --lines 200 || true
exit 1
