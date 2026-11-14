# AstroChief MarsMap — Backend Entegrasyon ve Endpoint Şartnamesi (`v2.5.0`)

Frontend ([BackendApiService.js](./js/services/BackendApiService.js) ve [MarsGlobeViewer.js](./js/components/MarsGlobeViewer.js)) tüm rota hesaplama, canlı tehlike katmanları, radyasyon alanları ve yüksek çözünürlüklü karo servisleri için tamamen backend'e hazır ve açık bırakılmıştır.

## 1. Backend Bağlantı Yapılandırması (3 Yol)
Frontend hiçbir adrese kilitli değildir; backend geliştirici şu 3 yoldan herhangi biriyle URL bağlayabilir:
1. **Arayüzden (Sol Üst ⚙️ Ayarlar -> Backend API URL):** Örneğin `http://127.0.0.1:8000` yazılıp `Bağlan / Test Et` tuşuna basılır (`localStorage` içine kaydedilir; `Factory Reset` ile sıfırlanır).
2. **URL Query Parametresi ile:** `http://localhost:3000/?api=http://127.0.0.1:8000`
3. **Global Config Nesnesi ile:** `window.ASTROCHIEF_CONFIG = { apiBaseUrl: "http://127.0.0.1:8000" }`

> **Zorunlu CORS Başlıkları:** Backend sunucusu farklı bir porttan (örneğin `:8000` veya `:5000`) yanıt verecekse `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type` başlıklarını dönmelidir.

---

## 2. Backend Tarafında Açılması Gereken Endpoint Listesi

### `1. GET /api/v1/health`
Backend'in ayakta olduğunu, DEM yüksekliği ve hava/radyasyon verilerinin yüklendiğini doğrular.
* **Beklenen Yanıt (`200 OK`):**
```json
{
  "status": "ok",
  "service": "astrochief-mars-backend",
  "version": "1.0.0",
  "dem_loaded": true,
  "capabilities": ["pathfind", "radiation", "hazards", "tiles_proxy"]
}
```

### `2. POST /api/v1/pathfind/compute` (Ana Rota / Pathfinding Motoru)
Kullanıcı harita üzerinden **Başlangıç (`A`)** ve **Hedef (`B`)** koordinatlarını seçip **"Rota İste (Backend)"** butonuna bastığında tetiklenir.
* **Frontend'in Gönderdiği JSON (`Request Body`):**
```json
{
  "crater_id": "gale-crater",
  "start": { "lat": -4.5895, "lon": 137.4417 },
  "goal": { "lat": -4.7120, "lon": 137.5840 },
  "filters": {
    "avoid_acid_rain": true,
    "acid_rain_intensity": "moderate",
    "avoid_dust_storm": true,
    "dust_storm_intensity": "moderate",
    "avoid_radiation_hotspots": true
  },
  "astronaut_params": {
    "suit_o2_reserve_liters": 420,
    "suit_water_reserve_liters": 24.0,
    "max_safe_slope_deg": 24,
    "units": {
      "distance": "km/m",
      "duration": "hours",
      "volume": "liters",
      "radiation": "alpha/beta/gamma"
    }
  }
}
```
* **Frontend'in Çizeceği Yanıt Şeması (`200 OK`):**
  * `primary_route`: **En güvenli ve kısa yol** -> Haritada otomatik **Mavi (`#2563eb`)** çizilir.
  * `alternative_route`: **Güvenli ama daha uzun alternatif yol** -> Haritada otomatik **Soluk Mavi (`#93c5fd`)** çizilir.
```json
{
  "primary_route": {
    "color": "#2563eb",
    "summary": {
      "total_km": 6.42,
      "total_meters": 6420,
      "duration_hours": 1.85,
      "o2_liters": 74.5,
      "water_liters": 3.2,
      "max_slope_deg": 11.4
    },
    "waypoints": [
      { "lat": -4.5895, "lon": 137.4417, "elev_m": -4400, "slope_deg": 2.1, "comment": "Baslangic (Duz bazalt tabani)" },
      { "lat": -4.6510, "lon": 137.5100, "elev_m": -4280, "slope_deg": 8.4, "comment": "Asit bolgesi disindan guvenli gecis" },
      { "lat": -4.7120, "lon": 137.5840, "elev_m": -4110, "elev_delta_m": 290, "slope_deg": 11.4, "comment": "Hedef Boxwork sirti varis" }
    ]
  },
  "alternative_route": {
    "color": "#93c5fd",
    "summary": {
      "total_km": 9.15,
      "total_meters": 9150,
      "duration_hours": 2.45,
      "o2_liters": 98.0,
      "water_liters": 4.4,
      "max_slope_deg": 6.8
    },
    "waypoints": [
      { "lat": -4.5895, "lon": 137.4417, "elev_m": -4400, "slope_deg": 2.0, "comment": "Baslangic" },
      { "lat": -4.6020, "lon": 137.6200, "elev_m": -4310, "slope_deg": 5.5, "comment": "Genis cevresel guvenli koridor" },
      { "lat": -4.7120, "lon": 137.5840, "elev_m": -4110, "slope_deg": 6.8, "comment": "Hedef varis" }
    ]
  }
}
```

