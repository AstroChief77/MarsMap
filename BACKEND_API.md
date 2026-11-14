# AstroChief MarsMap — Rust Backend API Şartnamesi (`v4.3.2`)

Frontend ([BackendApiService.js](./js/services/BackendApiService.js), [MolaAStarGridHelper.js](./js/services/MolaAStarGridHelper.js), [MarsNavigatorController.js](./js/components/MarsNavigatorController.js) ve [RouteInspectorPanel.js](./js/components/RouteInspectorPanel.js)) artık **Konum (A) → Varış (B)** seçimi ile yalnızca uç noktaları değil; **48×48 koridor MOLA DEM yükseklik (`elevMeters`) + eğim (`slopeDegs`) + engel bitmask (`blockedMask`) matrislerini, hücre boyutlarını (`cellSizeMeters`), krater/volkan kataloğunu, radyasyon (α/β/γ/foton), asit yağmuru, toz fırtınası ve `Prameters.md` araç/astronot fizik parametrelerini** tek bir `POST /api/v1/route` isteğinde Rust backend'e iletir.

> Not: `Mustafa` dalındaki `ornek_json.json` ve `ornek_json/` klasörü buradaki güncel şemadan üretilmiş gerçek örnek verileri içerir.

---

## 1. Bağlantı Yapılandırması ve CORS

1. **Arayüzden:** Sol Üst **⚙️ Ayarlar → Rust Backend Rota Motoru** alanına adres girip **Kaydet** / **Test Et** butonuna basın (ör. `http://127.0.0.1:8080`).
2. **URL Query ile:** `http://<sunucu>:3000/?api=http://127.0.0.1:8080`
3. **Global Config ile:** `window.ASTROCHIEF_CONFIG = { apiBaseUrl: "http://127.0.0.1:8080" }`

> **Zorunlu CORS Başlıkları (Axum / Actix-web):**
> `Access-Control-Allow-Origin: *`
> `Access-Control-Allow-Methods: GET, POST, OPTIONS`
> `Access-Control-Allow-Headers: Content-Type`

Backend erişilemezse veya URL boşsa frontend otomatik olarak çevrimdışı yerel motorla (`⚡ Yerel Yedek`) çalışmaya devam eder.

---

## 2. Gerekli Rust Endpointleri

### `1. GET /api/v1/health`
```json
{
  "status": "ok",
  "engine": "astrochief-rust-v1",
  "version": "1.0.0"
}
```

### `2. GET /api/v1/hazards` *(Opsiyonel / Önerilen)*
Haritada çizilecek asit yağmuru, toz fırtınası ve radyasyon bölgelerini doğrudan backend'den beslemek için (`readme.md` kuralı):
```json
{
  "acidZones": [
    { "id": "acid-1", "name": "Hesperia Asidik Çökelti", "lat": -14.2, "lon": 112.5, "radiusDeg": 9.5, "ph": "pH 2.4" }
  ],
  "stormZones": [
    { "id": "storm-1", "name": "Syrtis Toz Koridoru", "lat": 8.0, "lon": 68.5, "radiusDeg": 12.0, "tau": "τ 2.8" }
  ],
  "radiationZones": [
    {
      "id": "rad-1",
      "name": "Kuzey Kutupsal Foton Kuşağı",
      "lat": 38.0,
      "lon": 102.0,
      "radiusDeg": 11.0,
      "alphaLevel": "0.18 μSv/s (Alfa α)",
      "betaLevel": "1.82 mSv/h (Beta β)",
      "gammaLevel": "0.94 mSv/h (Gama γ)",
      "photonFlux": "6.1x10^6 MeV/cm²·s"
    }
  ]
}
```

### `3. POST /api/v1/route` *(Ana Step-by-Step Rota Hesaplama)*

#### Frontend'in Gönderdiği Request JSON (`v4.3.2`):
> Tam örnek ve gerçek 48×48 MOLA DEM dizileri için GitHub `Mustafa` dalındaki `ornek_json.json` ve `ornek_json/` dosyalarına bakın.

