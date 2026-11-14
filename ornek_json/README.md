# `ornek_json` — Backend Rota, Topografya ve Fizik Veri Sözleşmesi (`v4.3.2`)

Bu dizin ve kök dizindeki [`ornek_json.json`](../ornek_json.json), Frontend'in (`BackendApiService.buildRouteRequestPayload` + `MolaAStarGridHelper.buildRichTerrainPayload`) **`POST /api/v1/route`** ve Rust A\* motoruna gönderdiği zenginleştirilmiş gerçek JSON verisini gösterir.

## Dosyalar
1. **`../ornek_json.json`** — Tam görev yükü (**Gale Krateri → Jezero Krateri**, `48×48 = 2304` hücreli gerçek NASA MOLA DEM + eğim + engel bitmaskesi + `Prameters.md` araç/astronot fiziği).
2. **`krater_yakin_senaryo.json`** — Yakın ölçekli krater eteği aşma testi (**Gale Batı Eteği → Gale Doğu Düzlüğü**, `dxMeters ≈ 2.18 km`, yüksek çözünürlüklü eğim ve krater engelli senaryo).
3. **`ornek_yanit_response.json`** — Frontend'in Backend'den beklediği **`200 OK`** JSON yanıt şeması (`primaryBlue.steps[]`, `fallbackStage`, `o2Liters`, `waterLiters`).

---

## `terrainGrid` Verisini Nasıl Okumalısın?

- **Boyut:** `width = 48`, `height = 48` (`2304` eleman).
- **Dizi İndeksleme (`row-major`):** `idx = y * width + x` (`(0, 0)` başlangıç `origin`, `(width - 1, height - 1)` hedef `destination`).
- **Gerçek Fiziksel Ölçek:**
  - `terrainGrid.cellSizeMeters.dxMeters` & `dyMeters`: İki komşu hücre arasındaki gerçek Mars yüzey mesafesi (metre).
  - `terrainGrid.elevMeters[idx]`: Her hücrenin gerçek metre cinsinden MOLA rakımı (`-8200 m .. +21229 m`).
  - `terrainGrid.slopeDegs[idx]`: Hücre içi 5-noktalı taramadan gelen tepe eğim (derece).
  - `terrainGrid.gridFlatI32[idx]`: Mevcut WASM `find_rover_path` uyumlu nicemlenmiş tam sayı ızgarası (`-999` = geçilmez engel).
  - `terrainGrid.blockedMask[idx]`: Hücrenin **neden** bloklandığını gösteren bitmask:
    - `0`: Geçilebilir
    - `1`: Dik eğim / krater duvarı (`slopeDeg > 25°`)
    - `2`: Asit yağmuru bölgesi
    - `4`: Kum fırtınası / kasırga koridoru
    - `8`: Alfa / Beta / Gama radyasyon bölgesi
- **Krater & Volkan Kataloğu:** `factors.terrain.nearbyFeatures[]` içinde koridor yakınındaki her krater/volkan için `lat`, `lon`, `radiusDeg`, `radiusKm`, `shape`, `reliefM`, `rimM`, `centralPeakM` gönderilir.

---

## Yeni Backend Hesaplamaları İçin Tavsiyeler

1. **Gerçek Açısal Eğim (`slope_deg`):**
   - Birimsiz `|new_z - cur_z| <= 3` yerine `elevMeters` ve `cellSizeMeters.dxMeters` (`dyMeters`, diagonal `diagonalMeters`) ile gerçek açı hesaplayın:
     `slope_deg = atan2((elev_n - elev_c).abs(), horizontal_dist_m).to_degrees()`
   - Rover için güvenli sınır `factors.terrain.maxSafeRoverSlopeDeg` (**`25.0°`**), EVA yürüyüşü için `maxSafeEvaSlopeDeg` (**`30.0°`**).
2. **8-Yönlü Komşuluk + Görüş Hattı Yumuşatma (90° Köşeleri Kaldırma):**
   - `get_successors` içine çapraz `[(±1, ±1)]` yönlerini ekleyin (`√2` mesafe çarpanı + iki yan komşusu `-999` ise köşe kesme yasağı).
   - A\* sezgiselini **Octile / Öklid mesafeye** güncelleyin.
   - Çıkan yol üstünde **eğim ve krater doğrulamalı string-pulling** uygulayarak yapay L-dönüşlerini kaldırın; ancak iki nokta arasındaki doğru üzerinde `> 25°` krater duvarı veya `-999` varsa **kesinlikle düzleştirmeyin**.
3. **Fallback Şeffaflığı (`fallbackStage`):**
   - Tüm yollar tıkalı olduğu için `> 25°` sınırı veya tehlikeler esnetildiyse yanıt içine `"fallbackStage": 2 | 3` ve `"fallbackWarning": "..."` ekleyin; krater üstünden sessizce güvenli mavi yol dönmeyin.
4. **Hız, Süre ve O₂ Hesabı (`factors.vehicleAndPhysics` & `factors.astronaut`):**
   - Sabit `DISTANCE_PER_MT = 25` yerine segment mesafesi + `effectiveSpeedFormula` (`v * max(0.40, 1 - slopeDeg/46) * k_acid * k_storm`) üzerinden segment süresini ve gerçekçi O₂/batarya tüketimini (`o2NominalLPerMin`, `o2HeavyClimbLPerMin`, `walkbackReserveRatio = 0.25`) hesaplayın.
