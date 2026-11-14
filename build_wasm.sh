#!/usr/bin/env bash
cd "$(dirname "$0")/backend" || exit 1

echo "==================================================="
echo "[AstroChief] Rust WebAssembly Modülü Derleniyor..."
echo "Hedef Dizin: ../js/wasm/"
echo "==================================================="

rustup target add wasm32-unknown-unknown
wasm-pack build --target web --out-dir ../js/wasm -- --features wasm

if [ $? -eq 0 ]; then
    echo "[BAŞARILI] WASM modülü js/wasm/ altına çıkarıldı!"
else
    echo "[BİLGİ] wasm-pack kurulu değilse: 'cargo install wasm-pack' çalıştırınız."
fi

# ==========================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# --------------------------------------------------------------------------
# - Satir 1-7: Betik basligi ve backend dizinine gecis.
# - Satir 9-10: wasm32-unknown-unknown hedefini ekleyip wasm-pack ile js/wasm/ altina derleme.
# - Satir 12-16: Derleme sonucunun kontrolu ve kullanici bilgilendirmesi.
# ==========================================================================
