#!/usr/bin/env bash
# ==============================================================================
# AstroChief MarsMap - Tek Komutla Linux/Windows Algilayan Derleme Baslaticisi
# ==============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

exec python3 "$ROOT_DIR/tools/build.py" "$@"

# ==============================================================================
# DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
# ------------------------------------------------------------------------------
# - Satır 1-5: POSIX Bash başlığı ve hata durumunda güvenli çıkış ayarı.
# - Satır 7-8: Proje kök dizinine geçer.
# - Satır 10: İşletim sistemini algılayıp derleme ve Masaüstü yüklemesini yapan tools/build.py aracını çalıştırır.
# ==============================================================================
