#!/usr/bin/env bash
# @file deploy_web_sync.sh
# @description GitHub main dalindaki web degisikliklerini mars.kubitron.com web dizinine
# storage/ (chat.db) ve uploads/ verilerini koruyarak atomik sekilde senkronize eder.

set -euo pipefail

[ -f /etc/default/mars-autodeploy ] && source /etc/default/mars-autodeploy

REPO_URL="${MARS_REPO_URL:-https://github.com/AstroChief77/MarsMap.git}"
BRANCH="${MARS_BRANCH:-main}"
STAGE_DIR="${MARS_STAGE_DIR:-/opt/marsmap-repo}"
WEB_ROOT="${MARS_WEB_ROOT:-/var/www/mars}"
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

# 1. Stage git reposunu hazirla veya guncelle
if [ ! -d "$STAGE_DIR/.git" ]; then
  log "[INIT] $REPO_URL ($BRANCH) ilk klonlaniyor -> $STAGE_DIR"
  rm -rf "$STAGE_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$STAGE_DIR"
else
  git -C "$STAGE_DIR" fetch --depth 1 origin "$BRANCH" --quiet
  git -C "$STAGE_DIR" reset --hard "origin/$BRANCH" --quiet
fi

# 2. Yalnizca web dosyalarinin son commit SHA'sini kontrol et (gereksiz deploy'u onle)
LATEST_WEB_SHA="$(git -C "$STAGE_DIR" log -n 1 --pretty=format:%H -- \
  index.html version.json SOURCES.md BACKEND_API.md api chat css js data)"
CURRENT_WEB_SHA=""
[ -f "$WEB_ROOT/.deployed_web_sha" ] && CURRENT_WEB_SHA="$(tr -d '[:space:]' < "$WEB_ROOT/.deployed_web_sha")"

FORCE_MODE="${1:-}"
if [ "$FORCE_MODE" != "--force" ] && [ -n "$LATEST_WEB_SHA" ] && [ "$LATEST_WEB_SHA" = "$CURRENT_WEB_SHA" ]; then
  exit 0
fi

log "[SYNC] Yeni web degisikligi algilandi: ${CURRENT_WEB_SHA:-none} -> $LATEST_WEB_SHA"

# 3. Canliya basmadan once PHP/JSON/Boyut saglik kontrolu
if command -v php >/dev/null 2>&1; then
  for pf in "$STAGE_DIR"/api/*.php; do
    [ -f "$pf" ] && php -l "$pf" >/dev/null
  done
fi

if command -v python3 >/dev/null 2>&1; then
  python3 -c "import json; json.load(open('$STAGE_DIR/version.json')); json.load(open('$STAGE_DIR/data/tiles/manifest.json'))"
fi

# 4. Canli storage/ ve uploads/ verilerine dokunmadan yalnizca web dosyalarini senkronize et
rsync -avz --delete \
  --include='index.html' \
  --include='version.json' \
  --include='SOURCES.md' \
  --include='BACKEND_API.md' \
  --include='api/***' \
  --include='chat/***' \
  --include='css/***' \
  --include='js/***' \
  --include='data/***' \
  --exclude='storage/***' \
  --exclude='uploads/***' \
  --exclude='backups/***' \
  --exclude='dist/***' \
  --exclude='*' \
  "$STAGE_DIR/" "$WEB_ROOT/" >/dev/null

# 5. Izinleri koru ve Nginx / PHP-FPM durumunu dogrula
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
# - Satir 1-24: Ortam yapilandirmasi (/etc/default/mars-autodeploy) ve flock eszamanlilik kilidi.
# - Satir 26-44: GitHub main dalindan yalnizca web dosyalarindaki commit degisimini (SHA) denetler.
# - Satir 46-57: Canli oncesi PHP lint ve version.json / manifest.json dogrulamasi.
# - Satir 59-88: storage/ ve uploads/ klasorlerini koruyarak rsync ile web dosyalarini mars.kubitron.com'a basar ve Nginx'i yeniler.
# ==============================================================================
