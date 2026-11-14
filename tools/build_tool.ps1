# ==============================================================================
# AstroChief - Otomatik Windows & Linux Derleme ve Masaustu Dagitim Araci
# Kullanim: powershell -ExecutionPolicy Bypass -File .\tools\build_tool.ps1
# ==============================================================================

param(
    [switch]$SkipDesktopDeploy
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$ToolsDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir    = Split-Path -Parent $ToolsDir
$VerJson    = Get-Content (Join-Path $RootDir "version.json") -Raw | ConvertFrom-Json
$Version    = $VerJson.version

$DistRoot   = Join-Path $RootDir "dist"
$WinStage   = Join-Path $DistRoot "windows\AstroChief-MarsMap-win64"
$LinStage   = Join-Path $DistRoot "linux\AstroChief-MarsMap-linux"
$WinZip     = Join-Path $DistRoot "AstroChief-MarsMap-v$Version-windows.zip"
$LinTar     = Join-Path $DistRoot "AstroChief-MarsMap-v$Version-linux.tar.gz"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host " [AstroChief Build Tool] Surum v$Version Derleniyor..." -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan

# 1. Modul satir siniri dogrulamasi (Ana kod dosyasi disinda < 800 satir kurali)
$CodeFiles = Get-ChildItem -Path (Join-Path $RootDir "js"), (Join-Path $RootDir "css"), (Join-Path $RootDir "data"), (Join-Path $RootDir "tools"), (Join-Path $RootDir "demo"), (Join-Path $RootDir "chat") -Recurse -File -Include *.js,*.css,*.ps1,*.cs,*.py,*.sh,*.html
foreach ($cf in $CodeFiles) {
    $lc = (Get-Content $cf.FullName).Count
    if ($lc -ge 800) {
        throw "KURAL IHLALI: $($cf.Name) dosyasi $lc satir (>=800)!"
    }
}
Write-Host "[OK] Tum modul dosyalari (< 800 satir) kuralindan gecti." -ForegroundColor Gray

# 2. Cikti klasorlerini temizle ve hazirla
if (Test-Path $DistRoot) {
    Remove-Item -Path $DistRoot -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Path $WinStage -Force | Out-Null
New-Item -ItemType Directory -Path $LinStage -Force | Out-Null

# Ortak uygulama dosyalarini sahneleme yardimci fonksiyonu (res ve ForAgents dahil)
function Copy-RuntimeBundle {
    param([string]$TargetFolder)
    $Files = @("index.html", "SOURCES.md", "LICENSE", "version.json", "serve.ps1", "preview.bat")
    foreach ($f in $Files) {
        $src = Join-Path $RootDir $f
        if (Test-Path $src) { Copy-Item -Path $src -Destination $TargetFolder -Force }
    }
    foreach ($dir in @("css", "js", "data", "res", "demo", "chat", "ForAgents")) {
        $srcDir = Join-Path $RootDir $dir
        if (Test-Path $srcDir) {
            $dstDir = Join-Path $TargetFolder $dir
            New-Item -ItemType Directory -Path $dstDir -Force | Out-Null
            Copy-Item -Path (Join-Path $srcDir "*") -Destination $dstDir -Recurse -Force
        }
    }
}

# 3. WINDOWS DERLEMESI (.NET Framework csc.exe -> MarsMap-win64.exe)
Write-Host "[Windows] Uygulama paketi ve yerel calistirici (.exe) derleniyor..." -ForegroundColor Yellow
Copy-RuntimeBundle -TargetFolder $WinStage

$CscPath   = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$WinCs     = Join-Path $ToolsDir "WinLauncher.cs"
$WinExe    = Join-Path $WinStage "MarsMap-win64.exe"
$WinExeTmp = Join-Path $WinStage "MarsMap-win64.tmp.exe"

if (Test-Path $CscPath) {
    if (Test-Path $WinExeTmp) { Remove-Item -Path $WinExeTmp -Force -ErrorAction SilentlyContinue }
    & $CscPath /nologo /optimize+ /out:$WinExeTmp $WinCs
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $WinExeTmp)) {
        throw "Windows launcher derlemesi basarisiz oldu!"
    }
    try {
        if (Test-Path $WinExe) { Remove-Item -Path $WinExe -Force }
        Move-Item -Path $WinExeTmp -Destination $WinExe -Force
        Write-Host "[OK] Windows EXE derlendi: $WinExe" -ForegroundColor Green
    } catch {
        Remove-Item -Path $WinExeTmp -Force -ErrorAction SilentlyContinue
        Write-Warning "MarsMap-win64.exe su anda acik oldugu icin guncellenemedi; mevcut EXE korundu ($($_.Exception.Message))."
    }
} else {
    Write-Warning "csc.exe bulunamadi; PowerShell baslatici kullanilacak."
}

