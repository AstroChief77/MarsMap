@echo off
:: ============================================================================
:: AstroChief - Tek Tikla Windows + Linux Derleme ve Masaustu Dagitim Araci
:: ============================================================================
title AstroChief Automated Build Tool
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\build_tool.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo [HATA] Derleme basarisiz oldu!
    pause
    exit /b %ERRORLEVEL%
)
echo [TAMAM] Windows, Linux paketleri ve Masaustu surumu guncellendi.

:: ============================================================================
:: DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
:: ----------------------------------------------------------------------------
:: - Satır 1-7: Komut istemcisi başlığı ayarlar, proje köküne geçer ve tools/build_tool.ps1 aracını çalıştırır.
:: - Satır 8-13: Hata varsa duraklatır, başarılıysa tamamlandı bilgisi yazdırır.
:: ============================================================================
