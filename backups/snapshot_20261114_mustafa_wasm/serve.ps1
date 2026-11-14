<#
.SYNOPSIS
  AstroChief yerel ve LAN HTTP sunucusu (URLACL/admin gereksinimsiz TcpListener).
.DESCRIPTION
  Yerel agdaki (LAN) diger cihazlarin ve bu bilgisayarin AstroChief MarsMap'e
  ayni ag uzerinden baglanabilmesi icin 0.0.0.0 uzerinde coklu islemcikli HTTP sunucusu baslatir.
#>

param(
    [int]$Port = 3000,
    [switch]$NoBrowser,
    [switch]$LocalOnly
)

$ServerCode = @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace AstroChiefServe
{
    public class LanHttpServer
    {
        private readonly string _baseDir;
        private readonly Dictionary<string, string> _mimeTypes;
        private TcpListener _listener;
        private IAsyncResult _pendingAccept;
        private volatile bool _running;

        public LanHttpServer(string baseDir)
        {
            string full = Path.GetFullPath(baseDir);
            string sep = Path.DirectorySeparatorChar.ToString();
            _baseDir = full.EndsWith(sep) ? full : full + sep;
            _mimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            _mimeTypes[".html"] = "text/html; charset=utf-8";
            _mimeTypes[".css"] = "text/css; charset=utf-8";
            _mimeTypes[".js"] = "application/javascript; charset=utf-8";
            _mimeTypes[".json"] = "application/json; charset=utf-8";
            _mimeTypes[".md"] = "text/markdown; charset=utf-8";
            _mimeTypes[".png"] = "image/png";
            _mimeTypes[".jpg"] = "image/jpeg";
            _mimeTypes[".jpeg"] = "image/jpeg";
            _mimeTypes[".svg"] = "image/svg+xml";
            _mimeTypes[".ico"] = "image/x-icon";
            _mimeTypes[".woff2"] = "font/woff2";
            _mimeTypes[".woff"] = "font/woff";
        }

        public static List<string> GetLanIPv4Addresses()
        {
            List<string> ips = new List<string>();
            try
            {
                foreach (NetworkInterface nic in NetworkInterface.GetAllNetworkInterfaces())
                {
                    if (nic.OperationalStatus != OperationalStatus.Up) continue;
                    if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    foreach (UnicastIPAddressInformation uni in nic.GetIPProperties().UnicastAddresses)
                    {
                        if (uni.Address.AddressFamily == AddressFamily.InterNetwork)
                        {
                            string ip = uni.Address.ToString();
                            if (!ip.StartsWith("127.") && !ip.StartsWith("169.254.") && !ips.Contains(ip))
                            {
                                ips.Add(ip);
                            }
                        }
                    }
                }
            }
            catch { }
            return ips;
        }

        public int Start(int requestedPort, bool localOnly)
        {
            IPAddress bindIp = localOnly ? IPAddress.Loopback : IPAddress.Any;
            _listener = new TcpListener(bindIp, requestedPort);
            _listener.Start();
            _running = true;
            return ((IPEndPoint)_listener.LocalEndpoint).Port;
        }

        public void RunStep()
        {
            if (!_running) return;
            if (_pendingAccept == null)
            {
                _pendingAccept = _listener.BeginAcceptTcpClient(null, null);
            }
            if (!_pendingAccept.AsyncWaitHandle.WaitOne(100)) return;
            IAsyncResult ar = _pendingAccept;
            _pendingAccept = null;
            try
            {
                TcpClient client = _listener.EndAcceptTcpClient(ar);
                ThreadPool.QueueUserWorkItem(HandleClient, client);
            }
            catch (SocketException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
        }

        public bool IsRunning()
        {
            return _running;
        }

        public void Stop()
        {
            _running = false;
            _pendingAccept = null;
            try { if (_listener != null) _listener.Stop(); } catch { }
        }

        private void HandleClient(object state)
        {
            TcpClient client = (TcpClient)state;
            try
            {
                client.ReceiveTimeout = 5000;
                client.SendTimeout = 15000;
                using (client)
                using (NetworkStream stream = client.GetStream())
                using (StreamReader reader = new StreamReader(stream, Encoding.ASCII, false, 4096, true))
                {
                    string requestLine = reader.ReadLine();
                    if (string.IsNullOrEmpty(requestLine)) return;
                    string headerLine;
                    int count = 0;
                    while (!string.IsNullOrEmpty(headerLine = reader.ReadLine()))
                    {
                        count++;
                        if (count > 128) break;
                    }
                    string[] parts = requestLine.Split(' ');
                    if (parts.Length < 2)
                    {
                        WriteText(stream, 400, "Bad Request", "text/plain; charset=utf-8", "400 - Gecersiz istek", true);
                        return;
                    }
                    string method = parts[0].ToUpperInvariant();
                    if (method != "GET" && method != "HEAD")
                    {
                        WriteText(stream, 405, "Method Not Allowed", "text/plain; charset=utf-8", "405 - Yalnizca GET/HEAD", true);
                        return;
                    }
                    ServePath(stream, parts[1], method == "GET");
                }
            }
            catch { }
        }

        private void ServePath(NetworkStream stream, string rawTarget, bool sendBody)
        {
            int qIdx = rawTarget.IndexOf('?');
            if (qIdx >= 0) rawTarget = rawTarget.Substring(0, qIdx);
            int hIdx = rawTarget.IndexOf('#');
            if (hIdx >= 0) rawTarget = rawTarget.Substring(0, hIdx);

            string decoded;
            try { decoded = Uri.UnescapeDataString(rawTarget); }
            catch
            {
                WriteText(stream, 400, "Bad Request", "text/plain; charset=utf-8", "400 - Gecersiz URL", sendBody);
                return;
            }

            string cleanRel = decoded.Replace('\\', '/').TrimStart('/');
            if (cleanRel.IndexOf('\0') >= 0 || cleanRel.Contains(".."))
            {
                WriteText(stream, 403, "Forbidden", "text/plain; charset=utf-8", "403 - Yasak", sendBody);
                return;
            }

            if (string.IsNullOrEmpty(cleanRel)) cleanRel = "index.html";
            if (cleanRel.Equals("chat", StringComparison.OrdinalIgnoreCase) ||
                cleanRel.Equals("chat/", StringComparison.OrdinalIgnoreCase))
            {
                cleanRel = "chat/index.html";
            }

            if (cleanRel.StartsWith("api/", StringComparison.OrdinalIgnoreCase))
            {
                WriteText(stream, 501, "Not Implemented", "application/json; charset=utf-8",
                    "{\"success\":false,\"error\":\"Yerel Windows LAN sunucusunda PHP yok; harita modulleri aktif.\"}", sendBody);
                return;
            }

            if (!IsAllowedWebPath(cleanRel))
            {
                WriteText(stream, 404, "Not Found", "text/plain; charset=utf-8", "404 - Bulunamadi", sendBody);
                return;
            }

            string fullPath = Path.GetFullPath(Path.Combine(_baseDir, cleanRel.Replace('/', Path.DirectorySeparatorChar)));
            if (!fullPath.StartsWith(_baseDir, StringComparison.OrdinalIgnoreCase) || !File.Exists(fullPath))
            {
                WriteText(stream, 404, "Not Found", "text/plain; charset=utf-8", "404 - Dosya yok: " + cleanRel, sendBody);
                return;
            }

            string ext = Path.GetExtension(fullPath);
            string ctype;
            if (!_mimeTypes.TryGetValue(ext, out ctype)) ctype = "application/octet-stream";
            byte[] data = File.ReadAllBytes(fullPath);
            WriteBytes(stream, 200, "OK", ctype, data, sendBody);
        }

        private bool IsAllowedWebPath(string rel)
        {
            if (rel.Equals("index.html", StringComparison.OrdinalIgnoreCase) ||
                rel.Equals("version.json", StringComparison.OrdinalIgnoreCase) ||
                rel.Equals("SOURCES.md", StringComparison.OrdinalIgnoreCase) ||
                rel.Equals("BACKEND_API.md", StringComparison.OrdinalIgnoreCase) ||
                rel.Equals("chat/index.html", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            string ext = Path.GetExtension(rel);
            if (!_mimeTypes.ContainsKey(ext)) return false;
            return rel.StartsWith("css/", StringComparison.OrdinalIgnoreCase) ||
                   rel.StartsWith("js/", StringComparison.OrdinalIgnoreCase) ||
                   rel.StartsWith("data/", StringComparison.OrdinalIgnoreCase) ||
                   rel.StartsWith("res/", StringComparison.OrdinalIgnoreCase);
        }

        private static void WriteText(NetworkStream stream, int code, string reason, string contentType, string text, bool sendBody)
        {
            WriteBytes(stream, code, reason, contentType, Encoding.UTF8.GetBytes(text), sendBody);
        }

        private static void WriteBytes(NetworkStream stream, int code, string reason, string contentType, byte[] data, bool sendBody)
        {
            string headers = string.Format(
                "HTTP/1.1 {0} {1}\r\nContent-Type: {2}\r\nContent-Length: {3}\r\nCache-Control: no-cache\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                code, reason, contentType, data.Length);
            byte[] hBytes = Encoding.ASCII.GetBytes(headers);
            stream.Write(hBytes, 0, hBytes.Length);
            if (sendBody && data.Length > 0) stream.Write(data, 0, data.Length);
            stream.Flush();
        }
    }
}
'@

if (-not ([System.Management.Automation.PSTypeName]'AstroChiefServe.LanHttpServer').Type) {
    Add-Type -TypeDefinition $ServerCode -Language CSharp
}

$server = New-Object AstroChiefServe.LanHttpServer($PSScriptRoot)
$boundPort = $server.Start($Port, [bool]$LocalOnly)
$localUrl = "http://127.0.0.1:$boundPort/"
$lanIps = [AstroChiefServe.LanHttpServer]::GetLanIPv4Addresses()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [AstroChief] LAN & Yerel HTTP Sunucusu Baslatildi" -ForegroundColor Green
Write-Host " Kok Dizin : $PSScriptRoot" -ForegroundColor Gray
Write-Host " Yerel URL : $localUrl" -ForegroundColor White
if (-not $LocalOnly) {
    foreach ($ip in $lanIps) {
        Write-Host " LAN URL   : http://${ip}:$boundPort/" -ForegroundColor Yellow
    }
}
Write-Host " Kapatmak icin Ctrl+C basiniz." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

if (-not $NoBrowser) {
    Start-Process $localUrl
}

try {
    while ($server.IsRunning()) {
        $server.RunStep()
    }
} finally {
    $server.Stop()
}

<#
==========================================================================
DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
--------------------------------------------------------------------------
- Satir 1-13: PowerShell komut dosyasi dokumantasyonu ve Port/NoBrowser/LocalOnly parametreleri.
- Satir 15-242: C# LanHttpServer sinifi; 0.0.0.0 uzerinde ThreadPool destekli TcpListener ve guvenli beyaz liste.
- Satir 244-274: Tipi yukler, belirtilen portta sunucuyu baslatir, yerel ve LAN URL'lerini ekrana yazar ve sunucuyu calistirir.
==========================================================================
#>
