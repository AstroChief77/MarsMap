// ============================================================================
// AstroChief MarsMap - Windows Yerel Sunucu Calistiricisi (WinLauncher.cs)
// .NET Framework 4.0+ csc.exe ile harici bagimlilik olmadan .exe olarak derlenir.
// ============================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;

namespace AstroChiefLauncher
{
    class Program
    {
        // Bos TCP portu bulan yardimci metot
        static int FindFreePort()
        {
            TcpListener probe = new TcpListener(IPAddress.Loopback, 0);
            probe.Start();
            int port = ((IPEndPoint)probe.LocalEndpoint).Port;
            probe.Stop();
            return port;
        }

        static void Main(string[] args)
        {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            int port = FindFreePort();
            string prefix = string.Format("http://127.0.0.1:{0}/", port);

            Dictionary<string, string> mimeTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            mimeTypes[".html"] = "text/html; charset=utf-8";
            mimeTypes[".css"]  = "text/css; charset=utf-8";
            mimeTypes[".js"]   = "application/javascript; charset=utf-8";
            mimeTypes[".json"] = "application/json; charset=utf-8";
            mimeTypes[".png"]  = "image/png";
            mimeTypes[".jpg"]  = "image/jpeg";
            mimeTypes[".svg"]  = "image/svg+xml";
            mimeTypes[".ico"]  = "image/x-icon";

            HttpListener listener = new HttpListener();
            listener.Prefixes.Add(prefix);
            listener.Start();

            Console.WriteLine("========================================================");
            Console.WriteLine(" AstroChief MarsMap Windows Baslatildi: " + prefix);
            Console.WriteLine(" Kapatmak icin bu pencereyi kapatabilirsiniz (Ctrl+C).");
            Console.WriteLine("========================================================");

            try
            {
                Process.Start(new ProcessStartInfo(prefix) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                Console.WriteLine("Tarayici otomatik acilamadi: " + ex.Message);
            }

            while (listener.IsListening)
            {
                try
                {
                    HttpListenerContext ctx = listener.GetContext();
                    string relPath = ctx.Request.Url.LocalPath.TrimStart('/');
                    if (string.IsNullOrEmpty(relPath)) relPath = "index.html";

                    string safeFullPath = Path.GetFullPath(Path.Combine(baseDir, relPath.Replace('/', Path.DirectorySeparatorChar)));
                    if (!safeFullPath.StartsWith(Path.GetFullPath(baseDir), StringComparison.OrdinalIgnoreCase))
                    {
                        ctx.Response.StatusCode = 403;
                        ctx.Response.OutputStream.Close();
                        continue;
                    }

                    if (File.Exists(safeFullPath))
                    {
                        string ext = Path.GetExtension(safeFullPath);
                        string ctype = mimeTypes.ContainsKey(ext) ? mimeTypes[ext] : "application/octet-stream";
                        byte[] data = File.ReadAllBytes(safeFullPath);
                        ctx.Response.ContentType = ctype;
                        ctx.Response.ContentLength64 = data.Length;
                        ctx.Response.OutputStream.Write(data, 0, data.Length);
                    }
                    else
                    {
                        ctx.Response.StatusCode = 404;
                        byte[] msg = Encoding.UTF8.GetBytes("404 - Bulunamadi: " + relPath);
                        ctx.Response.ContentType = "text/plain; charset=utf-8";
                        ctx.Response.OutputStream.Write(msg, 0, msg.Length);
                    }
                    ctx.Response.OutputStream.Close();
                }
                catch
                {
                    // Kapanis sirasinda olusan dinleyici kesintilerini yoksay
                }
            }
        }
    }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-14: Başlık yorumu ve .NET Framework temel kütüphane bildirimleri.
   - Satır 18-26: FindFreePort; çakışma yaşamadan boş yerel TCP portu tespit eder.
   - Satır 28-56: Main; MIME tablosunu hazırlar, HttpListener'ı başlatır ve varsayılan tarayıcıyı açar.
   - Satır 58-92: Gelen HTTP isteklerini kök dizin güvenliği (traversal koruması) ile sunucudan döner.
   ========================================================================== */
