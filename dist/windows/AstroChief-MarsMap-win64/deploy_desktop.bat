@echo off
:: ============================================================================
:: AstroChief - Masaüstüne Güncel Sürüm Yükleyici (deploy_desktop.bat)
:: ============================================================================

title AstroChief Desktop Deploy
cd /d "%~dp0"

echo [AstroChief] Guncel surum masaustune kopyalaniyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy_desktop.ps1"

pause

:: ============================================================================
:: DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
:: ----------------------------------------------------------------------------
:: - Satır 1: @echo off; komut satırı çıktılarının gereksiz tekrarlanmasını engeller.
:: - Satır 2-4: Başlık yorum bloğu.
:: - Satır 6: title komutu ile konsol pencere başlığını belirler.
:: - Satır 7: cd /d "%~dp0" ile betiğin bulunduğu proje klasörüne geçer.
:: - Satır 9: Kullanıcıya kopyalama işleminin başladığını bildirir.
:: - Satır 10: PowerShell'i Bypass yetkisiyle çalıştırıp deploy_desktop.ps1 betiğini yürütür.
:: - Satır 12: pause; işlem sonrası konsol penceresinin hemen kapanmasını önler.
:: ============================================================================
