@echo off
:: ============================================================================
:: AstroChief - Rust WebAssembly (WASM) Derleyici
:: ============================================================================
title AstroChief WASM Builder
cd /d "%~dp0backend"

echo ===================================================
echo [AstroChief] Rust WebAssembly Modulu Derleniyor...
echo Hedef Dizin: ../js/wasm/
echo ===================================================

rustup target add wasm32-unknown-unknown
wasm-pack build --target web --out-dir ../js/wasm -- --features wasm

if %ERRORLEVEL% EQU 0 (
    echo.
    echo [BASARILI] WASM modulu js/wasm/ altina cikarildi!
    echo Tarayicidan uygulamayi actiginizda Rust fonksiyonu dogrudan calisacaktir.
) else (
    echo.
    echo [BILGI] wasm-pack kurulu degilse: 'cargo install wasm-pack' calistiriniz.
)

pause

:: ==========================================================================
:: DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
:: --------------------------------------------------------------------------
:: - Satir 1-11: Windows toplu is betigi basligi ve backend klasorune gecis.
:: - Satir 13-14: wasm32-unknown-unknown hedefinin eklenmesi ve wasm-pack derlemesi.
:: - Satir 16-25: Hata kodu kontrolu ve kullaniciya sonuc mesajinin gosterilmesi.
:: ==========================================================================