if (Test-Path $WinZip) { Remove-Item $WinZip -Force }
[System.IO.Compression.ZipFile]::CreateFromDirectory((Join-Path $DistRoot "windows"), $WinZip)
Write-Host "[OK] Windows ZIP arsivi hazir: $WinZip" -ForegroundColor Green

# 4. LINUX DERLEMESI (LF normalize launch-linux.sh + SHA256SUMS + .tar.gz)
Write-Host "[Linux] Linux test paketi (LF betikleri & tar.gz) hazirlaniyor..." -ForegroundColor Yellow
Copy-RuntimeBundle -TargetFolder $LinStage
$WinOnlyInLinux = @("serve.ps1", "preview.bat")
foreach ($wo in $WinOnlyInLinux) {
    $rem = Join-Path $LinStage $wo
    if (Test-Path $rem) { Remove-Item $rem -Force }
}

# LF satir sonu garantili launch-linux.sh yazimi
$LinuxShRaw = (Get-Content (Join-Path $ToolsDir "launch-linux.sh") -Raw) -replace "`r`n", "`n"
$Utf8NoBom  = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $LinStage "launch-linux.sh"), $LinuxShRaw, $Utf8NoBom)

# SHA-256 dogrulama listesi
$Hashes = Get-ChildItem -Path $LinStage -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($LinStage.Length + 1).Replace('\', '/')
    $h = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
    "$h  $rel"
}
[System.IO.File]::WriteAllText((Join-Path $LinStage "SHA256SUMS.txt"), ($Hashes -join "`n") + "`n", $Utf8NoBom)

Push-Location (Join-Path $DistRoot "linux")
tar.exe -czf $LinTar "AstroChief-MarsMap-linux"
Pop-Location
Write-Host "[OK] Linux TAR.GZ paketi hazir: $LinTar" -ForegroundColor Green

# 5. MASAUSTUNE GUNCEL DERLENMIS SURUM DAGITIMI
if (-not $SkipDesktopDeploy) {
    $DesktopDir = [Environment]::GetFolderPath("Desktop")
    $TargetDir  = Join-Path $DesktopDir "AstroChief-MarsMap"

    if (Test-Path $TargetDir) {
        Get-ChildItem -Path $TargetDir -Force | ForEach-Object {
            Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    } else {
        New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
    }

    # Masaustune guncel web/data/res + paketleri kopyala (calisan EXE kilitliyse atla)
    Get-ChildItem -Path $WinStage | ForEach-Object {
        $dst = Join-Path $TargetDir $_.Name
        if ($_.PSIsContainer) {
            Copy-Item -Path $_.FullName -Destination $TargetDir -Recurse -Force
        } else {
            try {
                Copy-Item -Path $_.FullName -Destination $dst -Force -ErrorAction Stop
            } catch {
                Write-Warning "Kilitli dosya atlandi (calisiyor olabilir): $($_.Name)"
            }
        }
    }
    $DeskDist = Join-Path $TargetDir "dist"
    New-Item -ItemType Directory -Path $DeskDist -Force | Out-Null
    Copy-Item -Path $WinZip, $LinTar -Destination $DeskDist -Force
    Copy-Item -Path (Join-Path $LinStage "launch-linux.sh") -Destination $TargetDir -Force

    Write-Host "[OK] Guncel surum masaustune yuklendi: $TargetDir" -ForegroundColor Green
    Write-Host "     - Windows Test: MarsMap-win64.exe veya preview.bat" -ForegroundColor White
    Write-Host "     - Linux Test  : dist\AstroChief-MarsMap-v$Version-linux.tar.gz" -ForegroundColor White
}

<#
================================================================================
DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
--------------------------------------------------------------------------------
- Satır 1-27: Parametreler, proje sürüm dosyası (version.json) okuma ve çıktı klasör yolları.
- Satır 29-37: Tüm JS/CSS/HTML/araç modüllerinin < 800 satır kuralına uyduğunu doğrular (`demo` ve `chat` dahil).
- Satır 39-63: Temiz dist dizinleri oluşturur; Copy-RuntimeBundle ile css, js, data, res, demo, chat ve ForAgents kopyalar.
- Satır 65-95: Windows hedefi için .NET csc.exe ile MarsMap-win64.exe geçici derlemesini üretir (kilitliyse uyarır) ve ZIP arşivi oluşturur.
- Satır 97-122: Linux hedefi için LF (\n) satır sonlu launch-linux.sh ve SHA256SUMS üretir, .tar.gz paketi oluşturur.
- Satır 124-157: Güncel derlenmiş sürümü Windows Masaüstündeki AstroChief-MarsMap klasörüne yükler.
================================================================================
#>
