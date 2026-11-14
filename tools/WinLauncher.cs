// ============================================================================
// AstroChief MarsMap - Windows Yerel & LAN Sunucu Calistiricisi (WinLauncher.cs)
// .NET Framework 4.0+ csc.exe ile harici bagimlilik olmadan derlenir.
// Tum yerel ag (0.0.0.0) isteklerini URLACL/admin gereksinimi olmadan karsilar.
// ============================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Text;
using System.Threading;

namespace AstroChiefLauncher
{
    public class StaticLanServer
    {
        private readonly string _baseDir;
        private readonly Dictionary<string, string> _mimeTypes;
        private TcpListener _listener;
        private volatile bool _running;

        public StaticLanServer(string baseDir)
        {
            string full = Path.GetFullPath(baseDir);
            string sep = Path.DirectorySeparatorChar.ToString();
            _baseDir = full.EndsWith(sep) ? full : full + sep;
            _mimeTypes = BuildMimeTable();
        }

        private static Dictionary<string, string> BuildMimeTable()
        {
            Dictionary<string, string> map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            map[".html"] = "text/html; charset=utf-8";
            map[".css"] = "text/css; charset=utf-8";
            map[".js"] = "application/javascript; charset=utf-8";
            map[".json"] = "application/json; charset=utf-8";
            map[".md"] = "text/markdown; charset=utf-8";
            map[".png"] = "image/png";
            map[".jpg"] = "image/jpeg";
            map[".jpeg"] = "image/jpeg";
            map[".svg"] = "image/svg+xml";
            map[".ico"] = "image/x-icon";
            map[".woff2"] = "font/woff2";
            map[".woff"] = "font/woff";
            map[".wasm"] = "application/wasm";
            return map;
        }

        public static List<string> GetLanIPv4Addresses()
        {
            List<string> ips = new List<string>();
            try
            {
                NetworkInterface[] nics = NetworkInterface.GetAllNetworkInterfaces();
                foreach (NetworkInterface nic in nics)
                {
                    if (nic.OperationalStatus != OperationalStatus.Up) continue;
                    if (nic.NetworkInterfaceType == NetworkInterfaceType.Loopback) continue;
                    IPInterfaceProperties props = nic.GetIPProperties();
                    foreach (UnicastIPAddressInformation uni in props.UnicastAddresses)
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
            catch
            {
                // Ag arayuzleri okunamazsa yalnizca localhost bilgisiyle devam et
            }
            return ips;
        }

        public int Start(int requestedPort, bool bindLocalOnly)
        {
            IPAddress bindAddr = bindLocalOnly ? IPAddress.Loopback : IPAddress.Any;
            int port = requestedPort > 0 ? requestedPort : 3000;
            try
            {
                _listener = new TcpListener(bindAddr, port);
                _listener.Start();
            }
            catch (SocketException)
            {
                _listener = new TcpListener(bindAddr, 0);
                _listener.Start();
                port = ((IPEndPoint)_listener.LocalEndpoint).Port;
            }
            _running = true;
            return port;
        }

        public void RunLoop()
        {
            while (_running)
            {
                try
                {
                    TcpClient client = _listener.AcceptTcpClient();
                    ThreadPool.QueueUserWorkItem(HandleClient, client);
                }
                catch (SocketException)
                {
                    if (!_running) break;
                }
                catch
                {
                    if (!_running) break;
                }
            }
        }

        public void Stop()
        {
            _running = false;
            try
            {
                if (_listener != null) _listener.Stop();
            }
            catch
            {
                // Kapatma hatasini yoksay
            }
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
                    int headerCount = 0;
                    while (!string.IsNullOrEmpty(headerLine = reader.ReadLine()))
                    {
                        headerCount++;
                        if (headerCount > 128) break;
                    }

                    string[] parts = requestLine.Split(' ');
                    if (parts.Length < 2)
                    {
                        WriteTextResponse(stream, 400, "Bad Request", "text/plain; charset=utf-8", "400 - Gecersiz istek", true);
                        return;
                    }

                    string method = parts[0].ToUpperInvariant();
                    if (method != "GET" && method != "HEAD")
                    {
                        WriteTextResponse(stream, 405, "Method Not Allowed", "text/plain; charset=utf-8", "405 - Yalnizca GET/HEAD", true);
                        return;
                    }

                    bool sendBody = (method == "GET");
                    ServeStaticPath(stream, parts[1], sendBody);
                }
            }
            catch
            {
                // Istemci erken baglantiyi kapattiginda sessizce temizle
            }
        }

