<#
.SYNOPSIS
  AstroChief GitHub (origin/main) surekli izleme, derleme ve port 3000 LAN guncelleme otomasyonu.
.DESCRIPTION
  GitHub uzerindeki origin/main dalini duzenli araliklarla denetler. Yeni commit tespit
  edildiginde guncel kodu ceker, tools/build_tool.ps1 ile derler ve MarsMap-win64.exe
  sunucusunu ayni port (3000) ve guvenlik duvari yolu uzerinden yeniden baslatir.
#>

param(
    [int]$Port = 3000,
    [int]$PollIntervalSeconds = 20,
    [string]$Remote = "origin",
    [string]$Branch = "main",
    [switch]$RunOnce,
    [switch]$SkipDesktopDeploy
)

$ErrorActionPreference = "Continue"
$env:GIT_TERMINAL_PROMPT = "0"

$ToolsDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ToolsDir
$LogsDir = Join-Path $RootDir "logs"
$BuildScript = Join-Path $ToolsDir "build_tool.ps1"
$WinExe = Join-Path $RootDir "dist\windows\AstroChief-MarsMap-win64\MarsMap-win64.exe"
$LogFile = Join-Path $LogsDir "autodeploy_lan.log"
$StateFile = Join-Path $LogsDir "autodeploy_lan.sha"
$ServerOut = Join-Path $LogsDir "server_3000.out.log"
$ServerErr = Join-Path $LogsDir "server_3000.err.log"
$BackupExe = Join-Path $env:TEMP "AstroChief-MarsMap-win64.backup.exe"

if (-not (Test-Path $LogsDir)) {
    New-Item -ItemType Directory -Path $LogsDir -Force | Out-Null
}

function Write-AutoLog {
    param([string]$Level, [string]$Message)
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] [$Level] $Message"
    Write-Output $line
    try {
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch { }
}

function Invoke-Git {
    param([string[]]$GitArgs)
    Push-Location $RootDir
    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "git"
        $escaped = $GitArgs | ForEach-Object {
            if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ }
        }
        $psi.Arguments = ($escaped -join " ")
        $psi.WorkingDirectory = $RootDir
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $proc = [System.Diagnostics.Process]::Start($psi)
        $stdout = $proc.StandardOutput.ReadToEnd()
        $stderr = $proc.StandardError.ReadToEnd()
        $proc.WaitForExit()
        return [PSCustomObject]@{
            ExitCode = $proc.ExitCode
            Output   = ($stdout + "`n" + $stderr).Trim()
        }
    } finally {
        Pop-Location
    }
}

function Get-RunningMarsServers {
    Get-Process -Name "MarsMap-win64" -ErrorAction SilentlyContinue | Where-Object {
        try { $_.Path -eq $WinExe } catch { $true }
    }
}

function Stop-MarsServer {
    $procs = Get-RunningMarsServers
    foreach ($p in $procs) {
        try {
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
            Write-AutoLog "INFO" "Durdurulan sunucu PID=$($p.Id)"
        } catch { }
    }
    for ($i = 0; $i -lt 20; $i++) {
        if (-not (Get-RunningMarsServers)) { break }
        Start-Sleep -Milliseconds 200
    }
}

function Start-MarsServer {
    if (-not (Test-Path $WinExe)) {
        Write-AutoLog "ERROR" "Sunucu EXE bulunamadi: $WinExe"
        return $false
    }
    if (Get-RunningMarsServers) {
        return $true
    }
    $quotedRoot = if ($RootDir -match '\s') { '"' + $RootDir + '"' } else { $RootDir }
    $proc = Start-Process -FilePath $WinExe `
        -ArgumentList "--root", $quotedRoot, "--port", $Port.ToString(), "--no-browser" `
        -WorkingDirectory $RootDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $ServerOut `
        -RedirectStandardError $ServerErr `
        -PassThru
    Start-Sleep -Milliseconds 600
    if ($proc.HasExited) {
        Write-AutoLog "ERROR" "MarsMap-win64.exe hemen kapandi (ExitCode=$($proc.ExitCode))."
        return $false
    }
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Encoding = [System.Text.Encoding]::UTF8
        $verRaw = $wc.DownloadString("http://127.0.0.1:$Port/version.json")
        $verObj = $verRaw | ConvertFrom-Json
        Write-AutoLog "OK" "Port $Port uzerinde sunucu hazir (PID=$($proc.Id), v$($verObj.version))."
    } catch {
        Write-AutoLog "WARN" "Sunucu baslatildi (PID=$($proc.Id)) ancak yerel dogrulama yanit vermedi: $($_.Exception.Message)"
    }
    return $true
}

