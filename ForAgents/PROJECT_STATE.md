# AstroChief Project State — v3.9.0 Complete Audit Resolution & Optimization

Bu belge, `ForAgents/` klasörü altındaki ortak yapay zekâ ajan iletişim dokümanıdır (`readme.md` kuralı gereğince oluşturulmuştur).

## 1. Yapılan Yeniden Yazım (From Scratch Architecture — v3.0.0 .. v3.9.0)
Eski v2.4.0 sürümünde harita varsayılan olarak 3D başlıyordu, güvenli rota hesaplaması devre dışı bırakılmıştı, dış ağ (Google Fonts / Unsplash) çağrıları vardı ve sol alt "Uydular" paneli fotoğraf arka planlı kompakt yapıda değildi. v3.0.0–v3.9.0 ile proje **`readme.md` kurallarının tamamına uyacak şekilde baştan yazıldı ve `rapor.md` denetim bulgularının tamamı kapatıldı**:

- **Varsayılan 3D Başlangıç (`AppConfig.getFactoryDefaults`)**: `viewMode: "3d"`, `enable3DTerrain: true`, `topoReliefScale: 1.0`, `camPitch: 28`, `camYaw: 0` olarak başlar.
- **Merkez Tam Ekran Mars Haritası (`index.html`, `Map2DRenderer.js`, `Map3DRenderer.js`, `Map3DFallbackRenderer.js`)**: Yıldızlı siyah uzay (`StarfieldRenderer.js`) üstünde `./data/tiles/` karo piramidinden gerçek NASA Mars Trek yüzey karolarını çizer.
- **Çevrimdışı `res/` Paketi (`css/fonts.css`, `res/fonts/`, `res/images/`)**:
  - `Public Sans Web` (`400, 600, 700, 800, 900`, latin + latin-ext `.woff2`) yerel `res/fonts/` içine indirildi.
  - Sol alt `Uydular` panelindeki her seçenek için Mars bölge fotoğrafları `res/images/` altına kaydedildi (`sat_2d_view.jpg`, `sat_3d_view.jpg`, `acid_rain_region.jpg`, `dust_storm_region.jpg`, `radiation_region.jpg`, `perseverance_supercam_sol2031.jpg`). Runtime'da internetten kütüphane/font çekilmez.
- **Sol Üst Ayarlar (`SettingsPanel.js`)**:
  - Açıldığında **1. seçenek `Factory Reset`**.
  - Fabrika standartları: Ölçek yaklaştıkça Progressive LOD render (yalnızca görünür ekran karoları), birimler (`Litre`, `km`/`m`, `Saat`) ve `Alfa (α) / Beta (β) / Gama (γ)` + `Foton Bombardımanı` alanları görünürdür.
- **Sol Alt "Uydular" Paneli (`SatellitesPanel.js`, `satellites_panel.css`)**:
  - Görünüm (`2D` / `3D`), Asit Yağmuru (+ `Hafif / Orta / Şiddetli` pH seçenekleri), Kum Fırtınası (+ `Hafif / Orta / Şiddetli` optik derinlik τ seçenekleri), α/β/γ Foton kuşağı ve karo katmanları **tamamı Uydular penceresinin içinde**, az ve öz yazılarla ve arka planlarında ilgili Mars bölge fotoğraflarıyla yer alır.
- **Güvenli Rota, Radyasyon, Rezerv ve EVA Durakları (`BackendApiService.js`, `RouteInspectorPanel.js`, `RouteCanvasRenderer.js`)**:
  - **En Güvenli Kısa Yol (Mavi `#2563eb`)** asit yağmuru, kum fırtınası/kasırga ve foton alanlarından kaçınarak Rust WASM / HTTP API / yerel A* motoruyla hesaplanır.
  - Harita üstünde yol yorum satırları (`// Mavi Yol: ...`) ve sağ üst panelde `Saat`, `km / m`, `O₂ Litre (420L rezerv kontrolü)`, `Su Litre (24L rezerv kontrolü)`, `α/β/γ + Foton Akısı` ve `EVA Durakları` canlı güncellenir.
- **FPS < 10 Ayar Koruma Servisi (`FpsGuardService.js`)**:
  - Herhangi bir ayar değiştirildiğinde (çoklu ardışık ayar kuyruğu `pendingGuards` ve derin kopya `cloneSnapshot` destekli) gerçek veya simüle FPS 10'un altına düşerse değişikliği iptal edip bir önceki duruma geri döner ve kullanıcıya kırmızı uyarı bandı gösterir.
