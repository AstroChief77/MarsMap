#!/usr/bin/env bash
# ==============================================================================
# AstroChief MarsMap - Linux Test Paketi Başlatıcısı (launch-linux.sh)
# ==============================================================================
set -e

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="${ASTROCHIEF_PORT:-3080}"
NO_BROWSER="${1:-}"

echo "========================================================"
echo " [AstroChief] Linux Yerel Test Sunucusu Baslatiliyor..."
echo " Dizin : $APP_DIR"
echo " Adres : http://127.0.0.1:$PORT/"
echo "========================================================"

cd "$APP_DIR"

if [ "$NO_BROWSER" != "--no-browser" ] && command -v xdg-open >/dev/null 2>&1; then
  (sleep 1 && xdg-open "http://127.0.0.1:$PORT/" >/dev/null 2>&1) &
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 -c '
import functools, http.server, socketserver, sys
port = int(sys.argv[1])
app_dir = sys.argv[2]
class AstroHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "application/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".wasm": "application/wasm",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".svg": "image/svg+xml"
    }
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(("127.0.0.1", port), functools.partial(AstroHandler, directory=app_dir)) as httpd:
    httpd.serve_forever()
' "$PORT" "$APP_DIR"
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
# - Satır 7-15: Uygulama dizinini, hedef portu (3080) ve --no-browser bayrağını ayarlar.
# - Satır 19-21: Masaüstü oturumu varsa varsayılan tarayıcıyı açar.
# - Satır 23-44: Python3 ile sys.argv üzerinden güvenli argüman aktararak .wasm/.js/.woff2/.json MIME tipli yerel HTTP sunucusunu başlatır.
# - Satır 45-53: Python2, PHP veya BusyBox yedek başlatıcı seçenekleri.
# ==============================================================================
