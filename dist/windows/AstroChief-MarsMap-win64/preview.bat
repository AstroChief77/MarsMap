@echo off
:: ============================================================================
:: AstroChief - Tek Tıkla Yerel Önizleme Başlatıcı (preview.bat)
:: ============================================================================

title AstroChief Preview Server
cd /d "%~dp0"

echo [AstroChief] Yerel onizleme sunucusu baslatiliyor...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"

pause

:: ============================================================================
:: DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
:: ----------------------------------------------------------------------------
:: - Satır 1: @echo off; komut satırı çıktılarının gereksiz tekrarlanmasını engeller.
:: - Satır 2-4: Başlık yorum bloğu.
:: - Satır 6: title komutu ile konsol pencere başlığını belirler.
:: - Satır 7: cd /d "%~dp0" ile betiğin bulunduğu klasöre geçiş yapar.
:: - Satır 9: Kullanıcıya bilgilendirme metni yazdırır.
:: - Satır 10: PowerShell'i Bypass yetkisi ile çalıştırıp serve.ps1 sunucusunu başlatır.
:: - Satır 12: pause; sunucu kapandığında pencerenin hemen kaybolmasını önler.
:: ============================================================================
