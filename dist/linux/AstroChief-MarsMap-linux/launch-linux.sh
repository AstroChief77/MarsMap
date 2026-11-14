#!/usr/bin/env bash
# ==============================================================================
# AstroChief MarsMap - Linux Test Paketi BaÅŸlatÄ±cÄ±sÄ± (launch-linux.sh)
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
  exec python3 -c "
import functools, http.server, socketserver
class AstroHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript; charset=utf-8',
        '.mjs': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.woff2': 'font/woff2',
        '.woff': 'font/woff',
        '.svg': 'image/svg+xml'
    }
socketserver.TCPServer.allow_reuse_address = True
with socketserver.ThreadingTCPServer(('127.0.0.1', int('$PORT')), functools.partial(AstroHandler, directory='$APP_DIR')) as httpd:
    httpd.serve_forever()
"
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
# - SatÄ±r 7-15: Uygulama dizinini, hedef portu (3080) ve --no-browser bayraÄŸÄ±nÄ± ayarlar.
# - SatÄ±r 19-21: MasaÃ¼stÃ¼ oturumu varsa varsayÄ±lan tarayÄ±cÄ±yÄ± aÃ§ar.
# - SatÄ±r 23-41: Python3 ile .js/.woff2/.woff/.json MIME tiplerini garantileyen yerel HTTP sunucusunu baÅŸlatÄ±r.
# - SatÄ±r 42-49: Python2, PHP veya BusyBox yedek baÅŸlatÄ±cÄ± seÃ§enekleri.
# ==============================================================================
