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
     * `data/datasets/jpl_mars_trek_layers.json` (Doğrulanmış WMTS/yerel karo piramidi katman kataloğu)
     * `data/tiles/{mars-viking-mdim21,mars-mola-elevation,mars-themis-day-ir,mars-global-geology}/` (136 adet gerçek NASA PNG/JPG yüzey karosu ve indirme betiği `tools/fetch_mars_tiles.ps1`)
   - **Kullanım Alanı:** Mars küresi ve 2D equirectangular haritada doğrudan `data/tiles/` altından gezinebilen gerçek yüzey dokusu çizimi.

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
   - **İndirilen Veri Dosyaları:**
     * `data/datasets/perseverance_raw_images.json` (Jezero Krateri ham görsel metadataları, kameralar, sol ve optik bağlantılar)
     * `res/images/perseverance_supercam_sol2031.jpg` ve `data/datasets/images/perseverance_supercam_sol2031.jpg` (Perseverance Sol 2031 gerçek ham Mars yüzey fotoğrafı)
   - **Kullanım Alanı:** Yüzey fotoğrafları, krater EVA durak kartları ve optik teyit.

6. **NASA Space Apps Challenge 2026 — Interplanetary Survival Guide: Martian Map**
   - **Resmi URL:** https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/
   - **Yerel Yapılandırma:** `data/craterLocations.js`, `data/craterWaypointsData.js`, `js/services/HazardFieldService.js`, `js/services/RoutePlannerService.js`
   - **Kullanım Alanı:** Asit yağmurları, kum fırtınaları ve Alfa/Beta/Gama foton bombardımanı risklerinden kaçınan en güvenli kısa (**Mavi `#2563eb`**) ve güvenli uzun (**Soluk Mavi `#93c5fd`**) rotaların `Saat`, `km/m` ve `Litre` birimleriyle hesaplanması.

7. **Yerel Tipografi & Bölge Görselleri (`res/` Arşivi — İnternet Çekimi Yasaktır)**
   - **Font Ailesi (`res/fonts/`):** `Public Sans Web, sans-serif` (400, 600, 700, 800, 900 ağırlıkları, latin ve latin-ext `.woff2` yerel dosyaları; internet/CDN çağrısı olmadan `css/fonts.css` ile sunulur)
   - **Bölge & Uydu Görselleri (`res/images/`):**
     * `sat_2d_view.jpg` (Valles Marineris 2D yörünge görünümü)
     * `sat_3d_view.jpg` (3D Mars küresi yörünge görünümü)
     * `acid_rain_region.jpg` (Sülfat/asit sisli krater bölgesi)
     * `dust_storm_region.jpg` (Mars siklonik toz fırtınası/kasırgası bölgesi)
     * `radiation_region.jpg` (Mars atmosferik aurora ve Alfa/Beta/Gama foton kuşağı)
   - **Resmi NASA Ham Görsel API Kaydı (Belgeleme Amaçlı):** `https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json`

8. **Harita Projeksiyonu, Çoklu Platform Derleme & Ajan İletişimi**
   - **Projeksiyon & Tema:** NASA Mars Trek (`EPSG:104905` Equirectangular varsayılan 2D & bilineer 3D Küre), %60 Beyaz / %30 Siyah / %10 Kırmızı tema
   - **İşletim Sistemi Duyarlı Derleme Aracı:** `build.sh` ve `tools/build.py` (çalıştığı işletim sistemini algılayarak Linux `.tar.gz` veya Windows paketi derler ve Masaüstüne kopyalar)
   - **Linux Paketleyici & Sunucu:** `tools/launch-linux.sh` (`.woff2` MIME destekli Python3 HTTP sunucusu + `SHA256SUMS.txt` + `.tar.gz`)
   - **Windows Derleyici & Sunucu:** `tools/build_tool.ps1`, `build.bat`, `serve.ps1`, `tools/WinLauncher.cs` (.NET Framework `csc.exe` -> `MarsMap-win64.exe`)
   - **Ortak AI Ajan Belgeleri:** `ForAgents/PROJECT_STATE.md` ve `ForAgents/SHARED_PLANS_AND_API.md`

9. **NASA İnsan Fizyolojisi, Uzay Giysisi & Rover Görev Parametreleri (`Prameters.md`)**
   - **NASA-STD-3001 & Human Performance:** https://www.nasa.gov/reference/4-0-human-performance/ (minimum görev içi VO₂max `32.9 mL/dk/kg`, su ve metabolik enerji standartları)
   - **NASA NTRS (`20260003038`, `19760003073`) & EVA Walkback (`NASA-TP-2009-214796`):** Mars/xEMU/Apollo EVA oksijen tüketimi (`0.80–1.01 L/dk` nominal, `2.52 L/dk` 10-dk xEMU zirve, `3.60–4.00 L/dk` fizyolojik tavan) ve EVA yürüyüş hızları (`45–60 m/dk`, güvenli tavan `83.3–90.0 m/dk`)
   - **NASA Pressurized Rover (SEV / `TM-20220006678`) & Mars Bilim Roverları:** Basınçlı rover (`166.7–241.7 m/dk`, `10–12 kW` sürüş gücü, `52.7–100 kWh` batarya) ve Perseverance (`2.53 m/dk`) / Curiosity (`1.50–2.33 m/dk`) hızları (`https://science.nasa.gov/mission/mars-2020-perseverance/rover-components/`)
   - **NASA NSSDC Mars Fact Sheet, Curiosity RAD & `OCHMO-TB-020`:** `R = 3,389.5 km`, `g = 3.721 m/s²`, `6.36 mbar`, `0.64 ± 0.12 mSv/gün` yüzey radyasyonu ve `< 600 mSv` görev limiti (`https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html`)