```json
{
  "apiVersion": "4.3.2",
  "scope": "global",
  "origin": { "id": "curiosity-gale", "name": "Gale Krateri (A)", "lat": -4.5895, "lon": 137.4417, "elevM": -4280, "slopeDeg": 6.4, "gradX": 0.142, "gradY": -0.181 },
  "destination": { "id": "perseverance-jezero", "name": "Jezero Krateri (B)", "lat": 18.4447, "lon": 77.4508, "elevM": -2510, "slopeDeg": 4.8, "gradX": -0.105, "gradY": 0.134 },
  "routeGeometrySummary": {
    "directDistanceKm": 3740.82,
    "directDistanceMeters": 3740820,
    "initialBearingDeg": 296.4,
    "deltaLatDeg": 23.0342,
    "shortestDeltaLonDeg": -59.9909,
    "crossesAntimeridian": false
  },
  "rustWasmCall": {
    "fn": "find_rover_path(grid_flat, 48, 48, 0, 0, 47, 47, 420)",
    "module": "js/wasm/backend_bg.wasm",
    "gridSize": 48,
    "beginOxy": 420,
    "start": { "x": 0, "y": 0 },
    "goal": { "x": 47, "y": 47 }
  },
  "terrainGrid": {
    "width": 48,
    "height": 48,
    "indexing": "row-major: idx = y * width + x",
    "coordinateMapping": "diagonal-corridor: u=(x+y)/(w+h-2), v=(x-y)/(w-1)",
    "lateralFactor": 0.38,
    "stepMeters": 160,
    "cellSizeMeters": { "dxMeters": 96500, "dyMeters": 96500, "diagonalMeters": 136470, "corridorSpanMeters": 3740820 },
    "bounds": { "minLat": -27.3, "maxLat": 41.2, "minLon": 68.7, "maxLon": 146.2, "minElevM": -4800, "maxElevM": 6400, "minSlopeDeg": 0.4, "maxSlopeDeg": 32.1 },
    "obstacleLegend": { "0": "passable", "1": "cliff_slope_gt_25deg", "2": "acid_rain_zone", "4": "dust_storm_zone", "8": "radiation_zone" },
    "gridFlatI32": [ "... 2304 adet i32 eleman (-999 = engel) ..." ],
    "elevMeters": [ "... 2304 adet metre cinsinden MOLA rakimi ..." ],
    "slopeDegs": [ "... 2304 adet hucre-ici max egim (derece) ..." ],
    "blockedMask": [ "... 2304 adet bitmask (0, 1, 2, 4, 8) ..." ],
    "lats": [ "... 2304 adet enlem ..." ],
    "lons": [ "... 2304 adet boylam ..." ]
  },
  "factors": {
    "acidRain": {
      "enabled": true,
      "intensity": "orta",
      "ph": 2.4,
      "speedMultiplier": 0.78,
      "detourScale": 1.0,
      "zones": [{ "id": "acid-cerberus", "name": "...", "lat": -6.5, "lon": 112.0, "radiusDeg": 13, "ph": "pH 2.4" }]
    },
    "dustStorm": {
      "enabled": true,
      "intensity": "orta",
      "opticalDepthTau": 2.8,
      "speedMultiplier": 0.70,
      "detourScale": 1.0,
      "zones": [{ "id": "storm-isidis", "name": "...", "lat": 9.0, "lon": 98.0, "radiusDeg": 13, "tau": "τ 2.8" }]
    },
    "radiation": {
      "enabled": true,
      "maxSafeAlphaMicroSvPerSec": 0.05,
      "maxSafeBetaMsvPerHour": 1.0,
      "maxSafeGammaMsvPerHour": 0.5,
      "backgroundMsvPerDay": 0.64,
      "careerLimitMsv": 600,
      "zones": [],
      "craterZones": []
    },
    "terrain": {
      "source": "NASA MOLA DEM (MarsTopographyService)",
      "demGridResolution": { "width": 1024, "height": 512, "equatorPixelKm": 20.8 },
      "planetRadiusKm": 3389.5,
      "planetRadiusM": 3389500,
      "gravityMs2": 3.721,
      "craterId": "gale-crater",
      "maxSlopeDiff": 3,
      "maxSafeRoverSlopeDeg": 25.0,
      "maxSafeEvaSlopeDeg": 30.0,
      "wheelSlipLimit": 0.40,
      "rockRoughnessLimitCm": 30,
      "obstacleCode": -999,
      "nearbyFeatures": []
    },
    "astronaut": {
      "oxygenReserveLiters": 420,
      "walkbackReserveRatio": 0.25,
      "minWalkbackO2Liters": 105,
      "o2NominalLPerMin": 0.80,
      "o2ExploreLPerMin": 1.01,
      "o2HeavyClimbLPerMin": 2.00,
      "o2Peak10MinLPerMin": 2.52,
      "o2MaxLPerMin": 4.00,
      "o2LitersPerHour": 48.0,
      "waterReserveLiters": 24,
      "waterNominalLPerMin": 0.015,
      "waterLitersPerHour": 2.15,
      "evaSpeedKmH": 3.6,
      "evaSpeedMPerMin": 60.0,
      "evaLongWalkKmH": 2.7
    },
    "vehicleAndPhysics": {
      "vehicleType": "pressurized-rover",
      "roverNominalSpeedKmH": 10.0,
      "roverSpeedKmH": 14.5,
      "roverSpeedMPerMin": 241.7,
      "roverMaxSafeSpeedKmH": 19.0,
      "roboticReferenceSpeedKmH": 0.152,
      "roverBatteryKwh": 75.0,
      "roverWalkbackBatteryRatio": 0.35,
      "roverPropulsionWhPerMin": 166.7,
      "roverHotelLoadWhPerMin": 30.0,
      "roverScienceWhPerMin": 4.2,
      "roverTotalDriveWhPerMin": 200.8,
      "evaSuitBatteryKwh": 1.5,
      "evaSuitPowerWhPerMin": 1.08,
      "marsSolHours": 24.66,
      "marsSolMinutes": 1479.59,
      "surfacePressureMbar": 6.36,
      "solarIrradianceWm2": 586.2,
      "effectiveSpeedFormula": "v_eff = v_flat * max(0.40, 1 - slopeDeg / 46.0) * k_acid * k_storm"
    }
  }
}
```

