#!/usr/bin/env bash
# @file deploy_web_sync.sh
# @description GitHub main dalindaki web degisikliklerini mars.kubitron.com web dizinine
# storage/ (chat.db), uploads/ ve .well-known/ verilerini koruyarak senkronize eder.

set -euo pipefail

[ -f /etc/default/mars-autodeploy ] && source /etc/default/mars-autodeploy

DEPLOY_KEY_FILE="${MARS_DEPLOY_KEY:-/etc/mars-autodeploy/github_deploy_key}"
TOKEN_FILE="${MARS_TOKEN_FILE:-/etc/mars-autodeploy/github.token}"

if [ -n "${MARS_REPO_URL:-}" ]; then
  REPO_URL="$MARS_REPO_URL"
elif [ -f "$DEPLOY_KEY_FILE" ]; then
  REPO_URL="git@github.com:AstroChief77/MarsMap.git"
else
  REPO_URL="https://github.com/AstroChief77/MarsMap.git"
fi

BRANCH="${MARS_BRANCH:-main}"
STAGE_DIR="${MARS_STAGE_DIR:-/opt/marsmap-repo}"
WEB_ROOT="${MARS_WEB_ROOT:-/var/www/mars}"
WEB_OWNER="${MARS_WEB_OWNER:-}"
LOCK_FILE="${MARS_LOCK_FILE:-/run/lock/mars-web-sync.lock}"
LOG_FILE="${MARS_LOG_FILE:-/var/log/mars-autodeploy.log}"

log() {
  local ts
  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  echo "[$ts] $*" | tee -a "$LOG_FILE" 2>/dev/null || echo "[$ts] $*"
}

mkdir -p "$(dirname "$LOCK_FILE")" "$(dirname "$LOG_FILE")" "$WEB_ROOT"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

# 1. Ozel (private) GitHub deposu icin SSH Deploy Key veya HTTPS Token ayari (ps ciktisinda gorunmeyen ortam degiskenleriyle)
if [ -f "$DEPLOY_KEY_FILE" ]; then
  export GIT_SSH_COMMAND="ssh -i ${DEPLOY_KEY_FILE} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
