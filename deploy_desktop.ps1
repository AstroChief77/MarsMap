# ==============================================================================
# AstroChief - Masaustu ve Coklu Platform Derleme Yonlendiricisi (deploy_desktop.ps1)
# ==============================================================================

$ErrorActionPreference = "Stop"
$SourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildTool = Join-Path $SourceDir "tools\build_tool.ps1"

Write-Host "[AstroChief] Otomatik Derleme & Masaustu Dagitim Araci cagriliyor..." -ForegroundColor Cyan
& powershell -NoProfile -ExecutionPolicy Bypass -File $BuildTool
exit $LASTEXITCODE

<#
================================================================================
DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
--------------------------------------------------------------------------------
- Satır 1-7: Proje kök dizinindeki tools/build_tool.ps1 derleme aracının yolunu çözümler.
- Satır 9-11: Tüm Windows (.exe/.zip) + Linux (.tar.gz) derleme ve Masaüstü kopyalama işini derleme aracına devreder.
================================================================================
#>
