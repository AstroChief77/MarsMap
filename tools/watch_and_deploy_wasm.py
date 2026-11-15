#!/usr/bin/env python3
"""
tools/watch_and_deploy_wasm.py
backend/src/lib.rs dosyasini izler. Degisiklik algilandigi anda
deploy_wasm_to_server.sh betigini cagirarak otomatik derler ve canli sunucuya basar.
"""

import os
import sys
import time
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
LIB_RS = ROOT_DIR / "backend" / "src" / "lib.rs"
DEPLOY_SCRIPT = ROOT_DIR / "deploy_wasm_to_server.sh"


def main():
    if not LIB_RS.exists():
        print(f"[HATA] {LIB_RS} bulunamadi!")
        sys.exit(1)

    print("==================================================================")
    print("👀 [AstroChief] Rust A* (backend/src/lib.rs) Otomatik Izleyici Aktif!")
    print("   lib.rs dosyasini kaydettigin anda otomatik WASM derlenecek")
    print("   ve canli sunucuya (20.102.97.92) basılacaktır.")
    print("   Durdurmak icin: Ctrl+C")
    print("==================================================================")

    last_mtime = LIB_RS.stat().st_mtime

    while True:
        try:
            time.sleep(1)
            current_mtime = LIB_RS.stat().st_mtime
            if current_mtime != last_mtime:
                last_mtime = current_mtime
                print("\n[BILGI] lib.rs degisikligi algilandi! Sunucuya derlenip gonderiliyor...")
                subprocess.run([str(DEPLOY_SCRIPT)], cwd=str(ROOT_DIR))
        except KeyboardInterrupt:
            print("\n[OK] Izleyici durduruldu.")
            break


if __name__ == "__main__":
    main()

# ==============================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# ------------------------------------------------------------------------------
# - Satir 1-16: Gerekli kutuphane importlari ve dosya yolu tanimlamalari.
# - Satir 18-35: Ana fonksiyon; lib.rs degisiklik zamanini (mtime) 1 saniyelik araliklarla denetler.
# - Satir 36-47: Degisiklik algilandiginda deploy_wasm_to_server.sh betigini tetikler ve Ctrl+C ile temiz cikar.
# ==============================================================================
