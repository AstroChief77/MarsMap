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
| Her dosya < 800 satır & OOP | Uygulandı | Tüm modüller < 800 satır (`MarsNavigatorController.js`: 615, `BackendApiService.js`: 638, `Map3DRenderer.js`: 638) |
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
  - `Map3DRenderer.js` ve `Map3DFallbackRenderer.js` modüler olarak ayrıldı; `MarsNavigatorController.js` `MarsMapInteractionHelper.js` bölünmesiyle 615 satıra, `BackendApiService.js` `MolaAStarGridHelper.js` bölünmesiyle 638 satıra indirildi.

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

## 11. Büyük Temizlik, Runtime / CI Düzeltmeleri & Git Hijyeni (`v4.3.1`)
- **Rota Hatası ve `< 800` Satır Modüler Bölünme (`MolaAStarGridHelper.js`, `MarsMapInteractionHelper.js`, `BackendApiService.js`, `MarsNavigatorController.js`)**:
  - `BackendApiService` üzerinde eksik olan `shortestDeltaLon` metodu tamamlandı ve yerel A* yedeğinde (`solvePathLocalAStar`) başlangıç `avaible_oxy` hesabı düzeltildi.
  - MOLA koridor örneklemesi / küresel A* ızgara mantığı `MolaAStarGridHelper.js` (221 satır), tuval/kamera etkileşim mantığı ise `MarsMapInteractionHelper.js` (271 satır) olarak ayrıldı; `BackendApiService.js` 638 satıra ve `MarsNavigatorController.js` 615 satıra düşürüldü.
- **CI `validate-web` & `index.html` UTF-8 Düzeltmeleri**:
  - `data/tiles/manifest.json` repoda izlenen gerçek **465** yerel karoyla (`120 + 120 + 105 + 120`) senkronize edilerek CI karo eksikliği hatası giderildi.
  - `index.html` içindeki mojibake karakterler temizlendi, başlık `v4.3` olarak güncellendi, yeni yardımcı betikler `index.html` ve `demo/index.html` içine bağlandı ve `js/wasm/*.d.ts` dosya sonu açıklamaları tamamlandı.
- **Git Deposu & Derleme Hijyeni (`.gitignore`, `dist/`, `backups/`)**:
  - Takılı kalmış `.git/rebase-merge` durumu `git rebase --quit` ile temizlendi; `.gitignore` eklendi ve `dist/` ile `backups/` yerel diskteki kopyalar korunarak Git indeksinden (`git rm -r --cached`) çıkarıldı.
- **İmleç Odaklı (Cursor-Anchored) 2D/3D Zoom & `marsmap.wiki` Canlı Düzeltmesi**:
  - `RouteGeometryHelper.js` içine `computeWheelTargetZoom`, `computePanStep` ve `computeZoomToPoint` (`_computeZoomToPoint2D` / `_computeZoomToPoint3D` — pitch, yaw, pivotZ, MOLA kabartma ters çözümü) eklendi; hem ana harita (`MarsMapInteractionHelper.js`) hem `/demo` (`DemoStudioController.js`) fare tekerleğinde imlecin gösterdiği Mars koordinatına yakınlaştırır (`?v=4.3.1` cache-bust).
  - `marsmap.wiki` VPS (`/var/www/marsmap.wiki` + Nginx `/etc/nginx/sites-available/marsmap.wiki`) v4.3.x dosyalarıyla senkronlandı ve `//demo` çift taksim yolları `301 -> /demo/` olacak şekilde düzeltildi.

