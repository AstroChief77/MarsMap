#!/usr/bin/env bash
# ==============================================================================
# AstroChief - Rust A* WASM Derle ve Canli Sunucuya (20.102.97.92) Otomatik Bas
# ==============================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$SCRIPT_DIR"

SERVER_HOST="20.102.97.92"
SERVER_USER="Adminstrator"
SERVER_PASS="AstroChief123!."
REMOTE_WASM_DIR="/var/www/marsmap.wiki/js/wasm/"

echo "=================================================================="
echo "🚀 [AstroChief] Rust A* (lib.rs) WASM Derleniyor..."
echo "=================================================================="

# 1. build_wasm.sh calistir
"$ROOT_DIR/build_wasm.sh"

echo ""
echo "=================================================================="
echo "📡 [AstroChief] Derlenen WASM sunucuya basiliyor: $SERVER_HOST"
echo "=================================================================="

ASKPASS_FILE="$(mktemp)"
cat << 'EOF' > "$ASKPASS_FILE"
#!/usr/bin/env bash
echo 'AstroChief123!.'
EOF
chmod 700 "$ASKPASS_FILE"

export SSH_ASKPASS="$ASKPASS_FILE"
export SSH_ASKPASS_REQUIRE="force"
export DISPLAY=":0"

# 2. rsync ile js/wasm/ altindaki derlenmis dosyalari sunucuya gonder (--no-times ile zaman damgasi hatasi onlenir)
setsid rsync -avz --no-t --no-perms --no-owner --no-group \
    -e "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null" \
    "$ROOT_DIR/js/wasm/" \
    "${SERVER_USER}@${SERVER_HOST}:${REMOTE_WASM_DIR}"

rm -f "$ASKPASS_FILE"

echo ""
echo "=================================================================="
echo "✅ [BASARILI] Yeni A* WASM motoru canli sunucuya (marsmap.wiki) basildi!"
echo "   Yeni egim limitleri ve maliyet katsayilari aninda aktif oldu."
echo "=================================================================="

# ==============================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# ------------------------------------------------------------------------------
# - Satir 1-13: Betik basligi, ortam degiskenleri ve sunucu baglanti parametreleri.
# - Satir 15-21: build_wasm.sh betigini cagirarak Rust lib.rs kodunu wasm-pack ile derler.
# - Satir 23-35: SSH_ASKPASS gecici kimlik dogrulayicisi ile sifreli SSH baslatir.
# - Satir 37-44: rsync uzerinden yerelde olusan js/wasm paketini /var/www/marsmap.wiki/js/wasm/ dizinine yukler.
# - Satir 46-52: Gecici dosyalari temizler ve kullaniciya basarili sonuc bildirimi verir.
# ==============================================================================
