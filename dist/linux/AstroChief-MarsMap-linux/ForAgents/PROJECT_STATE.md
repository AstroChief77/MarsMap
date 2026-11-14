# AstroChief Project State — v3.0.0 Complete Rewrite

Bu belge, `ForAgents/` klasörü altındaki ortak yapay zekâ ajan iletişim dokümanıdır (`readme.md` kuralı gereğince oluşturulmuştur).

## 1. Yapılan Yeniden Yazım (From Scratch Architecture — v3.0.0)
Eski v2.4.0 sürümünde harita varsayılan olarak 3D başlıyordu, güvenli rota hesaplaması devre dışı bırakılmıştı, dış ağ (Google Fonts / Unsplash) çağrıları vardı ve sol alt "Uydular" paneli fotoğraf arka planlı kompakt yapıda değildi. v3.0.0 ile proje **`readme.md` kurallarının tamamına uyacak şekilde baştan yazıldı**:

- **Varsayılan 3D Başlangıç (`AppConfig.getFactoryDefaults`)**: `viewMode: "3d"` olarak başlar.
- **Merkez Tam Ekran Mars Haritası (`index.html`, `Map2DRenderer.js`, `Map3DRenderer.js`)**: Yıldızlı siyah uzay (`StarfieldRenderer.js`) üstünde `./data/tiles/` karo piramidinden gerçek NASA Mars Trek yüzey karolarını çizer.
- **Çevrimdışı `res/` Paketi (`css/fonts.css`, `res/fonts/`, `res/images/`)**:
  - `Public Sans Web` (`400, 600, 700, 800, 900`, latin + latin-ext `.woff2`) yerel `res/fonts/` içine indirildi.
  - Sol alt `Uydular` panelindeki her seçenek için Mars bölge fotoğrafları `res/images/` altına kaydedildi (`sat_2d_view.jpg`, `sat_3d_view.jpg`, `acid_rain_region.jpg`, `dust_storm_region.jpg`, `radiation_region.jpg`, `perseverance_supercam_sol2031.jpg`). Runtime'da internetten kütüphane/font çekilmez.
- **Sol Üst Ayarlar (`SettingsPanel.js`)**:
  - Açıldığında **1. seçenek `Factory Reset`**.
  - Fabrika standartları: Ölçek yaklaştıkça Progressive LOD render (yalnızca görünür ekran karoları), birimler (`Litre`, `km`/`m`, `Saat`) ve `Alfa (α) / Beta (β) / Gama (γ)` + `Foton Bombardımanı` alanları görünürdür.
- **Sol Alt "Uydular" Paneli (`SatellitesPanel.js`, `satellites_panel.css`)**:
  - Görünüm (`2D` / `3D`), Asit Yağmuru (+ `Hafif / Orta / Şiddetli` pH seçenekleri), Kum Fırtınası (+ `Hafif / Orta / Şiddetli` optik derinlik τ seçenekleri), α/β/γ Foton kuşağı ve karo katmanları **tamamı Uydular penceresinin içinde**, az ve öz yazılarla ve arka planlarında ilgili Mars bölge fotoğraflarıyla yer alır.
- **Güvenli Çift Rota ve Yol Yorumları (`RoutePlannerService.js`, `RouteGeometryHelper.js`, `RouteCanvasRenderer.js`)**:
  - **En Güvenli Kısa Yol (Mavi `#2563eb`)** ve **Güvenli Uzun Alternatif Yol (Soluk Mavi `#93c5fd`)** asit yağmuru, kum fırtınası/kasırga ve foton alanlarından kaçınarak hesaplanır.
  - Harita üstünde yol yorum satırları (`// Mavi Yol: ...`, `// Soluk Mavi: ...`) ve sağ üst panelde `Saat`, `km / m`, `O₂ Litre`, `Su Litre` metrikleri canlı güncellenir.
- **FPS < 10 Ayar Koruma Servisi (`FpsGuardService.js`)**:
  - Herhangi bir ayar değiştirildiğinde gerçek veya simüle FPS 10'un altına düşerse değişikliği iptal edip bir önceki duruma geri döner ve kullanıcıya kırmızı uyarı bandı gösterir.
- **OS Duyarlı Derleme ve Masaüstü Dağıtımı (`tools/build.py`, `build.sh`, `tools/build_tool.ps1`)**:
  - Çalıştığı işletim sistemini (Linux / Windows) otomatik algılar; Linux `.tar.gz` veya Windows paketini üretip Masaüstündeki `AstroChief-MarsMap` dizinine kopyalar.

## 2. Kural Uyum Özeti
| Kural | Durum | Uygulayan Modül / Kanıt |
|---|---|---|
| `readme.md` dokunulmazlığı | Korundu | `git diff readme.md` temiz |
| Değişiklik öncesi yedek (`backups/`) | Uygulandı | `snapshot_20261114_v2_4_before_rewrite`, `snapshot_20261114_v3_pre_build`, `snapshot_20261114_v3_pre_polish`, `snapshot_20261114_v3_pre_final_polish` |
| Her dosya < 800 satır & OOP | Uygulandı | Tüm modüller <= 495 satır; `tools/build.py` denetler |
| Alt satır/işlev özeti & loglama | Uygulandı | Her kaynak kod dosyası sonunda ve `logs/change_log.txt` |
| %60 Beyaz / %30 Siyah / %10 Kırmızı + Public Sans Web | Uygulandı | `css/variables.css`, `css/fonts.css` |
| İşletim sistemine göre derleme + Masaüstü | Uygulandı | `tools/build.py`, `build.sh`, `tools/build_tool.ps1` |