- **OS Duyarlı Derleme ve Masaüstü Dağıtımı (`tools/build.py`, `build.sh`, `tools/build_tool.ps1`)**:
  - Çalıştığı işletim sistemini (Linux / Windows) otomatik algılar; Linux `.tar.gz` veya Windows paketini üretip Masaüstündeki `AstroChief-MarsMap` dizinine kopyalar.

## 2. Kural Uyum Özeti
| Kural | Durum | Uygulayan Modül / Kanıt |
|---|---|---|
| `readme.md` dokunulmazlığı | Korundu | `git diff readme.md` temiz |
| Değişiklik öncesi yedek (`backups/`) | Uygulandı | `backups/snapshot_20261114_rapor_fixes/` |
| Her dosya < 800 satır & OOP | Uygulandı | Tüm modüller < 800 satır (`MarsNavigatorController.js`: 776, `Map3DRenderer.js`: 638) |
| Alt satır/işlev özeti & loglama | Uygulandı | Tüm kaynak kod dosyalarının sonunda ve `logs/change_log.txt` |
| %60 Beyaz / %30 Siyah / %10 Kırmızı + Public Sans Web | Uygulandı | `css/variables.css`, `css/fonts.css`, `css/inspector.css`, `css/chat.css` |
| İşletim sistemine göre derleme + Masaüstü | Uygulandı | `tools/build.py`, `build.sh`, `tools/build_tool.ps1` |

## 3. Harita Netliği & Yakınlaştırma Donması Düzeltmesi
- **Yüksek Çözünürlüklü Hibrit Karo Piramidi (`MarsTileLoader.js`, `offlineDatasets.js`, `manifest.json`)**: `data/tiles/manifest.json` diskteki gerçek **465** yerel karoyla (`z=0..5`) 1:1 senkronize edildi; diskte bulunmayan karolar için doğrudan çevrimiçi CORS NASA Trek WMTS (`z=3..7+`) devreye girer, yetim `"queued"` önbellek zehirlenmesi (`dropStaleQueuedTiles`) ve kalıcı `"error"` kilidi (`15 sn` yeniden deneme + yerel 404 sonrası anında WMTS yedeği) giderildi.
- **Akıcı & Keskin 2D/3D Render (`Map2DRenderer.js`, `Map3DRenderer.js`, `Map3DFallbackRenderer.js`)**: `Map3DRenderer.js:378` üzerindeki `ReferenceError: finalRhoSq is not defined` hatası `1 - nzNorm * nzNorm` ile giderildi, senkron `z=3` `getImageData` blokajı kaldırıldı ve `highQualityGlobeRay` parametresi `raycastSphereCrop` içine bağlandı.

## 4. 9 Dilli Çoklu Dil (i18n) Desteği (v3.9.0)
- **Desteklenen 9 Dil**: Türkçe (`tr`, varsayılan), İngilizce (`en`), Almanca (`de`), Fransızca (`fr`), İspanyolca (`es`), Japonca (`ja`), Korece (`ko`), Arapça (`ar`, RTL) ve İbranice (`he`, RTL).
- **`I18nService.js` & Sözlük Tamamlığı**: `getLanguages()` ve `nativeName` uyumluluğu ile `escapeHtml()` eklendi; eksik olan tüm 22 i18n anahtarı 9 dil sözlüğünün tamamına (`180` anahtar/dil) eklendi ve Almanca `warnHazardDetour` yazım hatası düzeltildi.

## 5. 3D Gezegen Gezinme & Gerçek Boyutlu NASA MOLA Topografya Motoru (v3.9.0)
- **`MarsTopographyService.js` (`window.AstroChief.marsTopo`)**:
  - `(285, 315]` hue aralığı boşluğu giderildi, `syncWithMolaTiles` karo çözücüye bağlandı, `projectToElevatedSphere` ve `screenToElevatedMars3D` `buildCameraBasis` ve `zoom: 0.55..80.0` ile birleştirildi.
- **Ters-Projeksiyon ve Kamera Uyumu (`RouteGeometryHelper.js`, `Map3DFallbackRenderer.js`)**:
  - 2D (`32.0x`) ve 3D (`80.0x`, `camPitch`, `camYaw`, `topoReliefScale`) ters-projeksiyon sınırları eşitlendi.

## 6. Resme Basılır Uydular Kartları & 800 Satır Modüler Bölünme (v3.9.0)
- **Doğrudan Fotoğraf Kartı Etkileşimi (`SatellitesPanel.js`, `css/satellites_panel.css`)**:
  - `2D`/`3D`, `Asit Yağmuru`, `Kum Fırtınası` ve `Radyasyon / Foton Kuşağı` kartlarının tamamı doğrudan resme basılarak açılıp kapanır.
