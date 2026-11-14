# ==============================================================================
# AstroChief - NASA Mars Trek Hibrit Yerel Karo (Tile) Indirici ve Manifest Ureticisi
# Global z=0..max_local_zoom karolari ile Gale/Jezero/Korolev krater odakli
# z=3..5 yuksek cozunurluk karolarini data/tiles/ dizinine indirir ve manifest.json yazar.
# ==============================================================================

$ErrorActionPreference = "Stop"
$ToolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir  = Split-Path -Parent $ToolsDir
$Catalog  = Get-Content (Join-Path $RootDir "data\datasets\jpl_mars_trek_layers.json") -Raw | ConvertFrom-Json

$Craters = @(
    @{ name = "gale";    lat = -4.5895;  lon = 137.4417 },
    @{ name = "jezero";  lat = 18.4447;  lon = 77.4508 },
    @{ name = "korolev"; lat = 73.0;     lon = 165.0 }
)

$Wanted = New-Object System.Collections.Generic.HashSet[string]
$ConfigLines = New-Object System.Collections.Generic.List[string]
$DownloadCount = 0

function Enqueue-Tile {
    param($Layer, [int]$z, [int]$y, [int]$x)
    $key = "$($Layer.id)/$z/$y/$x"
    if (-not $Wanted.Add($key)) { return }

    $localRel = $Layer.local_template.Replace("./", "").Replace("/", "\").Replace("{z}", "$z").Replace("{y}", "$y").Replace("{x}", "$x")
    $outFile  = Join-Path $RootDir $localRel
    $outDir   = Split-Path -Parent $outFile
    if (-not (Test-Path $outDir)) {
        New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    if (-not (Test-Path $outFile) -or (Get-Item $outFile).Length -lt 100) {
        $url = $Layer.wmts_template.Replace("{z}", "$z").Replace("{y}", "$y").Replace("{x}", "$x")
        $safeOut = $outFile.Replace("\", "/")
        $ConfigLines.Add("url = `"$url`"")
        $ConfigLines.Add("output = `"$safeOut`"")
        $script:DownloadCount++
    }
}

foreach ($layer in $Catalog.tile_layers) {
    # 1. Kuresel taban karolari (z=0..max_local_zoom)
    $maxZ = [int]$layer.max_local_zoom
    for ($z = 0; $z -le $maxZ; $z++) {
        $cols = [int][Math]::Pow(2, $z + 1)
        $rows = [int][Math]::Pow(2, $z)
        for ($y = 0; $y -lt $rows; $y++) {
            for ($x = 0; $x -lt $cols; $x++) {
                Enqueue-Tile -Layer $layer -z $z -y $y -x $x
            }
        }
    }

    # 2. Hedef krater cevresi yuksek cozunurluk yamasi (z=3..5)
    $craterMaxZ = [int]$layer.max_crater_zoom
    for ($z = ($maxZ + 1); $z -le $craterMaxZ; $z++) {
        $cols = [int][Math]::Pow(2, $z + 1)
        $rows = [int][Math]::Pow(2, $z)
        foreach ($c in $Craters) {
            $cx = [int][Math]::Floor((($c.lon + 180.0) / 360.0) * $cols)
            $cy = [int][Math]::Floor(((90.0 - $c.lat) / 180.0) * $rows)
            for ($dy = -1; $dy -le 1; $dy++) {
                $ny = $cy + $dy
                if ($ny -lt 0 -or $ny -ge $rows) { continue }
                for ($dx = -1; $dx -le 1; $dx++) {
                    $nx = (($cx + $dx) % $cols + $cols) % $cols
                    Enqueue-Tile -Layer $layer -z $z -y $ny -x $nx
                }
            }
        }
    }
}

if ($DownloadCount -gt 0) {
    Write-Host "[MarsTiles] $DownloadCount adet yuksek cozunurluklu NASA karosu indiriliyor..." -ForegroundColor Cyan
    $CfgPath = Join-Path $ToolsDir "_curl_tiles_tmp.txt"
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($CfgPath, $ConfigLines, $Utf8NoBom)
    try {
        & curl.exe -s -f --parallel --parallel-max 10 --retry 2 --max-time 25 -K $CfgPath
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Bazi yuksek zoom karolarda kisitlama olabilir (kod: $LASTEXITCODE)."
        }
    } finally {
        if (Test-Path $CfgPath) { Remove-Item $CfgPath -Force }
    }
}

# data/tiles/manifest.json dosyasini uret (sifir gereksiz 404 icin mevcut yerel karolar)
$TilesRoot = Join-Path $RootDir "data\tiles"
$ManifestMap = @{}
foreach ($layer in $Catalog.tile_layers) {
    $layerDir = Join-Path $TilesRoot $layer.id
    $keys = New-Object System.Collections.Generic.List[string]
    if (Test-Path $layerDir) {
        Get-ChildItem -Path $layerDir -Recurse -File | Where-Object { $_.Length -ge 100 } | ForEach-Object {
            $rel = $_.FullName.Substring($layerDir.Length + 1).Replace('\', '/')
            $noExt = [System.IO.Path]::ChangeExtension($rel, $null).TrimEnd('.')
            $keys.Add($noExt)
        }
    }
    $ManifestMap[$layer.id] = $keys
}

$ManifestObj = [PSCustomObject]@{
    generated_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssK")
    tiles = $ManifestMap
}
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $TilesRoot "manifest.json"), ($ManifestObj | ConvertTo-Json -Depth 4 -Compress), $Utf8)

$AllFiles = Get-ChildItem $TilesRoot -Recurse -File | Where-Object { $_.Name -ne "manifest.json" }
$TotalMB = [Math]::Round((($AllFiles | Measure-Object -Property Length -Sum).Sum) / 1MB, 2)
Write-Host "[OK] Toplam $($AllFiles.Count) yerel Mars karosu ($TotalMB MB) + manifest.json hazir." -ForegroundColor Green

<#
================================================================================
DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
--------------------------------------------------------------------------------
- Satir 1-17: Katalog yükleme ve Gale, Jezero, Korolev krater merkez koordinatları.
- Satir 19-67: Kuresel z=0..2 tabani ve krater odakli z=3..5 (3x3 cevre) yuksek cozunurluk karolarini kuyruga alir.
- Satir 69-82: curl.exe --parallel ile eszamanli olarak NASA Mars Trek sunucusundan karolari indirir.
- Satir 84-108: data/tiles/manifest.json olusturarak MarsTileLoader'in hangi karolarin yerel oldugunu aninda bilmesini saglar.
================================================================================
#>
