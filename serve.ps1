<#
.SYNOPSIS
  AstroChief yerel önizleme HTTP sunucusu (PowerShell dahili HttpListener).
.DESCRIPTION
  Ek bir paket/Node.js/Python kurulumu gerektirmeden Windows üzerinde tek tıkla
  ES6 modüllerini destekleyen bir yerel sunucu (localhost:3000) başlatır.
#>

$port = 3000
$url = "http://localhost:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host " [AstroChief] Yerel Sunucu Baslatildi: $url" -ForegroundColor Green
    Write-Host " Tarayiciniz otomatik acildi. Kapatmak icin Ctrl+C basiniz." -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Cyan
    Start-Process $url

    $mimeTypes = @{
        ".html" = "text/html; charset=utf-8"
        ".css"  = "text/css; charset=utf-8"
        ".js"   = "application/javascript; charset=utf-8"
        ".json" = "application/json; charset=utf-8"
        ".png"  = "image/png"
        ".jpg"  = "image/jpeg"
        ".svg"  = "image/svg+xml"
        ".ico"  = "image/x-icon"
    }

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $cleanUrl = $request.Url.LocalPath
        if ($cleanUrl -eq "/" -or [string]::IsNullOrWhiteSpace($cleanUrl)) {
            $cleanUrl = "/index.html"
        }

        $localPath = Join-Path $PSScriptRoot $cleanUrl.TrimStart('/')

        if (Test-Path $localPath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
            $bytes = [System.IO.File]::ReadAllBytes($localPath)

            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - AstroChief Dosya Bulunamadi: $cleanUrl")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.OutputStream.Close()
    }
}
finally {
    $listener.Stop()
    $listener.Close()
}

<#
==========================================================================
DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
--------------------------------------------------------------------------
- Satır 1-7: PowerShell komut dosyası dokümantasyonu.
- Satır 9-12: Port numarası (3000), dinleyici URL'i ve System.Net.HttpListener nesnesinin oluşturulması.
- Satır 14-20: Sunucuyu başlatma, konsola renkli bilgi mesajı yazdırma ve tarayıcıyı otomatik açma (Start-Process).
- Satır 22-31: MIME type tablosu (HTML, CSS, JS ES6 modülleri, JSON ve görsel formatları).
- Satır 33: Gelen istekleri sonsuz döngüde dinleme (while listener is listening).
- Satır 34-36: İstek ve yanıt nesnelerini alma (GetContext).
- Satır 38-43: İstek yapılan URL yolunu yerel dosya sistemindeki yola dönüştürme (varsayılan: index.html).
- Satır 45-53: Dosya mevcutsa doğru Content-Type ve bayt dizisi ile 200 yanıtı gönderme.
- Satır 54-61: Dosya yoksa UTF-8 formatında 404 hata mesajı döndürme.
- Satır 62: Yanıt akışını kapatma (Close).
- Satır 65-68: finally bloğu; sunucu durdurulduğunda portu serbest bırakma (Stop/Close).
==========================================================================
#>
