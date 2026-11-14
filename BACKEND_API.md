# AstroChief MarsMap — Basitleştirilmiş Rust Backend API Şartnamesi (`v3.1.0`)

Frontend ([BackendApiService.js](./js/services/BackendApiService.js), [MarsNavigatorController.js](./js/components/MarsNavigatorController.js) ve [RouteInspectorPanel.js](./js/components/RouteInspectorPanel.js)) artık **Konum (A) → Varış (B)** seçimi ile tüm **radyasyon (α/β/γ/foton), asit yağmuru, toz fırtınası, eğim ve astronot O₂/su** parametrelerini tek bir sade `POST /api/v1/route` isteğinde Rust backend'e iletir ve **step-by-step (`steps[]`)** rota + opsiyonel harita tehlike katmanlarını alır.

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

#### Frontend'in Gönderdiği Request JSON:
```json
{
  "scope": "global",
  "origin": { "id": "picked-origin", "name": "Konum (-4.6°, 137.4°)", "lat": -4.5895, "lon": 137.4417 },
  "destination": { "id": "picked-dest", "name": "Varış (18.4°, 77.5°)", "lat": 18.4447, "lon": 77.4508 },
  "factors": {
    "acidRain": {
      "enabled": true,
      "intensity": "orta",
      "ph": 2.4,
      "speedMultiplier": 0.78,
      "detourScale": 1.0,
      "zones": [{ "id": "acid-1", "name": "...", "lat": -14.2, "lon": 112.5, "radiusDeg": 9.5, "ph": "pH 2.4" }]
    },
    "dustStorm": {
      "enabled": true,
      "intensity": "orta",
      "opticalDepthTau": 2.8,
      "speedMultiplier": 0.70,
      "detourScale": 1.0,
      "zones": [{ "id": "storm-1", "name": "...", "lat": 8.0, "lon": 68.5, "radiusDeg": 12.0, "tau": "τ 2.8" }]
    },
    "radiation": {
      "maxSafeAlphaMicroSvPerSec": 0.05,
      "maxSafeBetaMsvPerHour": 1.0,
      "maxSafeGammaMsvPerHour": 0.5,
      "zones": [],
      "craterZones": []
    },
    "terrain": {
      "planetRadiusKm": 3389.5,
      "craterId": "gale-crater",
      "craterName": "Gale Krateri",
      "maxSlopeDeg": 22.0,
      "preferLowElevation": true,
      "stepResolutionKm": 140.0
    },
    "astronaut": {
      "oxygenReserveLiters": 420,
      "waterReserveLiters": 24,
      "evaSpeedKmH": 3.6,
      "roverSpeedKmH": 14.5,
      "o2LitersPerHour": 48.0,
      "waterLitersPerHour": 2.15
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
    pub scope: String,
    pub origin: GeoEndpoint,
    pub destination: GeoEndpoint,
    pub factors: RouteFactors,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeoEndpoint {
    pub id: Option<String>,
    pub name: Option<String>,
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteFactors {
    pub acid_rain: EnvFactor,
    pub dust_storm: EnvFactor,
    pub radiation: RadiationFactor,
    pub terrain: TerrainFactor,
    pub astronaut: AstronautFactor,
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
    pub zones: Vec<serde_json::Value>,
    pub crater_zones: Vec<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerrainFactor {
    pub planet_radius_km: f64,
    pub max_slope_deg: f64,
    pub prefer_low_elevation: bool,
    pub step_resolution_km: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AstronautFactor {
    pub oxygen_reserve_liters: f64,
    pub water_reserve_liters: f64,
    pub eva_speed_km_h: f64,
    pub rover_speed_km_h: f64,
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
    pub secondary_pale_blue: PlannedRoute,
    pub hazards: Option<serde_json::Value>,
}
```
