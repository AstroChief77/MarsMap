# 🪐 AstroChief - Mars Keşif & Navigasyon Veri Setleri Kataloğu

Bu dizin, **AstroChief Mars Navigator** projesi kapsamında NASA ve USGS resmi portallarından toplanan, yapılandırılan ve doğrulaması yapılan tüm açık veri setlerini içerir.

Her bir veri setinin başında `_metadata` alanı bulunmakta olup, kaynağı, koordinat referansı ve son güncelleme tarihi kayıt altındadır.

---

## 📑 Veri Setleri İndeksi ve Açıklamaları

### 1. Mars Perseverance Ham Görselleri (`perseverance_raw_images.json`)
- **Kaynak:** [Mars Perseverance Raw Images Gallery (NASA Mars 2020)](https://mars.nasa.gov/mars2020/multimedia/raw-images/)
- **Dosya Yolu:** `data/datasets/perseverance_raw_images.json`
- **Örnek Görsel:** `data/datasets/images/perseverance_supercam_sol2031.jpg`
- **Veri Türü:** JSON (Canlı NASA API beslemesi)
- **Açıklama:** Perseverance gezgininin Jezero Krateri'nde Sol 2031 ve öncesinde SuperCam, Mastcam-Z ve Navcam kameralarıyla çektiği ham fotoğrafların metadataları, kamera açıları (mastAz, mastEl), UTC ve Mars yerel zamanı, uzay aracı saati (sclk) ve doğrudan tam çözünürlüklü görsel bağlantıları.
- **Navigasyon Kullanımı:** Yüzey engellerinin doğrulanması, kamera görüş alanı analizi ve görsel teyit.

---

### 2. Mars İniş Sahaları Verisi (`mars_landing_sites.json`)
- **Kaynak:** [NASA Jet Propulsion Laboratory (JPL) Mars Trek](https://trek.nasa.gov/mars/)
- **Dosya Yolu:** `data/datasets/mars_landing_sites.json`
- **Veri Türü:** JSON
- **Açıklama:** Mars yüzeyine başarıyla inen tüm NASA ve uluslararası görevlerin (Perseverance, Curiosity, InSight, Opportunity, Spirit, Mars Pathfinder, Viking 1 & 2, Phoenix, Zhurong) hassas koordinatları (enlem, boylam), iniş irtifaları (elevation), hedef jeolojileri, bilimsel enstrümanları ve kat ettikleri traverse mesafeleri.
- **Navigasyon Kullanımı:** Rota başlangıç ve bitiş noktaları, güvenli iniş havzaları tespiti.

---

### 3. JPL Mars Trek Harita ve Katman Servisleri (`jpl_mars_trek_layers.json`)
- **Kaynak:** [NASA JPL Mars Trek GIS Web Services](https://trek.nasa.gov/mars/)
- **Dosya Yolu:** `data/datasets/jpl_mars_trek_layers.json`
- **Veri Türü:** JSON
- **Açıklama:** Mars Trek'in kullandığı WMTS/XYZ karo (tile) harita katmanları; MOLA Global Topografik Yükseklik Haritası (DEM), Viking MDIM 2.1 Doğal Renk Mozaiği, THEMIS Gündüz Termal Kızılötesi (IR) ve MRO CTX yüksek çözünürlüklü mozaikleri ile Mars gezegensel yarıçap ve kütleçekim sabitleri.
- **Navigasyon Kullanımı:** 3D yüzey haritalandırma, eğim/yükseklik hesaplamaları ve termal kaya yoğunluğu tespiti.

---

### 4. USGS Standartlaştırılmış Jeolojik Harita Verisi (`usgs_mars_geology.json`)
- **Kaynak:** [USGS-NASA Planetary Geologic Mapping Program](https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars)
- **Referans:** Geologic Map of Mars, USGS SIM 3292 (Tanaka et al., 2014)
- **Dosya Yolu:** `data/datasets/usgs_mars_geology.json`
- **Veri Türü:** JSON
- **Açıklama:** Mars'ın üç büyük jeolojik dönemi (Noachian, Hesperian, Amazonian), birim simgeleri (eNh, mNh, lNh, eHv, lHl, eAv, lApd), litolojileri, zemin sertliği/pürüzlülüğü, rover sürülebilirlik endeksi (navigability index), asidik sülfat zenginleşme bölgeleri ve perklorat kimyasal aşınma riskleri.
- **Navigasyon Kullanımı:** Zemin sertliğine göre batma risklerini önleme ve asidik aşınma alanlarından kaçınma rotasyonu.

---

### 5. Curiosity Gezgini Mount Sharp Rota Haritası (`curiosity_mount_sharp_route.json`)
- **Kaynak:** [NASA Science - Curiosity's Proposed Path Up Mount Sharp](https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/)
- **Dosya Yolu:** `data/datasets/curiosity_mount_sharp_route.json`
- **Veri Türü:** JSON
- **Açıklama:** Curiosity'nin Gale Krateri tabanından (Bradbury Landing, -4400 m) başlayıp Mount Sharp'ın (Aeolis Mons) sülfat ve kil tabakalarına tırmanırken izlediği rota istasyonları (Yellowknife Bay, Pahrump Hills, Bagnold Dunes, Vera Rubin Ridge, Glen Torridon, Greenheugh Pediment, Gediz Vallis), eğim dereceleri, tekerlek patinaj katsayıları ve arazi zorluk endeksleri.
- **Navigasyon Kullanımı:** Rover tırmanış açıları optimizasyonu, tekerlek aşınma simülasyonu ve güvenli irtifa kazanımı.

---

### 6. NASA Worldview & Çevresel Tehlike Koridorları (`nasa_worldview_and_hazards.json`)
- **Kaynak:** [NASA Worldview (Earthdata GIBS)](https://worldview.earthdata.nasa.gov/) & Mars Climate Sounder
- **Dosya Yolu:** `data/datasets/nasa_worldview_and_hazards.json`
- **Veri Türü:** JSON
- **Açıklama:** Küresel ve bölgesel Mars toz fırtınası koridorları (Hellas Basin, Acidalia-Chryse, Solis Planum), optik toz derinliği ($\tau$), rüzgar şiddetleri, volkanik asidik gaz/sis riskleri, toz şeytanı (dust devil) elektrostatik deşarj tehlikeleri ve güvenli navigasyon koridorları.
- **Navigasyon Kullanımı:** Fırtına ve asit risklerini hesaba katarak en güvenli rotayı otomatik hesaplayan yönlendirme algoritması girdileri.

---

## 🛡️ NASA Yasal Uyarı Metni (Disclaimer)
> *NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.*
