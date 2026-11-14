#!/usr/bin/env bash
# ==============================================================================
# AstroChief MarsMap - Linux Test Paketi Başlatıcısı (launch-linux.sh)
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
# DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
# ------------------------------------------------------------------------------
# - Satır 1-5: POSIX Bash başlığı ve hata durumunda güvenli çıkış ayarı.
# - Satır 7-14: Uygulama dizinini ve hedef portu (3080) tespit edip bilgi yazdırır.
# - Satır 16-20: Masaüstü ortamı varsa varsayılan Linux tarayıcısını açar.
# - Satır 22-32: Sistemde mevcut python3, python, php veya busybox üzerinden ES6 uyumlu yerel sunucuyu başlatır.
# ==============================================================================