- **< 800 Satır Kuralı Uyumu**:
  - `Map3DRenderer.js` ve `Map3DFallbackRenderer.js` modüler olarak ayrıldı; `MarsNavigatorController.js` 776 satıra indirildi.

## 7. Gerçekçi Görev ve Fizik Parametreleri Belgesi (`Prameters.md`)
- **Yeni Kök Referans Dosyası (`Prameters.md`)**: `readme.md` kuralları okunarak, NASA standartları (`NASA-STD-3001`, `xEMU/Apollo PLSS`, `NASA SEV / TM-20220006678`, `Perseverance/Curiosity`, `Mars Fact Sheet`, `Curiosity RAD / OCHMO-TB-020`) doğrultusunda dakika ve saat bazlı gerçekçi görev parametreleri tanımlandı:
  - **İnsan Dakikada Maksimum Oksijen Tüketimi:** Nominal EVA `0.80 – 1.01 L/dk`, ağır tırmanış `1.58 – 2.01 L/dk`, NASA xEMU 10-dk tasarım zirvesi `2.52 L/dk`, mutlak fizyolojik VO₂max tavanı **`3.60 – 4.00 L/dk`** (`216 – 240 L/saat` STP).
  - **Dakikada Rover Hızı:** İnsanlı Basınçlı Rover (SEV) nominal **`166.7 m/dk`** (`10.0 km/saat`), MarsMap seyir **`241.7 m/dk`** (`14.5 km/saat`), güvenli tavan **`300.0 – 316.7 m/dk`** (`18–19 km/saat`); robotik referans Perseverance **`2.53 m/dk`**, Curiosity **`1.50 – 2.33 m/dk`**.
  - **Dakikada İnsan Hızı (EVA):** Uzun yürüyüş **`45.0 m/dk`** (`2.7 km/saat`), kısa nominal **`60.0 m/dk`** (`3.6 km/saat`), güvenli loping üst sınırı **`83.3 – 90.0 m/dk`** (`5.0–5.4 km/saat`).
  - **Ek Parametreler:** Su (`0.013 – 0.0358 L/dk`), CO₂ üretimi, basınçlı rover/giysi batarya & güç (`Wh/dk`), Mars fiziksel sabitleri, eğim sınırları ve α/β/γ radyasyon eşikleri.
- **Yedek & Kaynak Kaydı:** Düzenlenen tüm mevcut dokümanlar (`SOURCES.md`, `ForAgents/*`, `logs/change_log.txt`) öncesinde `backups/snapshot_20261114_prameters/` dizinine yedeklendi; `readme.md` dosyasına dokunulmadı.

## 8. `rapor.md` Güvenlik, Mimari ve Performans Denetimi Çözümleri (v4.1 / v3.9.0)
- **DOM XSS ve URL Güvenliği (`BackendApiService.js`, `SettingsPanel.js`, `RouteInspectorPanel.js`, `ResourceItem.js`)**:
  - `normalizeBaseUrl` yalnızca `http:`/`https:` şemalarını ve yerel/resmi origin allowlist adreslerini kabul eder; protokol-göreli (`//`) ve harici origin adreslerini reddeder.
  - `SettingsPanel`, `RouteInspectorPanel` ve `ResourceItem` içindeki tüm dinamik alanlar HTML kaçışından (`escapeHtml` / `safeUrl`) geçirildi; `#inp-backend-url` yazma odağı ve kaydırma konumu korundu.
- **Rust Backend & A* Motoru (`backend/src/lib.rs`, `backend/src/main.rs`, `js/wasm/backend.js`, `BackendApiService.js`)**:
  - `MarsMap::from_flat` ve `find_path` içinde negatif boyut ve tamsayı taşmaları `usize::try_from`, `checked_mul`, `checked_add` ve `saturating_*` ile engellendi.
  - `backend/src/main.rs` içine `--serve` stdlib HTTP sunucusu (`GET /api/v1/health`, `GET /api/v1/hazards`, `POST /api/v1/route`) eklendi.
  - `BackendApiService` antimeridyen boylam sarması (`shortestDeltaLon`), küresel engel mesafesi (`cos(lat)`), gerçek MOLA DEM rakım örneklemesi ve kademeli engel gevşetmesi (`[1.0, 0.72, 0.45, 0.22, 0.0]`) ile güçlendirildi; `file://` modunda dahi sıfır hatayla rota üretir.
