#!/usr/bin/env bash
set -eEuo pipefail

REPO_DIR="$HOME/virtual-football-stats"

log(){ echo ">>> $*"; }
on_err(){ echo "✖ deploy failed"; pm2 logs --lines 200 || true; }
trap on_err ERR

cd "$REPO_DIR"

log "repo: fetch/reset to origin/main"
git fetch --all
git reset --hard origin/main

log "node/npm versions"
node -v; npm -v

# ---------- stop app (best effort)
log "pm2 stop (best effort)"
pm2 stop virtual-football-stats || true

# ---------- housekeeping
log "npm cache clean (best effort)"
npm cache clean --force || true

log "git clean -xfd (preserve env)"
git clean -xfd -e .env -e .env.local || true

# ---------- npm network settings & cache dirs
export NPM_CONFIG_REGISTRY="https://registry.npmjs.org"
export NPM_CONFIG_CACHE="/tmp/npm-cache"
export NPM_CONFIG_PREFER_ONLINE=true
export NPM_CONFIG_FETCH_RETRIES=6
export NPM_CONFIG_FETCH_RETRY_FACTOR=2
export NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000
export NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000
mkdir -p "$NPM_CONFIG_CACHE"

purge_all_caches () {
  log "purge: ~/.npm/_cacache + $NPM_CONFIG_CACHE"
  rm -rf "$HOME/.npm/_cacache" "$NPM_CONFIG_CACHE"
  mkdir -p "$NPM_CONFIG_CACHE"
  npm cache clean --force || true
}

npm_install_with_retries () {
  # 1) две попытки npm ci с полным сбросом кэша между ними
  for i in 1 2; do
    log "npm ci (attempt $i)"
    if npm ci --no-audit --no-fund; then
      return 0
    fi
    log "npm ci failed — will purge caches and retry"
    purge_all_caches
  done
  # 2) fallback: обычный install (чаще пережёвывает повреждённые тарболы)
  log "fallback to npm install"
  npm install --no-audit --no-fund
}

npm_install_with_retries

# ---------- prisma client (non-fatal if schema absent)
log "prisma generate (manual, non-fatal)"
npx prisma generate || true

# ---------- swc sometimes needs a gentle rebuild
log "rebuild @next/swc (best effort)"
npm rebuild @next/swc @next/swc-linux-x64-gnu || true

# ---------- build
log "build"
npm run build

# ---------- run/reload
log "pm2 reload"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save || true

# ---------- healthcheck (api route preferred; fallback to root)
log "healthcheck (up to 30s)"
for i in {1..30}; do
  if curl -sfI http://127.0.0.1:3000/api/health >/dev/null 2>&1 \
     || curl -sfI http://127.0.0.1:3000/ >/dev/null 2>&1 ; then
    echo "health: OK"
    exit 0
  fi
  sleep 1
done

echo "health: FAIL"
pm2 logs --lines 200 || true
exit 1
