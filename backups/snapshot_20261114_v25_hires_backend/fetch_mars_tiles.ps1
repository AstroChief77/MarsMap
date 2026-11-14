# ==============================================================================
# AstroChief - NASA Mars Trek Gercek Karo (Tile) Indirme Betigi
# data/datasets/jpl_mars_trek_layers.json icindeki tum katmanlarin yerel
# karolarini data/tiles/<layer_id>/{z}/{y}/{x}.{ext} dizinine indirir.
# ==============================================================================

$ErrorActionPreference = "Stop"
$ToolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir  = Split-Path -Parent $ToolsDir
$Catalog  = Get-Content (Join-Path $RootDir "data\datasets\jpl_mars_trek_layers.json") -Raw | ConvertFrom-Json

$ConfigLines = New-Object System.Collections.Generic.List[string]
$TotalTarget = 0

foreach ($layer in $Catalog.tile_layers) {
    $maxZ = [int]$layer.max_local_zoom
    for ($z = 0; $z -le $maxZ; $z++) {
        $cols = [int][Math]::Pow(2, $z + 1)
        $rows = [int][Math]::Pow(2, $z)
        for ($y = 0; $y -lt $rows; $y++) {
            for ($x = 0; $x -lt $cols; $x++) {
                $localRel = $layer.local_template.Replace("./", "").Replace("/", "\").Replace("{z}", "$z").Replace("{y}", "$y").Replace("{x}", "$x")
                $outFile  = Join-Path $RootDir $localRel
                $outDir   = Split-Path -Parent $outFile
                if (-not (Test-Path $outDir)) {
                    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
                }
                if (-not (Test-Path $outFile) -or (Get-Item $outFile).Length -lt 100) {
                    $url = $layer.wmts_template.Replace("{z}", "$z").Replace("{y}", "$y").Replace("{x}", "$x")
                    $safeOut = $outFile.Replace("\", "/")
                    $ConfigLines.Add("url = `"$url`"")
                    $ConfigLines.Add("output = `"$safeOut`"")
                    $TotalTarget++
                }
            }
        }
    }
}

if ($TotalTarget -eq 0) {
    Write-Host "[OK] Tum yerel Mars karolari zaten data/tiles altinda mevcut." -ForegroundColor Green
    exit 0
}

Write-Host "[MarsTiles] $TotalTarget adet gercek NASA Mars Trek karosu data/tiles dizinine indiriliyor..." -ForegroundColor Cyan
$CfgPath = Join-Path $ToolsDir "_curl_tiles_tmp.txt"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllLines($CfgPath, $ConfigLines, $Utf8NoBom)

try {
    & curl.exe -s -f --parallel --parallel-max 8 --retry 2 --max-time 20 -K $CfgPath
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Bazi karolarda yeniden deneme gerekebilir (curl cikis kodu: $LASTEXITCODE)."
    }
} finally {
    if (Test-Path $CfgPath) { Remove-Item $CfgPath -Force }
}

$Downloaded = Get-ChildItem (Join-Path $RootDir "data\tiles") -Recurse -File
$TotalBytes = ($Downloaded | Measure-Object -Property Length -Sum).Sum
Write-Host "[OK] Toplam $($Downloaded.Count) Mars karosu data/tiles/ altinda hazir ($([Math]::Round($TotalBytes / 1MB, 2)) MB)." -ForegroundColor Green

<#
================================================================================
DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
--------------------------------------------------------------------------------
- Satir 1-10: Betik basligi, hata politikasi ve jpl_mars_trek_layers.json yuklemesi.
- Satir 12-34: Her katmanin max_local_zoom derinligi icin cols=2^(z+1), rows=2^z matrisini hesaplar ve eksik karolari curl listesine ekler.
- Satir 36-52: curl.exe --parallel ile 8 eszamanli baglanti uzerinden Mars Trek karolarini data/tiles altina indirir.
- Satir 54-56: Indirilen karo sayisini ve toplam MB boyutunu raporlar.
================================================================================
#>