## 12. Zenginleştirilmiş Backend Veri Sözleşmesi & `Mustafa` Dalı Örnek JSON (`v4.3.2`)
- **Tam Koridor & Fizik Yükü (`MarsTopographyService.js`, `MolaAStarGridHelper.js`, `BackendApiService.js`, `BACKEND_API.md`)**:
  - Varsayılan koridor A* çözünürlüğü `24×24`'ten **`48×48`**'e çıkarıldı ve her hücrede 5-noktalı maksimum eğim örneklemesi eklendi.
  - `POST /api/v1/route` artık yalnızca başlangıç/bitiş noktalarını değil; `terrainGrid` (`elevMeters`, `slopeDegs`, `blockedMask`, `gridFlatI32`, `lats`, `lons`, `cellSizeMeters`), `routeGeometrySummary`, `terrain.nearbyFeatures` (krater/volkan kataloğu), `factors.radiation` limitleri ve `Prameters.md` kalibrasyonlu `factors.astronaut` / `factors.vehicleAndPhysics` alanlarını da iletir.
  - `computeViaRustWasm` üzerinde `fallbackStage` (`1|2|3`) ve dik eğim esnetme uyarıları (`fallbackWarning`) görünür hale getirildi.
- **GitHub `Mustafa` Dalı (`ornek_json.json` & `ornek_json/`)**:
  - `origin/Mustafa` dalına gerçek `48×48` MOLA DEM verisinden üretilen tam istek örneği (`ornek_json.json`), yakın krater kaçınma senaryosu, yanıt şeması ve geliştirici rehberi eklendi.

## 13. Açık Gri Stüdyo GUI Dönüşümü & `4c02347` Birleştirme / Görünüm Cilası (`v4.4.0`)
- **`4c02347` Birleştirmesi & Tam Açık Gri Stüdyo Teması (`css/variables.css`, tüm CSS ve Renderer katmanı)**:
  - Üst arama + koordinat çubuğu (`#nav-search-form`), `0°` düz 3D küre başlangıcı, `78×78` kare uydu fotoğraflı `Uydular` tetikleyicisi, kompakt varsayılan kapalı `Rota Planlayıcı` ve aşamalı karo yükleme yedeği korunurken koyu/siyah/karışık yüzeyler **Açık Gri Stüdyo** paletine çevrildi (`%60` beyaz/buzlu cam `rgba(255,255,255,0.95)`, `%30` açık gri `#dfe4ec`/`#eef2f6`/`#dfe5ee` & yüksek kontrastlı slate metin `#1e293b`/`#334155`, `%10` Mars kırmızısı `#d92b2b` & rota mavisi `#2563eb`).
  - `Map3DRenderer.js`: `!pixels` aşamalı yükleme dokusu açık kumtaşına (`235/214`), `drawLoadingSphere` `#dfe5ee` / `#94a3b8` / `#1e293b` tonlarına, `drawNomenclature3D` ise `claimLabelSlot` çakışma önlemeli slate halo etiketlere güncellendi.
  - `/`, `/demo/` ve `/chat/` sayfalarının tamamı aynı açık gri tasarım diline hizalandı (`version.json`: `4.4.0`, `?v=4.6`).
- **HUD Rozetleri, Arama & 2-Satırlı Yol Yorumu Düzeltmeleri**:
  - `MarsMapInteractionHelper.js` & `MarsNavigatorController.js`: `handleSearchQuery` içindeki krater yerelleştirme, `0..360°` boylam sarmalama ve bulunamadı bildirimi düzeltildi; `onPanelToggle` ve `onToggleInspector` ile panel açılış/kapanışında `uiAvoidRects` yeniden hesaplanır (`MarsNavigatorController.js` ve `DemoStudioController.js` `< 800` satır).
  - `RouteInspectorPanel.js`: `.insp-source-pill` (`🦀 Rust Backend`) ve `#insp-latency-pill-card` (`⏱ ms`) ayrı esnek yığına alınarak birbirini ezmesi engellendi.
  - `RouteCanvasRenderer.js`: `drawDeferredRouteComment` açık orta koridor genişliğini (`_avoidRects`) hesaplayıp uzun rota yorumlarını 1–2 satıra bölerek yan kartların altına taşmasını tamamen önler.

