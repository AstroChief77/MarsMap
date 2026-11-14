# Shared Plans, Module Interfaces & Agent Coordination

Bu doküman, projeye katılacak diğer AI ajanlarının (Backend Pathfinding, Veri Bilimi, UI/Test Ajanları) uyumlu ve çakışmasız çalışması için ortak sözleşmeleri tanımlar.

## 1. Ortak Mimari ve Bağlantı Sözleşmeleri

### A. Rust Backend Step-by-Step Rota ve Tehlike Sözleşmesi (`v3.1.0`)
Frontend (`js/services/BackendApiService.js`), kullanıcı haritadan veya panelden **Konum (`origin`: A)** ve **Varış (`destination`: B)** seçtiğinde tüm aktif etkenleri (`acidRain`, `dustStorm`, `radiation`, `terrain`, `astronaut`) `POST /api/v1/route` ile Rust backend'e iletir (`GET /api/v1/hazards` opsiyonel olarak tehlike katmanlarını günceller). Tam kontrat için `BACKEND_API.md` dosyasına bakın:

```json
{
  "scope": "crater | global",
  "engine": "rust-astar-v1",
  "primaryBlue": {
    "steps": [
      {
        "step": 1, "lat": -4.59, "lon": 137.44,
        "elevM": -4400, "slopeDeg": 2.1, "distKm": 0.0, "durationHours": 0.0,
        "instruction": "Başlangıç doğrulandı", "hazardWarning": null
      }
    ],
    "totalKm": 12.4,
    "totalMeters": 12400,
    "totalHours": 4.2,
    "formattedDuration": "4 saat 12 dk",
    "o2Liters": 202,
    "waterLiters": 9.0,
    "colorHex": "#2563eb",
    "comment": "// Mavi Yol: En güvenli & kısa rota — ..."
  },
  "secondaryPaleBlue": {
    "steps": [],
    "totalKm": 16.8,
    "totalMeters": 16800,
    "totalHours": 5.0,
    "formattedDuration": "5 saat 0 dk",
    "o2Liters": 240,
    "waterLiters": 10.8,
    "colorHex": "#93c5fd",
    "comment": "// Soluk Mavi: Fırtına/asit dışı güvenli uzun yay — ..."
  },
  "hazards": { "acidZones": [], "stormZones": [], "radiationZones": [] }
}
```

### B. `AppConfig` Ayar Anahtarları ve 10 Saniyelik FPS < 10 Koruması
Tüm ayar değişiklikleri **mutlaka** `MarsNavigatorController.applyGuardedSetting(key, value, label)` üzerinden geçirilmelidir; ayar değiştirildikten sonra **10 saniye (`10000 ms`) boyunca FPS 10'un altına düşerse** `FpsGuardService` değişikliği otomatik geri alır.

- `viewMode`: `"3d"` (Factory default) | `"2d"`
- `filterAcidRain`: `boolean`, `acidIntensity`: `"hafif" | "orta" | "siddetli"`
- `filterDustStorm`: `boolean`, `stormIntensity`: `"hafif" | "orta" | "siddetli"`
- `progressiveLodRender`: `boolean` (Factory default `true`)
- `showRadiationZones`: `boolean` (Alfa α, Beta β, Gama γ & Foton bombardımanı)
- `activeLayerId`: `"mars-viking-mdim21" | "mars-mola-elevation" | "mars-themis-day-ir" | "mars-global-geology"`

### C. Arayüz Düzeni Kuralları
- **Sol Üst (`#top-left-dock`)**: Ayarlar dişli butonu. Açıldığında 1. seçenek `#btn-factory-reset` (`Factory Reset`) olmak zorundadır.
- **Sol Alt (`#bottom-left-dock`)**: `Uydular` butonu. 2D/3D geçişleri, Asit Yağmuru/Fırtına + şiddet seçenekleri ve uydu katmanları dışarı taşırılamaz; hepsi `#satellites-popover` içinde, arka planda `./res/images/*.jpg` fotoğraflarıyla tutulur.
- **Orta Alan (`#mars-map-canvas`)**: Ana harita ve rota yorum kutucukları.
- **Sağ Üst (`#top-right-dock`)**: Açılır/kapanır Rota & α/β/γ Radyasyon paneli (`Litre`, `km/m`, `Saat`).

## 2. Sıradaki Ortak Planlar (Next Agent Roadmap)
1. **Gerçek DEM Eğim Maliyet A* Motoru**: `mars-mola-elevation` yüksek çözünürlüklü piksel ızgarasından eğim gradientini okuyarak `RouteGeometryHelper` üzerine eklemek (800 satır sınırı altında yeni bir `ElevationCostGrid.js` sınıfı açılmalı).
2. **Backend Köprüsü (Opsiyonel)**: Python FastAPI veya C++ servisi eklenirse yerel çevrimdışı mod her zaman fallback olarak korunmalıdır; harici CDN yasaktır.
3. **Derleme Komutu**: Her sürüm veya kod değişikliği sonrasında Linux'ta `./build.sh`, Windows'ta `build.bat` çalıştırılarak `dist/` ve Masaüstü güncellenmelidir.

## 3. Kesin Kırmızı Çizgiler
- `readme.md` dosyasına ASLA dokunma.
- `backups/` klasöründeki mevcut yedekleri ASLA silme/değiştirme; düzenleme öncesi yeni tarihli yedek al.
- Tüm değişiklikleri `logs/change_log.txt` dosyasına işleyip her kod dosyasının sonuna satır-işlev açıklaması ekle.
