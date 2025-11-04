#!/usr/bin/env bash
set -euo pipefail

APP_NAME="virtual-football-stats"
REPO_DIR="$HOME/virtual-football-stats"
SECRETS_ENV="$HOME/secrets/virtual-football-stats.env"

log(){ echo ">>> $*"; }

cd "$REPO_DIR"

# 0) .env из секретов (симлинк восстанавливаем каждый запуск)
if [[ -f "$SECRETS_ENV" ]]; then
  ln -sf "$SECRETS_ENV" "$REPO_DIR/.env"
  log "restored .env from $SECRETS_ENV"
else
  echo "err: $SECRETS_ENV not found. Put your env there." >&2
  exit 42
fi

# 1) Обновить код
log "fetch/reset"
git fetch --all -p
git reset --hard origin/main

# 2) Остановить приложение
log "stop app"
pm2 delete "$APP_NAME" || true
# добиваем хвосты на 3000
lsof -t -i:3000 | xargs -r kill -9 || true

# 3) Чистая установка зависимостей
log "purge build artifacts"
rm -rf .next dist

log "drop node_modules atomically"
if [[ -d node_modules ]]; then
  rsync -a --delete --include="*/" --exclude="*" node_modules/ node_modules.__empty__/ || true
  rm -rf node_modules node_modules.__empty__ || true
fi

log "npm cache clean"
npm cache clean --force

log "npm ci"
npm ci --prefer-offline --no-audit --no-fund

if ! node -e "require.resolve('styled-jsx/package.json')" >/dev/null 2>&1; then
  echo ">>> styled-jsx not found, installing..."
  npm i -D styled-jsx@5.1.1
fi

# 4) Prisma (best-effort)
if command -v npx >/dev/null 2>&1; then
  log "prisma generate (best-effort)"
  # экспортируем env, чтобы prisma видел DATABASE_URL
  set -a; . ./.env; set +a
  npx prisma generate || true
fi

# 5) Сборка
log "build"
npm run build

# 6) Старт через PM2 c PORT из env (если нет — 3000)
#    Надёжнее, чем "-p 3000", т.к. PM2 по-своему маршрутизирует args
log "start app"
set -a; . ./.env; set +a
PORT="${PORT:-3000}" PORT="$PORT" pm2 start npm --name "$APP_NAME" -- start

# 7) Сохранить список и проверить
pm2 save
pm2 ls || true

log "done"