function Invoke-BuildTool {
    param([switch]$ForceSkipDesktop)
    $quotedBuild = if ($BuildScript -match '[\s"]') { '"' + ($BuildScript -replace '"', '\"') + '"' } else { $BuildScript }
    $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $quotedBuild)
    if ($ForceSkipDesktop) {
        $argList += "-SkipDesktopDeploy"
    }
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "powershell.exe"
    $psi.Arguments = ($argList -join " ")
    $psi.WorkingDirectory = $RootDir
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $proc = [System.Diagnostics.Process]::Start($psi)
    $out = $proc.StandardOutput.ReadToEnd()
    $err = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()
    return [PSCustomObject]@{
        ExitCode = $proc.ExitCode
        Output   = ($out + "`n" + $err).Trim()
    }
}

function Invoke-RebuildAndRestart {
    param([string]$TargetSha)
    if (Test-Path $WinExe) {
        Copy-Item -Path $WinExe -Destination $BackupExe -Force
    }
    Stop-MarsServer
    try {
        Write-AutoLog "BUILD" "Derleme baslatiliyor ($TargetSha)..."
        $res = Invoke-BuildTool -ForceSkipDesktop:$SkipDesktopDeploy
        if ($res.ExitCode -ne 0 -and -not $SkipDesktopDeploy) {
            Write-AutoLog "WARN" "Masaustu kopyalama ile derleme hata verdi; -SkipDesktopDeploy ile tekrar deneniyor."
            $res = Invoke-BuildTool -ForceSkipDesktop
        }
        if ($res.ExitCode -eq 0 -and (Test-Path $WinExe)) {
            Set-Content -Path $StateFile -Value $TargetSha -Encoding ASCII
            Write-AutoLog "OK" "Derleme basarili: $WinExe"
        } else {
            Write-AutoLog "ERROR" "Derleme basarisiz (ExitCode=$($res.ExitCode)): $($res.Output)"
            if (-not (Test-Path $WinExe) -and (Test-Path $BackupExe)) {
                $exeDir = Split-Path -Parent $WinExe
                if (-not (Test-Path $exeDir)) { New-Item -ItemType Directory -Path $exeDir -Force | Out-Null }
                Copy-Item -Path $BackupExe -Destination $WinExe -Force
                Write-AutoLog "WARN" "Onceki calisan EXE yedekten geri yuklendi."
            }
        }
    } finally {
        Start-MarsServer | Out-Null
    }
}

