#!/usr/bin/env bash
cd "$(dirname "$0")/backend"

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