#### Backend'in Döneceği Response JSON (`200 OK`):
> Not: Frontend hem `camelCase` (`primaryBlue`, `secondaryPaleBlue`, `steps[]`) hem de `snake_case` (`primary_route`, `alternative_route`) anahtarlarını otomatik tanır. `points` gönderilmezse `steps[]` içindeki `lat, lon` dizisinden çizgiyi otomatik çizer.

```json
{
  "scope": "global",
  "engine": "rust-astar-v1",
  "primaryBlue": {
    "totalKm": 3740.5,
    "totalHours": 258.0,
    "formattedDuration": "258.0 saat (~10 Sol 18 sa)",
    "o2Liters": 12384,
    "waterLiters": 554.7,
    "comment": "// Mavi Yol (Rust A*): En kısa güvenli rota — 258.0 saat",
    "steps": [
      {
        "step": 1,
        "lat": -4.5895,
        "lon": 137.4417,
        "elevM": -4400,
        "slopeDeg": 2.1,
        "distKm": 0.0,
        "durationHours": 0.0,
        "instruction": "Başlangıç (-4.59°, 137.44°): Etkenler doğrulandı",
        "hazardWarning": null
      },
      {
        "step": 2,
        "lat": 2.15,
        "lon": 121.30,
        "elevM": -3150,
        "slopeDeg": 6.4,
        "distKm": 1020.4,
        "durationHours": 70.4,
        "instruction": "Kuzeybatı yönünde 1020 km ilerle (Eğim 6.4°)",
        "hazardWarning": "Syrtis Toz Koridoru dışından sapma"
      },
      {
        "step": 3,
        "lat": 18.4447,
        "lon": 77.4508,
        "elevM": -2500,
        "slopeDeg": 3.2,
        "distKm": 2720.1,
        "durationHours": 187.6,
        "instruction": "Varış (18.44°, 77.45°): Jezero iniş sahasına güvenli park",
        "hazardWarning": null
      }
    ]
  },
  "secondaryPaleBlue": {
    "totalKm": 4680.0,
    "totalHours": 348.2,
    "formattedDuration": "348.2 saat (~14 Sol 12 sa)",
    "o2Liters": 16714,
    "waterLiters": 748.6,
    "comment": "// Soluk Mavi (Rust A*): Tehlike koridoru dışı uzun güvenli yay",
    "steps": []
  },
  "hazards": {
    "acidZones": [],
    "stormZones": [],
    "radiationZones": []
  }
}
```

