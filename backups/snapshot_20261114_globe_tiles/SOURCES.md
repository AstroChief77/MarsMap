# AstroChief - Kullanılan Kaynaklar ve İndirilen Veri Setleri

Bu belgede projede kullanılan tüm NASA kaynakları, haritalama araçları, veri setleri ve yerel olarak depolanan veri dosyaları listelenmektedir.

## NASA Yasal Uyarı Metni (Disclaimer)
> NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.

---

## İndirilen ve Yapılandırılan Veri Setleri

1. **Jet Propulsion Laboratory’s (JPL) Mars Trek**
   - **Resmi URL:** https://trek.nasa.gov/mars/
   - **İndirilen Veri Dosyaları:**
     * `data/datasets/mars_landing_sites.json` (Tüm başarılı Mars iniş sahaları koordinat, irtifa ve görev verisi)
     * `data/datasets/jpl_mars_trek_layers.json` (WMTS/XYZ karo servisleri, MOLA DEM, THEMIS IR ve sabitler)
   - **Kullanım Alanı:** Mars yüzeyi etkileşimli haritalandırma, iniş bölgeleri koordinatları ve topoğrafik incelemeler.

2. **USGS-NASA Planetary Geologic Mapping Program**
   - **Resmi URL:** https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars
   - **İndirilen Veri Dosyası:**
     * `data/datasets/usgs_mars_geology.json` (Noachian, Hesperian, Amazonian birimleri, sürülebilirlik endeksi, asidik sülfat zonları)
   - **Kullanım Alanı:** Mars yüzeyinin jeolojik katmanları, mineral dağılımı, zemin batma riski ve kimyasal aşınma analizleri.

3. **Curiosity Rover Route Map: Lower Mount Sharp (Visual & Waypoints)**
   - **Resmi URL:** https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/
   - **İndirilen Veri Dosyası:**
     * `data/datasets/curiosity_mount_sharp_route.json` (Bradbury Landing'den Gediz Vallis'e tırmanış istasyonları, eğimler, tehlike düzeyleri)
   - **Kullanım Alanı:** Gezici (rover) keşif rota planlaması, tırmanış açısı ve aşınma hesaplamaları.

4. **NASA Worldview & Mars Atmospheric Observations**
   - **Resmi URL:** https://worldview.earthdata.nasa.gov/
   - **İndirilen Veri Dosyası:**
     * `data/datasets/nasa_worldview_and_hazards.json` (Toz fırtınası koridorları, asidik sis/gaz riskleri, rüzgar şiddetleri ve güvenli koridorlar)
   - **Kullanım Alanı:** Fırtına ve çevresel tehlikelere göre dinamik rota optimizasyonu.

5. **Mars Perseverance Raw Images Gallery (NASA Mars 2020)**
   - **Resmi URL:** https://mars.nasa.gov/mars2020/multimedia/raw-images/
   - **İndirilen Veri Dosyası:**
     * `data/datasets/perseverance_raw_images.json` (Jezero Krateri'nden canlı ham görsel metadataları, kameralar, sol ve optik bağlantılar)
     * `data/datasets/images/perseverance_supercam_sol2031.jpg` (Örnek yüksek çözünürlüklü ham yüzey fotoğrafı)
   - **Kullanım Alanı:** Yüzey fotoğrafları, kamera ham verileri ve optik teyit.

6. **NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map**
   - **Resmi URL:** https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/
   - **Yerel Yapılandırma:** `data/craterLocations.js`, `data/craterWaypointsData.js`
   - **Kullanım Alanı:** Gale Krateri (Boxwork formasyonları), Jezero Krateri (Delta) ve Korolev Krateri EVA yürüyüş rotaları.

7. **Tipografi & Tasarım Kaynakları**
   - **Font Ailesi:** Public Sans (Google Fonts CDN / Public Sans Web, sans-serif, Bold 700-900)
   - **Resmi API:** `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json`

8. **Harita Projeksiyon, Şablon ve Çoklu Platform Derleme Araçları**
   - **Projeksiyon & Şablon Referansları:** NASA Mars Trek (`https://trek.nasa.gov/mars/`, `EPSG:104905` Equirectangular & 3D Globe modu) ve Google Maps kurumsal Sidebar + Header düzeni
   - **Windows Derleyici:** Microsoft .NET Framework `csc.exe` (`tools/WinLauncher.cs` -> `MarsMap-win64.exe` bağımsız yerel sunucu ikilisi)
   - **Linux Paketleyici:** POSIX Bash başlatıcı (`tools/launch-linux.sh`) + `tar.exe` (`.tar.gz`) ve SHA-256 doğrulama manifestosu (`tools/build_tool.ps1`)