function Sync-FromGitHub {
    $fetch = Invoke-Git @("fetch", $Remote, $Branch)
    if ($fetch.ExitCode -ne 0) {
        Write-AutoLog "WARN" "git fetch basarisiz (ag gecici kesik olabilir): $($fetch.Output)"
        return
    }

    $headRes = Invoke-Git @("rev-parse", "HEAD")
    $remoteRes = Invoke-Git @("rev-parse", "$Remote/$Branch")
    if ($headRes.ExitCode -ne 0 -or $remoteRes.ExitCode -ne 0) {
        Write-AutoLog "WARN" "SHA okunamadi."
        return
    }

    $headSha = $headRes.Output.Trim()
    $remoteSha = $remoteRes.Output.Trim()

    if ($headSha -eq $remoteSha) {
        $lastBuiltSha = if (Test-Path $StateFile) { (Get-Content $StateFile -Raw).Trim() } else { "" }
        if (-not (Test-Path $WinExe)) {
            Invoke-RebuildAndRestart -TargetSha $headSha
        } elseif ($lastBuiltSha -ne $headSha) {
            Set-Content -Path $StateFile -Value $headSha -Encoding ASCII
        }
        return
    }

    Write-AutoLog "SYNC" "GitHub degisikligi tespit edildi: $headSha -> $remoteSha"
    $dirtyCheck = Invoke-Git @(
        "status", "--porcelain", "--",
        ":!dist", ":!logs/autodeploy_lan.log", ":!logs/autodeploy_lan.sha",
        ":!logs/server_3000.out.log", ":!logs/server_3000.err.log"
    )
    if (-not [string]::IsNullOrWhiteSpace($dirtyCheck.Output)) {
        Write-AutoLog "WARN" "dist disinda yerel degisiklik var; cakismayi onlemek icin pull atlandi:`n$($dirtyCheck.Output)"
        return
    }

    $canFf = Invoke-Git @("merge-base", "--is-ancestor", "HEAD", "$Remote/$Branch")
    if ($canFf.ExitCode -ne 0) {
        Write-AutoLog "WARN" "Yerel dal $Remote/$Branch ile fast-forward uyumlu degil; manuel mudahale gerekli."
        return
    }

    if (Test-Path $WinExe) {
        Copy-Item -Path $WinExe -Destination $BackupExe -Force
    }
    Stop-MarsServer
    Invoke-Git @("checkout", "--", "dist") | Out-Null
    Invoke-Git @("clean", "-fd", "dist") | Out-Null
    $merge = Invoke-Git @("merge", "--ff-only", "$Remote/$Branch")
    if ($merge.ExitCode -ne 0) {
        Write-AutoLog "ERROR" "git merge --ff-only basarisiz: $($merge.Output)"
        if (-not (Test-Path $WinExe) -and (Test-Path $BackupExe)) {
            $exeDir = Split-Path -Parent $WinExe
            if (-not (Test-Path $exeDir)) { New-Item -ItemType Directory -Path $exeDir -Force | Out-Null }
            Copy-Item -Path $BackupExe -Destination $WinExe -Force
        }
        Start-MarsServer | Out-Null
        return
    }

    Write-AutoLog "OK" "Yeni kod cekildi ($remoteSha)."
    Invoke-RebuildAndRestart -TargetSha $remoteSha
}

Write-AutoLog "INFO" "GitHub LAN Auto-Deploy baslatildi ($Remote/$Branch, aralik=${PollIntervalSeconds}s, port=$Port)."
if (-not (Test-Path $WinExe)) {
    $initSha = (Invoke-Git @("rev-parse", "HEAD")).Output.Trim()
    Invoke-RebuildAndRestart -TargetSha $initSha
} elseif (-not (Get-RunningMarsServers)) {
    Start-MarsServer | Out-Null
}

if ($RunOnce) {
    Sync-FromGitHub
    exit 0
}

while ($true) {
    try {
        if (-not (Get-RunningMarsServers)) {
            Write-AutoLog "WARN" "Sunucu durmus gorunuyor; yeniden baslatiliyor."
            Start-MarsServer | Out-Null
        }
        Sync-FromGitHub
    } catch {
        Write-AutoLog "ERROR" "Beklenmeyen dongu hatasi: $($_.Exception.Message)"
    }
    Start-Sleep -Seconds $PollIntervalSeconds
}

<#
==========================================================================
DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
--------------------------------------------------------------------------
- Satir 1-35: Parametreler (Port, PollIntervalSeconds, RunOnce), log/state yollari ve git ortam ayari.
- Satir 37-85: Write-AutoLog ve Invoke-Git; git ciktilarini güvenli ProcessStartInfo ile yakalar.
- Satir 87-146: Get-RunningMarsServers, Stop-MarsServer, Start-MarsServer ve Invoke-BuildTool yardimcilari.
- Satir 148-174: Invoke-RebuildAndRestart; mevcut EXE yedegiyle kilit olmadan derler ve port 3000'i acik tutar.
- Satir 176-225: Sync-FromGitHub; origin/main SHA farkini izler, dist/ disinda temizse ff-only ceker ve derler.
- Satir 227-250: Baslangic kontrolu ve surekli arkaplan izleme dongusu.
==========================================================================
#>