### `3. GET /api/v1/hazards/live?lat={lat}&lon={lon}&radius_km={r}`
Canlı toz fırtınası koridorları, optik derinlik ($\tau$) ve sülfürik asidik yağmur / sis poligonlarını döner.
```json
{
  "updated_at": "2026-11-14T12:00:00Z",
  "hazards": [
    { "type": "acid_rain", "lat": -4.6, "lon": 137.4, "radius_km": 42, "severity": "moderate", "ph_estimate": 3.4 },
    { "type": "dust_storm", "lat": -18.0, "lon": 95.0, "radius_km": 320, "tau": 2.4, "wind_ms": 28 }
  ]
}
```

### `4. GET /api/v1/radiation/zones?crater_id={id}&lat={lat}&lon={lon}`
Bölgesel **Alfa ($\alpha$), Beta ($\beta$), Gama ($\gamma$) ışıma düzeyleri** ile **Foton Bombardımanı alanlarını** döner.
```json
{
  "zones": [
    {
      "name": "Mount Sharp Kozmik GCR Koridoru",
      "lat": -4.75,
      "lon": 137.44,
      "radius_km": 35,
      "alpha_level": "0.18 mSv/gun",
      "beta_level": "0.42 mSv/gun",
      "gamma_level": "0.64 mSv/gun",
      "photon_flux": "1.8x10^4 foton/cm2/s"
    }
  ]
}
```

### `5. GET /api/v1/telemetry/elevation?lat={lat}&lon={lon}`
Tıklanan koordinat için MOLA / HRSC DEM ham irtifa (`m`) ve arazi eğimi (`deg`) verisini döner.
```json
{
  "lat": -4.5895,
  "lon": 137.4417,
  "elevation_m": -4402.5,
  "slope_deg": 6.2,
  "roughness_index": 0.34
}
```

### `6. GET /api/v1/craters`
*(İsteğe bağlı)* Frontend'deki `data/craterLocations.js` krater kataloğunu backend'den dinamik güncellemek için krater dizisi döner.

### `7. GET /api/v1/tiles/{layer_id}/{z}/{y}/{x}`
*(Yüksek çözünürlük / CORS-kısıtlı katmanlar için Proxy)* Frontend şu anda `z=0..5` krater karolarını doğrudan `./data/tiles/` içinden, CORS destekli `Viking/MOLA/THEMIS` `z=3..7` karolarını ise doğrudan NASA WMTS'ten çeker. `SIM3292_Global_Geology` gibi CORS başlığı olmayan katmanlarda `z >= 3` yakınlaştırması veya özel HiRISE GeoTIFF kesitleri istendiğinde backend bu proxy uç noktasından PNG/JPG karo servis edebilir (`Access-Control-Allow-Origin: *` ile).

---

## 3. Açık Bırakılan Frontend JS / DOM Olay Kancaları (Hooks)
Backend veya eklenti betikleri çalışma anında aşağıdakilere doğrudan abone olabilir:
* **`window.astroChiefGlobe`**: Aktif `MarsGlobeViewer` örneği (`setBackendUrl()`, `flyToCrater()`, `applyBackendRoutes(routeJson)`, `getSelectedPoints()`).
* **`astrochief:coordinate-picked`** (`CustomEvent`): Haritada `A` (Başlangıç) veya `B` (Hedef) seçildiğinde `{ role, lat, lon }` detayını yayınlar.
* **`astrochief:viewport-changed`** (`CustomEvent`): Küre döndürüldüğünde / zoom yapıldığında `{ rotLat, rotLon, zoom, layerId, activeTileZ }` yayınlar.
* **`astrochief:backend-route-ready`** (`CustomEvent`): Backend'den gelen rotalar haritada çizildiğinde tetiklenir.