fi
if [ -f "$TOKEN_FILE" ] && [[ "$REPO_URL" == https://github.com/* ]]; then
  GH_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
  if [ -n "$GH_TOKEN" ]; then
    AUTH_B64="$(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
    export GIT_CONFIG_COUNT=1
    export GIT_CONFIG_KEY_0="http.extraheader"
    export GIT_CONFIG_VALUE_0="Authorization: Basic ${AUTH_B64}"
  fi
fi

# 2. Stage git reposunu hazirla veya guncelle
if [ ! -d "$STAGE_DIR/.git" ]; then
  log "[INIT] $REPO_URL ($BRANCH) ilk klonlaniyor -> $STAGE_DIR"
  rm -rf "$STAGE_DIR"
  if ! git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$STAGE_DIR" 2>>"$LOG_FILE"; then
    log "[ERROR] GitHub clone basarisiz! Ozel depo ise Deploy Key (${DEPLOY_KEY_FILE}.pub) GitHub'a eklenmemis olabilir."
    exit 1
  fi
else
  if ! git -C "$STAGE_DIR" fetch --depth 1 origin "$BRANCH" --quiet 2>>"$LOG_FILE"; then
    log "[ERROR] GitHub fetch basarisiz ($REPO_URL)."
    exit 1
  fi
  git -C "$STAGE_DIR" reset --hard "origin/$BRANCH" --quiet
fi

# 3. Yalnizca web dosyalarinin son commit SHA'sini kontrol et (--depth 1 sığ klonda bos donerse HEAD SHA kullan)
LATEST_WEB_SHA="$(git -C "$STAGE_DIR" log -n 1 --pretty=format:%H -- \
  index.html version.json SOURCES.md BACKEND_API.md api chat css js data res)"
if [ -z "$LATEST_WEB_SHA" ]; then
  LATEST_WEB_SHA="$(git -C "$STAGE_DIR" rev-parse HEAD)"
fi
CURRENT_WEB_SHA=""
[ -f "$WEB_ROOT/.deployed_web_sha" ] && CURRENT_WEB_SHA="$(tr -d '[:space:]' < "$WEB_ROOT/.deployed_web_sha")"

FORCE_MODE="${1:-}"
if [ "$FORCE_MODE" != "--force" ] && [ -n "$LATEST_WEB_SHA" ] && [ "$LATEST_WEB_SHA" = "$CURRENT_WEB_SHA" ]; then
  exit 0
fi

log "[SYNC] Yeni web degisikligi algilandi: ${CURRENT_WEB_SHA:-none} -> $LATEST_WEB_SHA"

# 4. Canliya basmadan once PHP/JSON saglik kontrolu (sys.argv ile guvenli arguman aktarimi)
if command -v php >/dev/null 2>&1; then
  for pf in "$STAGE_DIR"/api/*.php; do
    [ -f "$pf" ] && php -l "$pf" >/dev/null
  done
fi

if command -v python3 >/dev/null 2>&1; then
  python3 -c '
import json, os, sys
stage = sys.argv[1]
for rel in ("version.json", "data/tiles/manifest.json", "data/datasets/jpl_mars_trek_layers.json"):
    with open(os.path.join(stage, rel), "r", encoding="utf-8") as fh:
        json.load(fh)
' "$STAGE_DIR"
fi

# 5. Canli storage/, uploads/, .well-known/ verilerine dokunmadan yalnizca web dosyalarini senkronize et
rsync -avz --delete \
  --filter='P storage/***' \
  --filter='P uploads/***' \
  --filter='P .well-known/***' \
  --filter='P .deployed_web_sha' \
  --include='index.html' \
  --include='version.json' \
  --include='SOURCES.md' \
  --include='BACKEND_API.md' \
  --include='api/***' \
  --include='chat/***' \
  --include='css/***' \
  --include='js/***' \
  --include='data/***' \
  --include='res/***' \
  --exclude='storage/***' \
  --exclude='uploads/***' \
  --exclude='.well-known/***' \
  --exclude='.deployed_web_sha' \
  --exclude='backups/***' \
  --exclude='dist/***' \
  --exclude='*' \
  "$STAGE_DIR/" "$WEB_ROOT/" >/dev/null

# 6. Dizin sahipliklerini ve Nginx / PHP-FPM durumunu koru
if [ -n "$WEB_OWNER" ] && id "${WEB_OWNER%%:*}" >/dev/null 2>&1; then
  for p in index.html version.json SOURCES.md BACKEND_API.md api chat css js data res; do
    [ -e "$WEB_ROOT/$p" ] && chown -R "$WEB_OWNER" "$WEB_ROOT/$p" || true
  done
fi

mkdir -p "$WEB_ROOT/storage" "$WEB_ROOT/uploads"
chown -R www-data:www-data "$WEB_ROOT/storage" "$WEB_ROOT/uploads" || true
chmod 770 "$WEB_ROOT/storage" || true
chmod 775 "$WEB_ROOT/uploads" || true

printf '%s\n' "$LATEST_WEB_SHA" > "$WEB_ROOT/.deployed_web_sha"

if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx >/dev/null 2>&1 || true
  else
    log "[WARN] nginx -t basarisiz oldu, mevcut Nginx sureci korundu."
  fi
fi

log "[OK] mars.kubitron.com web icerigi guncellendi (SHA: ${LATEST_WEB_SHA:0:8})."

# ==============================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# ------------------------------------------------------------------------------
# - Satir 1-38: Ortam degiskenleri, Deploy Key / HTTPS token tanimi ve flock eszamanlilik kilidi.
# - Satir 40-80: GIT_CONFIG_* ortam degiskenleriyle ps-gizli kimlik dogrulamasi ve HEAD SHA yedekli commit kontrolu.
# - Satir 82-100: Canli oncesi PHP lint ve sys.argv tabanli JSON dogrulamasi.
# - Satir 102-149: storage/, uploads/ ve .well-known/ dizinlerini koruyarak rsync + Nginx yenileme yapar.
# ==============================================================================
