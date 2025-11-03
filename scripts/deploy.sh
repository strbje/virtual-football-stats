#!/usr/bin/env bash
set -euo pipefail

log() { echo ">>> $*"; }
warn(){ echo "err: $*" >&2; }

APP_NAME="virtual-football-stats"

# --- 0) .env обязательно ---
if [[ ! -f .env ]]; then
  warn ".env not found. Create it in repo root with DATABASE_URL etc."
  exit 42
fi
# Экспортим переменные из .env в окружение текущего shell
set -a
. ./.env
set +a

# Жёсткая проверка критичных переменных
: "${DATABASE_URL:?DATABASE_URL is required in .env}"
: "${NODE_ENV:=production}"

log "fetch/reset"
git fetch --all -p
git reset --hard origin/main

log "stop app"
pm2 stop "$APP_NAME" || true
pm2 list || true

log "purge build artifacts"
rm -rf .next dist || true

log "drop node_modules atomically"
if [[ -d node_modules ]]; then
  rsync -a --delete --include='*/' --exclude='*' node_modules/ node_modules.__empty__/ 2>/dev/null || true
  rm -rf node_modules node_modules.__empty__ || true
fi

log "npm cache clean"
npm cache clean --force || true

log "npm ci (attempt 1)"
if ! npm ci --prefer-offline --no-audit --no-fund; then
  warn "npm ci failed, retry after cleaning cache"
  npm cache clean --force || true
  log "npm ci (attempt 2)"
  npm ci --prefer-offline --no-audit --no-fund
fi

log "ensure next/react present"
if [[ ! -d node_modules/next ]]; then
  warn "next missing, installing explicitly"
  npm i -E next@15 react@18 react-dom@18 styled-jsx@5 --no-audit --no-fund
fi

log "prisma generate (best-effort)"
if npx --yes prisma --version >/dev/null 2>&1; then
  if ! npx prisma generate; then
    warn "prisma generate failed (non-fatal)"
  fi
else
  warn "prisma CLI not found, skipping generate"
fi

# На всякий случай чуть больше памяти сборщику (убережёт от OOM)
export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=2048"

log "build"
npm run build

log "start app"
# Важно: передаём окружение из текущего shell в PM2-процесс
pm2 start --name "$APP_NAME" npm -- start --update-env

log "done"