---

## 3. Rust `serde` Kopyala-Yapıştır Şablonu

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteRequest {
    pub api_version: Option<String>,
    pub scope: String,
    pub origin: GeoEndpoint,
    pub destination: GeoEndpoint,
    pub route_geometry_summary: Option<RouteGeometrySummary>,
    pub terrain_grid: Option<TerrainGrid>,
    pub factors: RouteFactors,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoEndpoint {
    pub id: Option<String>,
    pub name: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub elev_m: Option<i32>,
    pub slope_deg: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteGeometrySummary {
    pub direct_distance_km: f64,
    pub direct_distance_meters: u64,
    pub initial_bearing_deg: f64,
    pub crosses_antimeridian: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CellSizeMeters {
    pub dx_meters: f64,
    pub dy_meters: f64,
    pub diagonal_meters: f64,
    pub corridor_span_meters: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainGrid {
    pub width: usize,
    pub height: usize,
    pub lateral_factor: f64,
    pub step_meters: i32,
    pub cell_size_meters: CellSizeMeters,
    pub grid_flat_i32: Vec<i32>,
    pub elev_meters: Vec<i32>,
    pub slope_degs: Vec<f64>,
    pub blocked_mask: Vec<u8>,
    pub lats: Vec<f64>,
    pub lons: Vec<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteFactors {
    pub acid_rain: EnvFactor,
    pub dust_storm: EnvFactor,
    pub radiation: RadiationFactor,
    pub terrain: TerrainFactor,
    pub astronaut: AstronautFactor,
    pub vehicle_and_physics: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvFactor {
    pub enabled: bool,
    pub intensity: String,
    pub speed_multiplier: f64,
    pub detour_scale: f64,
    pub zones: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RadiationFactor {
    pub enabled: Option<bool>,
    pub zones: Vec<serde_json::Value>,
    pub crater_zones: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainFactor {
    pub planet_radius_km: f64,
    pub max_slope_diff: Option<i32>,
    pub max_safe_rover_slope_deg: Option<f64>,
    pub obstacle_code: Option<i32>,
    pub nearby_features: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstronautFactor {
    pub oxygen_reserve_liters: f64,
    pub water_reserve_liters: f64,
    pub eva_speed_km_h: f64,
    pub o2_nominal_l_per_min: Option<f64>,
    pub o2_explore_l_per_min: Option<f64>,
    pub o2_heavy_climb_l_per_min: Option<f64>,
    pub o2_max_l_per_min: Option<f64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteStep {
    pub step: usize,
    pub lat: f64,
    pub lon: f64,
    pub elev_m: i32,
    pub slope_deg: f64,
    pub dist_km: f64,
    pub duration_hours: f64,
    pub instruction: String,
    pub hazard_warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedRoute {
    pub fallback_stage: Option<u8>,
    pub fallback_warning: Option<String>,
    pub total_km: f64,
    pub total_hours: f64,
    pub formatted_duration: String,
    pub o2_liters: u32,
    pub water_liters: f64,
    pub comment: String,
    pub steps: Vec<RouteStep>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteResponse {
    pub scope: String,
    pub engine: String,
    pub primary_blue: PlannedRoute,
    pub secondary_pale_blue: Option<PlannedRoute>,
    pub hazards: Option<serde_json::Value>,
}
```
