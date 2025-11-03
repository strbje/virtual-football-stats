#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="virtual-football-stats"
PORT="3000"
SECRET_ENV="$HOME/secrets/virtual-football-stats.env"
ROOT_ENV=".env"

log(){ echo ">>> $*"; }

# 0) Заходим в корень репозитория
cd "$(dirname "${BASH_SOURCE[0]}")"/..  # scripts/.. -> repo root

# 1) Подтягиваем код
log "fetch/reset"
git fetch --all -p
git reset --hard origin/main

# 2) Возвращаем .env после reset
if [[ ! -f "$ROOT_ENV" ]]; then
  if [[ -f "$SECRET_ENV" ]]; then
    cp "$SECRET_ENV" "$ROOT_ENV"
    log "restored .env from $SECRET_ENV"
  else
    echo "err: .env not found. Put it in repo root or at $SECRET_ENV" >&2
    exit 42
  fi
fi

# 3) Останавливаем возможные ранние процессы
log "stop pm2 app if any"
pm2 delete "$APP_NAME" >/dev/null 2>&1 || true

log "free port :$PORT if busy"
if command -v lsof >/dev/null 2>&1; then
  lsof -t -i:"$PORT" | xargs -r kill -9 || true
fi

# 4) Чистим артефакты
log "purge build artifacts"
rm -rf .next dist

log "drop node_modules atomically"
if [[ -d node_modules ]]; then
  rsync -a --delete --include='*/' --exclude='*' node_modules/ node_modules.__empty__/ || true
  rm -rf node_modules node_modules.__empty__ || true
fi

# 5) Ставим зависимости
log "npm cache clean"
npm cache clean --force

log "npm ci"
npm ci --prefer-offline --no-audit --no-fund

# 6) Prisma (best-effort — но с env уже на месте)
log "prisma generate"
npx prisma generate || true

# 7) Сборка Next
log "build"
npm run build

# 8) Старт через PM2 с актуальными переменными окружения
log "start app"
pm2 start npm --name "$APP_NAME" -- start -p "$PORT" --update-env
pm2 save >/dev/null 2>&1 || true

log "done"