## 14. Birleşik Rover + İnsan Seferi, Bilim Sekmesinin Kaldırılması & Zorunlu Parametre Kapısı (`v4.4.0`)
- **Birleşik Sefer Modları (`MissionBudgetHelper.js`, `MarsSimulationEngine.js`, `RouteCanvasRenderer.js`, `RoutePlannerService.js`)**:
  - Ayrık Rover-yalnız / İnsan-yalnız / Otonom Robot seyahat modları tamamen kaldırıldı; insan ve rover her zaman birlikte ilerler (`rover-crew`: *Rover + Ekip* `14.5 km/sa`, `joint-eva-escort`: *Rover + Yaya EVA* `3.6 km/sa`).
  - `🤖 Bilim` sekmesi ve `robotic-perseverance` senaryosu `demo/index.html` ve tüm UI modüllerinden kaldırıldı; 4. senaryo `🛰 Jezero 2D Delta Geçişi` (`jezero-delta-2d`) ile değiştirildi.
- **Zorunlu Ön-Görev Parametre Kapısı (`AppConfig.js`, `RouteInspectorPanel.js`, `MarsNavigatorController.js`, `DemoScenarioService.js`, `DemoStudioController.js`)**:
  - Başlangıç `O₂ (L)`, `Enerji (kWh)` ve `Su (L)` değerleri varsayılan `null`/boş başlar; pozitif değerler girilmeden rota hesaplama, senaryo/oynatma başlatma ve zaman kaydırma engellenir.
  - Varış özetleri dakika/saat, hız (`km/sa` + `m/dk`), başlangıç `% + L` → varış `L + %` oksijen/enerji bütçesi, su rezervi ve `< %20` O₂ Walkback / `< %35` Batarya uyarılarını gösterir; `#insp-latency-pill-card` ile Sol 2031 durak kartı ve Açık Gri Stüdyo kontrast uyumu (`?v=4.6`) tamamlandı.

## 15. Sadeleştirilmiş Sağ Üst Rota Paneli (`?v=4.8`)
- **`RouteInspectorPanel.js`, `css/inspector.css`, `BackendApiService.js`, `data/i18n/*.js`**:
  - Tek satırlı aç/kapa düğmesi, tek satırlı `Konum → Hedef` başlığı, çift koordinat tekrarsız hedef listesi + `📍 Harita`, kompakt 2×2 `O₂ / Enerji / Su / Hız` girişleri ve yalnızca `Rotayı Hesapla` tıklanınca açılan kapı uyarısı uygulandı.
  - Boş bekleme kutusu, `KÜRESEL ROTA` / `🦀 Rust Backend` / `⏱ ms` rozetleri ve adım içi `(x, y)` / `MOLA` / `Δz=` geliştirici metinleri kaldırıldı; sonuçlar 3'lü KPI (`Süre`, `Kalan O₂`, `Kalan Enerji`) ve varsayılan kapalı `<details>` (`Adımlar`, `Radyasyon`, krater içi `EVA Durakları`) içine alındı.
  - İkinci sadeleştirme (`?v=4.9`): kart içindeki tüm iç kutucuklar, `%100` rozetleri ve akordeon çerçeveleri kaldırılarak 4 girişli tek satır mikro ızgara, düz hero özet satırı, `Başlat + ↻` aksiyon satırı ve metin tabanlı isteğe bağlı çekmece düzenine (`286px`) geçildi; harita üzerindeki rota etiketinden geliştirici motor adı kaldırıldı.

## 16. `marsmap.wiki` Canlı VPS Dağıtımı & SSH Takma Adı
- **SSH Yapılandırması (`~/.ssh/config`)**: Diğer sohbetlerin doğrudan bağlanabilmesi için `C:\Users\nasaapp\.ssh\config` içine `Host marsmap.wiki` ve `Host 20.102.97.92` tanımları eklendi (`User Adminstrator`, `IdentityFile ~/.ssh/id_ed25519`).
- **Web Kök Dizini**: `/var/www/marsmap.wiki` (`www-data:www-data`). Windows PowerShell'de `tar | ssh` borusu ikili akışı bozduğu için `tar -czf` ile arşivi oluşturup `scp` ile `/tmp/`'e aktarıp sunucuda `sudo tar -xzf ... -C /var/www/marsmap.wiki` ile açmak gerekir.

