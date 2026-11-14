#!/usr/bin/env bash
# ==============================================================================
# AstroChief MarsMap - Linux Test Paketi BaÅŸlatÄ±cÄ±sÄ± (launch-linux.sh)
# ==============================================================================
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${ASTROCHIEF_PORT:-3080}"

echo "========================================================"
echo " [AstroChief] Linux Yerel Test Sunucusu Baslatiliyor..."
echo " Dizin : $APP_DIR"
echo " Adres : http://127.0.0.1:$PORT/"
echo "========================================================"

cd "$APP_DIR"

if command -v xdg-open >/dev/null 2>&1; then
  (sleep 1 && xdg-open "http://127.0.0.1:$PORT/" >/dev/null 2>&1) &
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 -m http.server "$PORT" --bind 127.0.0.1
elif command -v python >/dev/null 2>&1; then
  exec python -m SimpleHTTPServer "$PORT"
elif command -v php >/dev/null 2>&1; then
  exec php -S "127.0.0.1:$PORT" -t "$APP_DIR"
elif command -v busybox >/dev/null 2>&1; then
  exec busybox httpd -f -p "127.0.0.1:$PORT" -h "$APP_DIR"
else
  echo "[HATA] Python3, PHP veya BusyBox HTTP sunucusu bulunamadi."
  exit 1
fi

# ==============================================================================
# DOSYA SATIR VE Ä°ÅLEV AÃ‡IKLAMALARI (SatÄ±r SatÄ±r Ne Ä°ÅŸe YaradÄ±ÄŸÄ±):
# ------------------------------------------------------------------------------
# - SatÄ±r 1-5: POSIX Bash baÅŸlÄ±ÄŸÄ± ve hata durumunda gÃ¼venli Ã§Ä±kÄ±ÅŸ ayarÄ±.
# - SatÄ±r 7-14: Uygulama dizinini ve hedef portu (3080) tespit edip bilgi yazdÄ±rÄ±r.
# - SatÄ±r 16-20: MasaÃ¼stÃ¼ ortamÄ± varsa varsayÄ±lan Linux tarayÄ±cÄ±sÄ±nÄ± aÃ§ar.
# - SatÄ±r 22-32: Sistemde mevcut python3, python, php veya busybox Ã¼zerinden ES6 uyumlu yerel sunucuyu baÅŸlatÄ±r.
# ==============================================================================
