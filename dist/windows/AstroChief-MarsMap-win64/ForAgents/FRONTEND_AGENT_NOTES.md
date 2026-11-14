# AstroChief Frontend Agent Notları (`v2.5.0`)

Bu dosya `readme.md` içindeki **"Ortak AI Ajanları"** kuralı gereği diğer ajanlarla (özellikle **Backend / Pathfinding Ajanı** ve UI/Veri ajanlarıyla) eşgüdüm için oluşturulmuştur.

## 1. Frontend Tarafında Tamamlananlar (`v2.4.0` -> `v2.5.0`)
1. **Navbar'sız Tam Ekran 1:1 HiDPI Mars Küresi + Krater Odaklı Optimize Render (`Foveated`)**:
   - `index.html`, `js/app.js`, `js/components/MarsGlobeViewer.js` ve `js/renderers/MarsGlobeRenderer.js` üzerinde navbar kaldırıldı; `#000000` yıldızlı uzay (`Starfield.js`) üstünde sadece tam ekran gezilebilir Mars küresi çalışır.
   - **Krater Odaklı Render Optimizasyonu**: `MarsGlobeRenderer.renderGlobe()` seçili görev krateri (`activeCrater` -> varsayılan **Gale**, ayrıca **Jezero** / **Korolev**) odak konisi içinde (`~19°`) her pikseli **1:1 HiDPI + bilineer (`sampleBilinearRGB`)** tam çözünürlükte işlerken, kürenin geri kalan uzak bölgelerinde (`2x2` kaba blok atlama + `z<=1..2` + `sampleFastRGB`) işlemci/bellek yükünü ciddi oranda azaltır. `2D Görünüm` ve `MarsTileLoader.requestWindowForZoom()` da `z >= 2` karolarını yalnızca hedef krater bölgesinden çeker.
2. **%100 Kendi `data/` Verilerimizle Çalışan Karo & Görsel Altyapısı**:
   - Dışarıdan görsel üretimi kaldırıldı: Uydular panelindeki Asit Yağmuru kartı doğrudan `data/datasets/images/perseverance_supercam_sol2031.jpg`, Kum / Kasırga kartı ise `data/tiles/mars-viking-mdim21/5/15/56.jpg` yerel dosyalarımızı kullanır.
   - `tools/fetch_mars_tiles.ps1` + `data/datasets/jpl_mars_trek_layers.json` ile 4 katmanda global `z=0..2` + krater `z=3..5` dahil **465 yerel karo** (`data/tiles/manifest.json`) indirildi; çevrimiçi CORS (`Viking/MOLA/THEMIS`) ile `z=3..7` akışı açıktır.
3. **Zorunlu Kurallar Uyumu (`readme.md`)**:
   - Sol üstte **Ayarlar (`⚙️`)** menüsünde **1. seçenek `Factory Reset`** (`SettingsMenu.js`), altında Backend URL girişi, ölçek/radyasyon standartları (`Litre`, `km/m`, `Saat`, `Alfa/Beta/Gama`) bulunur.
   - Sol altta **Uydular Paneli (`SatelliteDockMenu.js`)**: Açılır pencerede `2D Görünüm`, `3D Görünüm` ve arka planında fotoğraf (`data/datasets/images/perseverance_supercam_sol2031.jpg`, `data/tiles/mars-viking-mdim21/5/15/56.jpg`) bulunan **Asit Yağmuru** & **Kum / Kasırga** şiddet (`low`/`moderate`/`severe`) seçicileri yer alır.
   - `readme.md` dosyasına kesinlikle dokunulmadı; her değişiklik öncesi `backups/` altına yedek alındı ve `logs/change_log.txt` satır satır güncellendi; her kod dosyası `< 800` satır ve alt kısmında Türkçe satır açıklamalıdır.

