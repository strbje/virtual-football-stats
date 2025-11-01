#!/usr/bin/env bash
set -Eeuo pipefail

# Печать строки и команды при сбое — удобнее дебажить
trap 'echo "❌ Error on line $LINENO: $BASH_COMMAND" >&2' ERR

APP_DIR="$HOME/virtual-football-stats"

echo ">>> repo: fetch/reset to origin/main"
cd "$APP_DIR"
git fetch --prune origin
git reset --hard origin/main
# на всякий — убираем возможные git-локи
rm -f .git/index.lock .git/refs/remotes/origin/main.lock || true

echo ">>> node/npm versions"
node -v || true
npm -v  || true

echo ">>> pm2 stop (best effort)"
pm2 stop virtual-football-stats || true

echo ">>> purge build artifacts"
# .next — всегда заново
rm -rf .next || true
mkdir -p .next || true

# Иногда Next держит мусор в node_modules/next/dist/compiled => чистим аккуратно
if [ -d "node_modules/next/dist/compiled" ]; then
  echo "… remove node_modules/next/dist/compiled (rimraf fallback)"
  npx -y rimraf node_modules/next/dist/compiled 2>/dev/null || true
  chmod -R u+w node_modules/next/dist/compiled 2>/dev/null || true
  rm -rf node_modules/next/dist/compiled 2>/dev/null || true
fi

# Если нужен «жёсткий» режим (например, после смены lockfile),
# можно запустить с FULL_CLEAN=1 — тогда выпилим весь node_modules.
if [ "${FULL_CLEAN:-0}" = "1" ]; then
  echo "… FULL_CLEAN: remove node_modules"
  # иногда ENOTEMPTY: лечим rimraf+chmod, затем rm -rf
  npx -y rimraf node_modules 2>/dev/null || true
  chmod -R u+w node_modules 2>/dev/null || true
  rm -rf node_modules 2>/dev/null || true
fi

echo ">>> purge user npm cache (safe)"
rm -rf "$HOME/.npm/_cacache" || true

echo ">>> install deps (npm ci)"
# --no-audit/--no-fund, чтобы не шуметь в логах; если node_modules удалён — ci с нуля
npm ci --no-audit --no-fund

echo ">>> prisma generate (non-fatal)"
npx prisma generate || true

echo ">>> prebuild"
# у тебя есть prebuild, но сделаем безопасно
npm run -s prebuild || true

echo ">>> build"
npm run -s build

echo ">>> start via PM2"
pm2 start "$APP_DIR/ecosystem.config.js" --update-env || pm2 restart virtual-football-stats --update-env || true
pm2 save || true
pm2 status
echo "✅ deploy done"