## 17. Orbital Titanium Slate Teması (`?v=5.7`)
- **Dengeli Kobalt Uzay & Buzlu Titanyum Cam Arayüz (`css/variables.css`, CSS ve Canvas Renderer katmanı)**:
  - Göz yoran saf beyaz (`#ffffff`) ile boğucu siyah (`#020409` / `#0d131e`) yerine **kobalt gece uzayı** (`#283c5e -> #1a2842 -> #121c30`) üzerinde **orta ton buzlu titanyum/arduvaz cam** (`rgba(54, 70, 96, 0.86)`, `#3d4e6b`, `#455878`, `--ink-black: #f1f5f9`) yüzeylere geçildi (`color-scheme: dark`).
  - `OverlayDrawHelper.js`, `RouteCanvasRenderer.js`, `Map3DRenderer.js`, `SimulationChartRenderer.js` (`#25344b`), `satellites_panel.css` (ferah uydu fotoğrafları) ve `chat.css` aynı dengeli tonlarla `?v=5.7` üzerinden güncellendi; `StarfieldRenderer.js` (`?v=5.8`) arka plan kesikli yörünge halkaları kaldırıldı.

## 18. Demo Sürümü Emojisiz Bootstrap Icons & Tuval Vektör Simgeleri (`v4.6.1` / `?v=5.9`)
- **Çevrimdışı Simge Paketi (`res/bootstrap-icons/`)**:
  - `readme.md` CDN yasağı kuralı doğrultusunda **Bootstrap Icons v1.11.3** (`bootstrap-icons.min.css`, `LICENSE`, `fonts/bootstrap-icons.{woff2,woff}`) yerel `res/bootstrap-icons/` dizinine kuruldu; çalışma zamanında dış ağ çağrısı yapılmaz (`SOURCES.md` madde 10).
- **Demo Arayüz Emojilerinin Kaldırılması (`?v=5.9`)**:
  - `demo/index.html`, `css/style.css`, `css/demo_studio.css`, `css/demo.css`, `DemoStudioController.js`, `DemoControlBar.js` ve `SettingsPanel.js` (`#btn-demo-mode`) üzerindeki tüm Unicode emojiler yerel Bootstrap `<i class="bi ...">` simgeleriyle ve flex/satır-içi hizalamayla değiştirildi (`version.json`: `4.6.1`).
- **Harita Tuvali Vektör Simgeleri (`OverlayDrawHelper.js`, `Map2DRenderer.js`)**:
  - `OverlayDrawHelper._drawPillIcon` ile tehlike hapları (`acid` damla, `storm` rüzgar çizgileri, `rad` radyasyon trefoili) ve `A`/`B` hedef etiketleri (`origin`/`dest` nişan halkası) doğrudan `<canvas>` üzerinde vektörel çizilir; tuval etiketlerindeki ve krater radyasyon etiketlerindeki emojiler temizlendi (`794` satır, `< 800` kuralı korundu).

## 19. Su Parametresinin Kaldırılması (`v4.7.0`, `?v=5.9`)
- **Yalnızca `O₂ (L)` + `Enerji (kWh)` + `Hız (km/sa)` Görev Kapısı**:
  - Kullanıcı talebi doğrultusunda su girdisi (`#inp-mission-water`, `#sim-water-inp`), zorunlu `water` doğrulama anahtarı, soğutma/içme suyu tüketim ve varış bütçesi hesaplamaları (`MissionBudgetHelper.js`, `MarsSimulationEngine.js`, `RoutePlannerService.js`, `BackendApiService.js`, `StateStorageService.js`, `AppConfig.js`), `/demo` su telemetri çubuğu ve 9 dilli (`localesMission.js`, `localesDemo.js`, `localesTrEnDe.js`, `localesFrEs.js`, `localesJaKoArHe.js`) su uyarıları kaldırıldı.
  - `.insp-param-grid` 3 sütunlu (`O₂ / Enerji / Hız`) dengeli düzene alındı; ayarlarda `Hacim & Rezerv` satırı `O₂ L / kWh` gösterir (`?v=5.9`).