## 2. Backend & Diğer Ajanlarla Ortak Planlananlar
Frontend tarafında **tüm backend uç noktaları, A/B koordinat seçimi ve rota çizim yuvaları** açık bırakılmıştır (ayrıntılı JSON şemaları için kök dizindeki [BACKEND_API.md](../BACKEND_API.md) dosyasına bakın):
* **Bağlantı Yöntemleri**: `?api=http://127.0.0.1:8000`, `window.ASTROCHIEF_CONFIG.apiBaseUrl` veya Sol Üst Ayarlar -> Backend URL alanı.
* **Backend Ajanının Sağlayacağı Uç Noktalar (`/api/v1/*`)**:
  1. `GET /api/v1/health`
  2. `POST /api/v1/pathfind/compute` -> A (`start`) & B (`goal`) koordinatları + `filters` (`avoid_acid_rain`, `acid_rain_intensity`, `avoid_dust_storm`, `dust_storm_intensity`, `avoid_radiation_hotspots`) alır; `primary_route` (**Mavi `#2563eb`**) ve `alternative_route` (**Soluk Mavi `#93c5fd`**) döner.
  3. `GET /api/v1/hazards/live`
  4. `GET /api/v1/radiation/zones`
  5. `GET /api/v1/telemetry/elevation`
  6. `GET /api/v1/craters`
  7. `GET /api/v1/tiles/{layer_id}/{z}/{y}/{x}` (Özellikle CORS başlığı olmayan `SIM3292_Global_Geology` `z>=3` ve özel HiRISE GeoTIFF karoları için proxy).
* **JS Olay Kancaları**: `window.astroChiefGlobe`, `astrochief:coordinate-picked`, `astrochief:viewport-changed`, `astrochief:backend-route-ready`.

## 3. Canlı Sunucu & Görev İletişim (Chat & Dosya Aktarımı) Altyapısı (`v2.5.1`)
- **Canlı Dağıtım**: `https://mars.kubitron.com` adresinde Nginx + Let's Encrypt SSL ve PHP-FPM ile aktif.
- **Güvenli Görev İletişim & Dosya Aktarımı**:
  - `api/chat.php`: SQLite3 kalıcı depolama (`storage/chat.db`), XSS koruması, IP bazlı rate limiting (1 sn ara, max 15 dosya/dk).
  - Katı Güvenlik: Yalnızca beyaz listedeki uzantılara izin verilir (`.jpg`, `.png`, `.webp`, `.pdf`, `.txt`, `.log`, `.json`, `.geojson`, `.csv`, `.zip`), MIME analizi yapılır, dosyalar rastgele 32 baytlık kriptografik token ile adlandırılır.
  - Nginx Güvenlik Kuralları: `storage/` ve `backups/` dizinlerine HTTP'den erişim engellendi (`404`), `uploads/` dizininde her türlü script çalıştırılması (`.php`, `.sh`, `.exe` vb.) `403 Forbidden` ile bloke edildi.
  - Arayüz (`MissionChat.js` & `chat.css`): Sağ altta sabit açılır buton, ekip rolleri (Atahan Kaptan, Akif Lead Dev vb.), gerçek zamanlı polling ve dosya önizlemeleri.

## 4. GitHub -> `mars.kubitron.com` Otomatik Web Dağıtım (CI/CD)
- **GitHub Actions (`.github/workflows/deploy-mars-web.yml`)**: `main` dalına web dosyası (`index.html`, `version.json`, `api/`, `chat/`, `css/`, `js/`, `data/`) pushlandığında `<800` satır, JSON ve `manifest.json` kontrolü yapar; `DEPLOY_SSH_KEY` + `DEPLOY_USER` (veya `DEPLOY_WEBHOOK_URL`) tanımlıysa `storage/` ve `uploads/` dizinlerini koruyarak `mars.kubitron.com` sunucusuna deploy eder.
- **Sunucu Otomasyonu (`tools/server/deploy_web_sync.sh`, `install_autodeploy.sh`, `api/github_webhook.php`)**: VPS üzerinde 30 saniyelik Systemd timer veya HMAC-SHA256 doğrulamalı GitHub Webhook ile web değişikliklerini çeker (`chat.db` ve `uploads/` korunur). Kurulum adımları: `tools/server/README.md`.