        private void ServeStaticPath(NetworkStream stream, string rawTarget, bool sendBody)
        {
            int qIdx = rawTarget.IndexOf('?');
            if (qIdx >= 0) rawTarget = rawTarget.Substring(0, qIdx);
            int hIdx = rawTarget.IndexOf('#');
            if (hIdx >= 0) rawTarget = rawTarget.Substring(0, hIdx);

            string decoded;
            try
            {
                decoded = Uri.UnescapeDataString(rawTarget);
            }
            catch
            {
                WriteTextResponse(stream, 400, "Bad Request", "text/plain; charset=utf-8", "400 - Gecersiz URL", sendBody);
                return;
            }

            string cleanRel = decoded.Replace('\\', '/').TrimStart('/');
            if (cleanRel.IndexOf('\0') >= 0 || cleanRel.Contains(".."))
            {
                WriteTextResponse(stream, 403, "Forbidden", "text/plain; charset=utf-8", "403 - Erisim reddedildi", sendBody);
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
                WriteTextResponse(stream, 501, "Not Implemented", "application/json; charset=utf-8",
                    "{\"success\":false,\"error\":\"Yerel LAN statik sunucusunda PHP aktif degil; harita ve karolar tam calisir.\"}", sendBody);
                return;
            }

            if (!IsAllowedWebPath(cleanRel))
            {
                WriteTextResponse(stream, 404, "Not Found", "text/plain; charset=utf-8", "404 - Bulunamadi", sendBody);
                return;
            }

            string candidate = Path.GetFullPath(Path.Combine(_baseDir, cleanRel.Replace('/', Path.DirectorySeparatorChar)));
            if (!candidate.StartsWith(_baseDir, StringComparison.OrdinalIgnoreCase))
            {
                WriteTextResponse(stream, 403, "Forbidden", "text/plain; charset=utf-8", "403 - Yasakli yol", sendBody);
                return;
            }

            if (!File.Exists(candidate))
            {
                WriteTextResponse(stream, 404, "Not Found", "text/plain; charset=utf-8", "404 - Dosya bulunamadi: " + cleanRel, sendBody);
                return;
            }

            string ext = Path.GetExtension(candidate);
            string contentType;
            if (!_mimeTypes.TryGetValue(ext, out contentType))
            {
                contentType = "application/octet-stream";
            }

            byte[] data = File.ReadAllBytes(candidate);
            WriteBytesResponse(stream, 200, "OK", contentType, data, sendBody);
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

        private static void WriteTextResponse(NetworkStream stream, int code, string reason, string contentType, string bodyText, bool sendBody)
        {
            byte[] data = Encoding.UTF8.GetBytes(bodyText);
            WriteBytesResponse(stream, code, reason, contentType, data, sendBody);
        }

        private static void WriteBytesResponse(NetworkStream stream, int code, string reason, string contentType, byte[] data, bool sendBody)
        {
            string headers = string.Format(
                "HTTP/1.1 {0} {1}\r\nContent-Type: {2}\r\nContent-Length: {3}\r\nCache-Control: no-store, no-cache, must-revalidate\r\nPragma: no-cache\r\nExpires: 0\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n",
                code, reason, contentType, data.Length);
            byte[] headerBytes = Encoding.ASCII.GetBytes(headers);
            stream.Write(headerBytes, 0, headerBytes.Length);
            if (sendBody && data.Length > 0)
            {
                stream.Write(data, 0, data.Length);
            }
            stream.Flush();
        }
    }

    class Program
    {
        static void Main(string[] args)
        {
            int requestedPort = 3000;
            bool noBrowser = false;
            bool localOnly = false;
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;

            for (int i = 0; i < args.Length; i++)
            {
                if (args[i] == "--port" && i + 1 < args.Length)
                {
                    int parsed;
                    if (int.TryParse(args[i + 1], out parsed)) requestedPort = parsed;
                    i++;
                }
                else if (args[i] == "--no-browser")
                {
                    noBrowser = true;
                }
                else if (args[i] == "--local-only")
                {
                    localOnly = true;
                }
                else if (args[i] == "--root" && i + 1 < args.Length)
                {
                    baseDir = args[i + 1];
                    i++;
                }
            }

            StaticLanServer server = new StaticLanServer(baseDir);
            int port = server.Start(requestedPort, localOnly);
            string localUrl = string.Format("http://127.0.0.1:{0}/", port);

            Console.CancelKeyPress += delegate(object sender, ConsoleCancelEventArgs e)
            {
                e.Cancel = true;
                server.Stop();
            };

            Console.WriteLine("========================================================");
            Console.WriteLine(" AstroChief MarsMap Sunucusu Baslatildi");
            Console.WriteLine(" Kok Dizin : " + baseDir);
            Console.WriteLine(" Yerel URL : " + localUrl);
            if (!localOnly)
            {
                foreach (string lanIp in StaticLanServer.GetLanIPv4Addresses())
                {
                    Console.WriteLine(string.Format(" LAN URL   : http://{0}:{1}/", lanIp, port));
                }
            }
            Console.WriteLine(" Kapatmak icin Ctrl+C veya pencereyi kapatiniz.");
            Console.WriteLine("========================================================");

            if (!noBrowser)
            {
                try
                {
                    Process.Start(new ProcessStartInfo(localUrl) { UseShellExecute = true });
                }
                catch (Exception ex)
                {
                    Console.WriteLine("Tarayici otomatik acilamadi: " + ex.Message);
                }
            }

            server.RunLoop();
        }
    }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-16: Baslik yorumu ve .NET Framework temel ag/dosya kutuphaneleri.
   - Satir 18-50: StaticLanServer sinifi ve yerel .woff2/.js/.json/.png/.jpg MIME tablosu.
   - Satir 52-80: GetLanIPv4Addresses; aktif Wi-Fi/Ethernet LAN IPv4 adreslerini tespit eder.
   - Satir 82-128: Start/RunLoop/Stop; 0.0.0.0 uzerinde ThreadPool destekli TcpListener yonetir.
   - Satir 130-169: HandleClient; GET/HEAD HTTP istek basliklarini guvenli sekilde cozumler.
   - Satir 171-254: ServeStaticPath/IsAllowedWebPath; traversal ve kaynak sizintisini engeller.
   - Satir 256-326: Program.Main; CLI bayraklarini okur, URL listesini basar ve sunucuyu calistirir.
   ========================================================================== */
