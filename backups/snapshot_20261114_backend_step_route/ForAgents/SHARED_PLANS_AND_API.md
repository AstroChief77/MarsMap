# Shared Plans, Module Interfaces & Agent Coordination

Bu doküman, projeye katılacak diğer AI ajanlarının (Backend Pathfinding, Veri Bilimi, UI/Test Ajanları) uyumlu ve çakışmasız çalışması için ortak sözleşmeleri tanımlar.

## 1. Ortak Mimari ve Bağlantı Sözleşmeleri

### A. `RoutePlannerService` Çıktı Şeması (Backend Ajanı Entegrasyon Noktası)
İleride `js/services/RoutePlannerService.js` içindeki hesaplamaya harici bir sunucu (ör. A* / Dijkstra DEM maliyeti hesaplayan Python/Rust backend) bağlanacaksa dönüş nesnesi şu şemayı korumalıdır:

```json
{
  "scope": "crater | global",
  "primaryBlue": {
    "points": [{ "lat": -4.59, "lon": 137.44 }],
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
    "points": [{ "lat": -4.59, "lon": 137.44 }],
    "totalKm": 16.8,
    "totalMeters": 16800,
    "totalHours": 5.0,
    "formattedDuration": "5 saat 0 dk",
    "o2Liters": 240,
    "waterLiters": 10.8,
    "colorHex": "#93c5fd",
    "comment": "// Soluk Mavi: Fırtına/asit dışı güvenli uzun yay — ..."
  }
}
```

### B. `AppConfig` Ayar Anahtarları ve FPS < 10 Koruması
Tüm ayar değişiklikleri **mutlaka** `MarsNavigatorController.applyGuardedSetting(key, value, label)` üzerinden geçirilmelidir; doğrudan `this.state[key] = ...` yazılmamalıdır ki FPS 10 altına düşerse `FpsGuardService` ayarı geri alabilsin.

- `viewMode`: `"2d"` (Factory default) | `"3d"`
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
