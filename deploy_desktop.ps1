# ==============================================================================
# AstroChief - Masaüstüne Güncel Sürüm Dağıtım Betiği (deploy_desktop.ps1)
# ==============================================================================

$ErrorActionPreference = "Stop"

$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$TargetDir = Join-Path $DesktopDir "AstroChief-MarsMap"

Write-Host "[AstroChief] Kaynak Dizin : $SourceDir" -ForegroundColor Cyan
Write-Host "[AstroChief] Hedef Masaüstü: $TargetDir" -ForegroundColor Cyan

if (Test-Path $TargetDir) {
    Write-Host "[AstroChief] Önceki masaüstü test sürümü temizleniyor..." -ForegroundColor Yellow
    Remove-Item -Path $TargetDir -Recurse -Force
}

New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

$ExcludeDirs = @(".git", "backups", "logs")
$Items = Get-ChildItem -Path $SourceDir -Force | Where-Object { $ExcludeDirs -notcontains $_.Name }

foreach ($Item in $Items) {
    $DestPath = Join-Path $TargetDir $Item.Name
    if ($Item.PSIsContainer) {
        Copy-Item -Path $Item.FullName -Destination $DestPath -Recurse -Force
    } else {
        Copy-Item -Path $Item.FullName -Destination $DestPath -Force
    }
}

Write-Host "[AstroChief] Güncel sürüm masaüstüne başarıyla yüklendi!" -ForegroundColor Green
Write-Host "[AstroChief] Test için masaüstündeki AstroChief-MarsMap\preview.bat dosyasını çalıştırabilirsiniz." -ForegroundColor Green

<#
================================================================================
DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
--------------------------------------------------------------------------------
- Satır 1-3: Başlık ve dosya açıklaması yorum bloğu.
- Satır 5: Hata durumunda betiğin güvenli şekilde durması için ErrorActionPreference ayarı.
- Satır 7: Betiğin bulunduğu proje kök dizinini ($SourceDir) alır.
- Satır 8: Kullanıcının Windows Masaüstü yolunu ($DesktopDir) dinamik olarak bulur.
- Satır 9: Masaüstünde oluşturulacak hedef klasör yolunu (AstroChief-MarsMap) belirler.
- Satır 11-12: Kaynak ve hedef dizinleri konsola yazdırır.
- Satır 14-17: Masaüstünde eski bir test sürümü varsa temizler.
- Satır 19: Hedef klasörü masaüstünde yeniden oluşturur.
- Satır 21: Kopyalanmayacak sistem/yedek klasörlerini (.git, backups, logs) tanımlar.
- Satır 22: Hariç tutulanlar dışındaki tüm dosya ve klasörleri listeler.
- Satır 24-31: Proje dosya ve klasörlerini tek tek masaüstündeki hedef klasöre kopyalar.
- Satır 33-34: İşlem tamamlandığında başarı ve test yönergesi mesajlarını yazdırır.
================================================================================
#>