## 3. Harita Netliği & Yakınlaştırma Donması Düzeltmesi
- **Yüksek Çözünürlüklü Hibrit Karo Piramidi (`MarsTileLoader.js`, `offlineDatasets.js`)**: `data/tiles/manifest.json` (`z=0..5` küresel + krater karoları; `file://` desteği için `offlineDatasets.js` içine de eklendi) ve çevrimiçi CORS NASA Trek WMTS (`z=3..7+`, 30 sn hata devre kesicisi) HiDPI `devicePixelRatio` yoğunluğuna göre tam ekran netliğinde yüklenir; `256x256` tembel piksel çıkarımı `8.4 MB` tam atlas kilitlenmesini kaldırır.
- **Akıcı & Keskin 2D/3D Render (`Map2DRenderer.js`, `Map3DRenderer.js`, `OverlayDrawHelper.js`, `RouteGeometryHelper.js`, `MarsNavigatorController.js`)**: Tuval `devicePixelRatio` (`<=2`) ile ölçeklenir; `2D` `12x` ve `3D` `10x` yakına kadar netleşir ve ters projeksiyon sınırları buna göre güncellenmiştir. Hızlı tekerlek/sürükleme olayları `requestAnimationFrame` (`scheduleRender`) ile tek karede birleştirilir, etkileşim sırasında 3D viewport kırpma tamponu düşük piksel bütçesiyle (`120k px`, `<10 ms`) akıp durduğunda (`140 ms`) `4x4` blok trig enterpolasyonu + tek-karo `Uint32Array` bilineer örneklemeyle yüksek çözünürlüğe netleşir (`backups/snapshot_20261114_fix_pixel_freeze/`).

## 4. 9 Dilli Çoklu Dil (i18n) Desteği (v3.1.0)
- **Desteklenen 9 Dil**: Türkçe (`tr`, varsayılan), İngilizce (`en`), Almanca (`de`), Fransızca (`fr`), İspanyolca (`es`), Japonca (`ja`), Korece (`ko`), Arapça (`ar`, RTL) ve İbranice (`he`, RTL).
- **Modüler Sözlükler & Servis (< 800 Satır Kuralına Tam Uyumlu)**:
  - `data/i18n/localesTrEnDe.js` (`tr`, `en`, `de`)
  - `data/i18n/localesFrEs.js` (`fr`, `es`)
  - `data/i18n/localesJaKoArHe.js` (`ja`, `ko`, `ar`, `he`)
  - `js/services/I18nService.js` (`window.AstroChief.i18n` — `t(key, vars)`, RTL `document.documentElement.dir` yönetimi, krater ve mürettebat yerelleştirmesi)
- **Arayüz Entegrasyonu**: Sol üst `Ayarlar` menüsünde 1. seçenek `Factory Reset` olarak korunmuş, hemen altına 9 dil bayrak/rozet ızgarası (`lang-chip-grid`) eklenmiştir. Sağ üst rota inceleme paneli, sol alt `Uydular` paneli, `Görev & Ekip Bilgisi` modalı, harita üstü tehlike/rota/Boxwork etiketleri ve telemetri çubuğu seçilen dile anında geçer.

## 5. 3D Gezegen Gezinme & Gerçek Boyutlu NASA MOLA Topografya Motoru (v3.3.0)
- **`MarsTopographyService.js` (`window.AstroChief.marsTopo`)**:
  - Mars fiziksel yarıçapı (`R = 3,389,500 m`) ve NASA MGS MOLA rakım aralığı (`-8,200 m .. +21,229 m`) kullanılarak `1024x512` `Int16Array` küresel DEM ızgarası + `Int8Array` Doğu/Kuzey 3D eğim normalleri üretilir ve `./data/tiles/mars-mola-elevation/` karolarıyla gerçek zamanlı senkronize edilir.
  - Olympus Mons (`+21,229 m`), Tharsis Montes (`+14..18.2 km`), Elysium Mons (`+14,127 m`), Valles Marineris (`-7,000 m`), Hellas Planitia (`-7,152 m`), Gale Krateri / Mount Sharp (`+5,500 m`) ve Jezero (`-2,570 m`) gerçek fiziksel ölçekleriyle 3D küre üzerinde yükseltilir.
- **3D Serbest Gezinme (`Map3DRenderer.js`, `MarsNavigatorController.js`)**:
  - Sol tık sürükleme veya `W, A, S, D` / Yön tuşları ile gezegen yüzeyinde 3D gezinme.
  - Sağ tık sürükleme (veya `Shift + Sol tık`, `Q/E` ve `R/F` tuşları) ile 3D kamera yüzey eğimi (`camPitch: 0°..70°`) ve pusula yönü (`camYaw: 0°..360°`).
  - Sağ alt HUD üzerinde `3D Eğim` (`28°/34°/58°/0°`) ve `⛰ Zirve Gez` (Olympus Mons, Valles Marineris, Mount Sharp, Ascraeus Mons, Hellas) kısayolları ile canlı MOLA Rakım (`m`) ve Eğim (`°`) telemetrisi.

