#!/usr/bin/env bash
set -Eeuo pipefail

cd ~/virtual-football-stats

echo ">>> repo: fetch/reset to origin/main"
git fetch origin main
git reset --hard origin/main

echo ">>> node/npm versions"
node -v
npm -v

echo ">>> pm2 stop (best effort)"
pm2 stop virtual-football-stats || true

echo ">>> purge build artifacts"
rm -rf .next node_modules || true

echo ">>> purge npm caches (user & /tmp)"
rm -rf "$HOME/.npm/_cacache" "$HOME/.npm/_logs" /tmp/npm-* /tmp/*-npm-* || true

echo ">>> npm tune retries"
npm set fetch-retries 5
npm set fetch-retry-mintimeout 20000
npm set fetch-retry-maxtimeout 120000

install_deps () {
  npm ci --no-audit --no-fund
}

echo ">>> install deps (attempt 1)"
if ! install_deps; then
  echo ">>> install failed — deep purge and retry"
  rm -rf node_modules .next || true
  rm -rf "$HOME/.npm/_cacache" "$HOME/.npm/_logs" /tmp/npm-* /tmp/*-npm-* || true
  install_deps
fi

echo ">>> prisma generate (non-fatal)"
npx prisma generate || true

echo ">>> rebuild @next/swc (best effort)"
npx next telemetry disable || true

echo ">>> build"
npm run build

echo ">>> pm2 start"
if pm2 describe virtual-football-stats >/dev/null 2>&1; then
  pm2 delete virtual-football-stats || true
fi
pm2 start ecosystem.config.js --only virtual-football-stats || pm2 start "npm" --name virtual-football-stats -- start
pm2 save

echo "✓ deploy done"