- **Sohbet Modülü ve Sunucu/Dağıtım Güvenliği (`api/chat.php`, `chat/index.html`, `api/github_webhook.php`, `tools/server/*`, `tools/WinLauncher.cs`, `serve.ps1`)**:
  - `api/chat.php`: `send_message` için `POST` zorunluluğu, `limit` alt sınırı (`max(1, min(..., 100))`), sıkı MIME doğrulaması (`in_array($detectedMime, $allowedMimes, true)`), tam dosya içerik taraması, `storage/` ve `uploads/` `.htaccess` koruması, `REMOTE_ADDR` tabanlı yarışsız (`INSERT OR IGNORE`) hız sınırı ve çift kaçış düzeltmesi uygulandı.
  - `chat/index.html`: `../css/chat.css` ve `../api/chat.php` yolları, `uploads/` doğrulaması, `seenMessageIds` tekilleştirmesi ve `rel="noopener noreferrer"` eklendi.
  - Dağıtım ve başlatıcı betiklerinde (`install_autodeploy.sh`, `deploy_web_sync.sh`, `launch-linux.sh`, `WinLauncher.cs`, `serve.ps1`) süreç listesinde token ifşası, `python3 -c` argüman enjeksiyonu, sığ klon boş SHA döngüsü ve `0.0.0.0` varsayılan LAN yayını (`127.0.0.1` loopback varsayılanı ile) kapatıldı.

## 9. Rehberli Jüri Demo Modu & Canlı Rota Simülasyonu (`v4.3.0`)
- **`DemoScenarioService.js` & `DemoControlBar.js` (`css/demo.css`, `data/i18n/localesDemo.js`)**:
  - Üst gezinti şeridine tek tıkla açılan **▶ Demo** düğmesi ve `?demo=1` URL başlatma desteği eklendi.
  - 4 hazır jüri senaryosu (*Gale → Jezero Güvenli Rota*, *Şiddetli Asit & Fırtına Yeniden Rotalama*, *Gale 3D MOLA & Elysium*, *2D Karo Piramidi & Çoklu Katman*), otomatik tur (`Oto-Tur`), oynat/duraklat, `1x–10x` hız seçici, ilerleme kaydırıcı (`scrubber`) ve 9 dilde anlatım ipuçları eklendi.
- **Canlı Rover / EVA Astronot Rota Simülasyonu (`RouteCanvasRenderer.drawDemoSimulation`, `Map3DRenderer.js`, `Map2DRenderer.js`)**:
  - Hesaplanan Mavi rota (`primaryBlue.points`) üzerinde Haversine mesafe enterpolasyonuyla hareket eden animasyonlu **Basınçlı Rover** veya **EVA Astronot** işaretçisi, katedilen parlak iz ve canlı `km` / MOLA rakım / kalan `O₂ (L)` etiketi 2D ve 3D görünümlerde çalışacak şekilde bağlandı.

## 10. Adanmış `/demo` Mars Hayatta Kalma & Rota Simülasyon Stüdyosu (`v4.3.0`)
- **`/demo` (`demo/index.html`, `css/demo_studio.css`, `DemoStudioController.js`, `MarsSimulationEngine.js`, `SimulationChartRenderer.js`)**:
  - Ana gezinti çubuğundaki `▶ Demo` düğmesi (`/`) ve `/demo` / `/demo/` URL yolları doğrudan bu adanmış simülasyon stüdyosunu açar (`serve.ps1` ve `WinLauncher.cs` routing destekli, `<base href="../">` ile göreli asset/WASM uyumlu).
  - `MarsSimulationEngine`: `Prameters.md` kalibrasyonlu 3 profil (`rover` Basınçlı SEV 420 L / 180 m/dk, `eva` Astronot 420 L / 52 m/dk, `robot` Bilimsel Rover 0 L O₂ / 2.53 m/dk); Asit Yağmuru, Toz Fırtınası ve α-β-γ Radyasyonu için dinamik O₂, su, enerji ve hız kaybı eğrileri; canlı `O₂ Sızıntısı` / `Fırtına Patlat` enjeksiyonu ve `%20` Geri Dönüş (Walkback) uyarısı üretir.
  - `SimulationChartRenderer`: Gerçek zamanlı `O₂ %`, `Enerji %`, `MOLA Rakım`, `%20` kritik eşik çizgisi ve canlı zaman imleci çizer.
  - `BackendApiService.js`: WASM mutlak yol çözümü `document.baseURI` tabanlı hale getirilerek `/demo/` alt dizininde de sorunsuz çalışır duruma getirildi.
  - `tools/build_tool.ps1`, `tools/build.py` ve `.github/workflows/deploy-mars-web.yml`: `demo` dizini paketlemeye ve `< 800` satır doğrulamasına dahil edildi; kilitli çalışan `MarsMap-win64.exe` için geçici derleme hedefi koruması eklendi.
