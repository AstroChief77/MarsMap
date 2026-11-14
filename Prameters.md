# AstroChief MarsMap — Gerçekçi Görev ve Fizik Parametreleri (`Prameters.md`)

> Bu belge, **NASA Space Apps Challenge 2026** kapsamındaki Mars rota, oksijen, enerji, su, hız ve radyasyon hesaplamaları için gerçek NASA standartları (`NASA-STD-3001`, `Apollo/xEMU/MxEMU`, `NASA SEV`, `Curiosity RAD`, `Mars Fact Sheet`) esas alınarak hazırlanmış referans parametre kataloğudur.
> Birincil ölçek **dakika bazlı (`L/dk`, `m/dk`, `km/dk`, `Wh/dk`)** olarak verilmiş; `readme.md` kuralları ve mevcut kod tabanıyla uyumluluk için **saat / litre / kilometre** karşılıkları da eklenmiştir.

---

## 1. Hızlı Özet Tablosu (Dakika Bazlı Ana Parametreler)

| Parametre | Nominal (Normal Görev) | Zorlu Arazi / Yüksek Tempo | En Fazla (Maksimum / Zirve Limit) | Saatlik Karşılık | Kod Tabanı Karşılığı |
|---|---|---|---|---|---|
| **İnsan Oksijen Tüketimi (EVA)** | `0.80 – 1.01 L/dk` | `1.58 – 2.01 L/dk` | **`3.60 – 4.00 L/dk`** *(10 dk xEMU tasarım zirvesi: `2.52 L/dk`)* | `48.0 – 60.6 L/sa` (maks `216 – 240 L/sa`) | `o2LitersPerHour = 48.0` (`0.80 L/dk`) |
| **İnsanlı Basınçlı Rover Hızı (SEV)** | `166.7 m/dk` (`0.167 km/dk`) | `75.0 – 125.0 m/dk` | **`241.7 – 316.7 m/dk`** (`0.242 – 0.317 km/dk`) | `10.0 km/sa` nominal (maks `14.5 – 19.0 km/sa`) | `roverSpeedKmH = 14.5` (`241.7 m/dk`) |
| **İnsansız Bilim Rover Hızı (Perseverance / Curiosity)** | `1.0 – 2.0 m/dk` | `0.5 – 1.0 m/dk` | **`2.53 m/dk`** (Perseverance) / **`2.33 m/dk`** (Curiosity) | `0.06 – 0.152 km/sa` (`60 – 152 m/sa`) | Referans (otonom robotik rover) |
| **İnsan Yürüyüş Hızı (EVA Giysisi)** | `45.0 – 60.0 m/dk` (`0.045 – 0.060 km/dk`) | `20.0 – 36.7 m/dk` | **`83.3 – 90.0 m/dk`** *(acil kısa sprint `117 – 150 m/dk`)* | `2.7 – 3.6 km/sa` (güvenli üst `5.0 – 5.4 km/sa`) | `evaSpeedKmH = 3.6` (`60.0 m/dk`) |
| **İnsan Su Tüketimi (İçme + Giysi Soğutma)** | `0.013 – 0.018 L/dk` (`13 – 18 mL/dk`) | `0.025 L/dk` (`25 mL/dk`) | **`0.0358 L/dk`** (`35.8 mL/dk`) | `0.79 – 1.09 L/sa` (tavan `2.15 L/sa`) | `waterLitersPerHour = 2.15` (`0.0358 L/dk`) |
| **İnsan CO₂ Üretimi (Solunum)** | `0.68 – 0.86 L/dk` | `1.35 – 1.75 L/dk` | **`3.20 – 4.00 L/dk`** (`RQ ≈ 0.85 – 1.00`) | `40.8 – 51.6 L/sa` (maks `192 – 240 L/sa`) | PLSS LiOH / RCA tutucu limiti |
| **Basınçlı Rover Güç Tüketimi (Sürüş)** | `133.3 – 166.7 Wh/dk` (`8 – 10 kW`) | `180.0 – 200.8 Wh/dk` | **`250.0 – 300.0 Wh/dk`** (`15 – 18 kW` tepe) | `8.0 – 12.05 kWh/sa` | Enerji modeli (`52.7 – 100 kWh` batarya) |
| **Uzay Giysisi PLSS Güç Tüketimi** | `1.08 Wh/dk` (`65 W`) | `1.50 – 1.83 Wh/dk` | **`2.33 – 2.50 Wh/dk`** (`140 – 150 W`) | `65 – 150 Wh/sa` | Giysi bataryası `1.2 – 1.8 kWh` |
| **Mars Yüzey Doğal Radyasyon (GCR)** | `0.44 μSv/dk` (`0.00044 mSv/dk`) | `1.5 – 5.0 μSv/dk` | **Alarm Eşikleri:** `α ≤ 3.0 μSv/dk`, `β ≤ 16.7 μSv/dk`, `γ ≤ 8.3 μSv/dk` | `26.7 μSv/sa` (`0.64 mSv/gün`) | `BACKEND_API.md` & `HazardFieldService.js` |

> **Önemli Birim Notu:** Oksijen hacimleri **STP (0 °C, 1 atm = 101.325 kPa)** eşdeğer solunabilir gaz litresidir (`1 L STP O₂ ≈ 1.429 g O₂`). Örneğin `420 L` varsayılan oksijen rezervi kütlece `~0.600 kg O₂`'ye denk gelir ve 207 bar (3000 psi) yüksek basınçlı bir tüpte yalnızca `~2.03 L` fiziksel tank hacmi kaplar.

---

## 2. İnsan Oksijen (O₂), Su ve Metabolik Tüketim Parametreleri

### 2.1 Dakikada İnsan Oksijen Harcaması (`L/dk` ve `g/dk`)
Metabolik dönüşüm faktörü standart fizyolojide ortalama **`1 L O₂ ≈ 20.9 kJ` (`5.0 kcal`)** ve `1 W = 0.06 kJ/dk` olarak alınır.

| Aktivite Düzeyi | Metabolik Güç (`W` / `BTU/sa`) | Oksijen Tüketimi (`L/dk` STP) | Kütle Akışı (`g/dk`) | Saatlik O₂ (`L/sa`) | Açıklama |
|---|---|---|---|---|---|
| **Uyku / Tam Dinlenme (Habitat)** | `80 – 100 W` (`273 – 341 BTU/sa`) | `0.23 – 0.29 L/dk` | `0.33 – 0.41 g/dk` | `13.8 – 17.4 L/sa` | Bazal metabolizma hızı |
| **Basınçlı Rover Sürüşü / Hafif İş (IVA)** | `140 – 190 W` (`478 – 648 BTU/sa`) | `0.40 – 0.55 L/dk` | `0.57 – 0.79 g/dk` | `24.0 – 33.0 L/sa` | Kabin içi oturarak kumanda |
| **Nominal EVA Yürüyüşü (Mevcut Kod Tabanı)** | `~280 W` (`955 BTU/sa`) | **`0.80 L/dk`** | `1.14 g/dk` | `48.0 L/sa` | ISS/Apollo ortalama EVA bandı (`RoutePlannerService.js`) |
| **NASA Keşif EVA Tasarım Ortalaması (xEMU/MxEMU)** | `352 W` (`1,200 BTU/sa`) | **`1.01 L/dk`** | `1.44 g/dk` | `60.6 L/sa` | NASA-STD-3001 / Mars keşif giysisi ortalama eforu |
| **Dik Tırmanış / Ağır Kaya Örneklemesi (15°–31° eğim)** | `550 – 700 W` (`1,877 – 2,388 BTU/sa`) | `1.58 – 2.01 L/dk` | `2.26 – 2.87 g/dk` | `94.8 – 120.6 L/sa` | Mars `0.38g` altında ağır giysi + yokuş yükü |
| **NASA xEMU Kısa Süreli Zirve (10 dk Tasarım Limiti)** | `879 W` (`3,000 BTU/sa`) | **`2.52 L/dk`** | `3.60 g/dk` | `151.2 L/sa` | Suit termal/PLSS sisteminin 10 dk kesintisiz taşıma sınırı |
| **İnsanın Dakikada En Fazla Harcayabileceği Oksijen (Fizyolojik VO₂max Tavanı)** | `1,250 – 1,390 W` (`4,265 – 4,743 BTU/sa`) | **`3.60 – 4.00 L/dk`** *(+ `~0.15 L/dk` giysi sızıntısı)* | `5.14 – 5.72 g/dk` | `216 – 240 L/sa` | Fit astronot (`80 kg`, `45–50 mL/dk/kg` VO₂max); NASA-STD-3001 min `32.9 mL/dk/kg` (`82 kg` için `2.70 L/dk`). Apollo PLSS yüksek akış alarm eşiği `0.295 kg/sa = 4.92 g/dk ≈ 3.44 L/dk`'dır. |

### 2.2 Oksijen Rezervi ve Dayanım Süreleri (`oxygenReserveLiters = 420 L` için)
- **Standart Bireysel PLSS Tankı (`420 L STP` ≈ `0.600 kg O₂`):**
  - `0.80 L/dk` nominal tüketimde: **`525 dk`** (`8 saat 45 dk`)
  - `1.01 L/dk` keşif EVA ortalamasında: **`416 dk`** (`6 saat 56 dk`)
  - `2.00 L/dk` ağır tırmanışta: **`210 dk`** (`3 saat 30 dk`)
  - `2.52 L/dk` xEMU 10-dk zirve profilinde (sürekli kabul edilirse): **`167 dk`** (`2 saat 47 dk`)
  - `4.00 L/dk` mutlak maksimum acil efor altında: **`105 dk`** (`1 saat 45 dk`)
- **Yedek Acil Oksijen Paketi (OPS / Secondary Purge):** `+180 – 300 L STP` (`~0.26 – 0.43 kg O₂`, güvenli dönüş için ekstra 30–60 dk rezerv).
- **Kırmızı Güvenlik Eşiği (Walkback Reserve):** Rota tamamlandığında kalan O₂ toplam rezervin en az **`%20 – %25` (`84 – 105 L`)** altına düşmemelidir.

### 2.3 Su ve Kalori Tüketimi (Dakikada & Saatte)
- **İçme Suyu (NASA-STD-3001 EVA):** `~0.24 L/saat` = **`0.0040 L/dk`** (`4.0 mL/dk`)
- **Giysi Isı Atımı / Soğutma Suyu (SWME / Sublimatör):**
  - Ortalama EVA: `0.55 – 0.85 L/saat` = **`0.0092 – 0.0142 L/dk`** (`9.2 – 14.2 mL/dk`)
  - Yüksek efor + sıcak gündüz zirvesi: `1.50 – 1.90 L/saat` = **`0.0250 – 0.0317 L/dk`**
- **Toplam EVA Su Bütçesi (İçme + Soğutma Üst Limiti):** **`2.15 L/saat` = `0.0358 L/dk`** *(Mevcut `RoutePlannerService.js` değeriyle birebir uyumlu)*.
- **Metabolik Kalori Yakımı:** Nominal EVA `~5.0 kcal/dk` (`300 kcal/saat`); ağır tırmanış `~9.0 – 12.0 kcal/dk`; maksimum kısa zirve `~17 – 19 kcal/dk`.

---

## 3. Hız ve Hareket Parametreleri (Dakikada Rover & İnsan Hızı)

### 3.1 Rover Hızları (Dakikada `m/dk` ve `km/dk`)

#### A) İnsanlı Basınçlı Mars Gezici Aracı (Pressurized Mars Rover / NASA SEV Sınıfı)
MarsMap rota planlayıcısı mürettebatlı uzak mesafe görevlerinde (ör. Gale → Jezero veya üsler arası geçiş) **basınçlı rover** modelini esas alır:

| Zemin / Hava Koşulu | Dakikadaki Hız (`m/dk`) | Dakikadaki Hız (`km/dk`) | Saatlik Hız (`km/sa`) | `m/s` | Açıklama |
|---|---|---|---|---|---|
| **Düz Sert Zemin (Nominal Seyir — NASA SEV)** | **`166.7 m/dk`** | `0.1667 km/dk` | `10.0 km/sa` | `2.78 m/s` | Uzun menzilli güvenli nominal hız |
| **Düz Sert Zemin (MarsMap Varsayılan Maksimum Seyir)** | **`241.7 m/dk`** | `0.2417 km/dk` | `14.5 km/sa` | `4.03 m/s` | `RoutePlannerService.js` (`roverSpeedKmH = 14.5`) |
| **Mutlak Güvenli Tasarım Tavanı (Acil / Otoyol Düzlüğü)** | **`300.0 – 316.7 m/dk`** | `0.300 – 0.317 km/dk` | `18.0 – 19.0 km/sa` | `5.00 – 5.28 m/s` | Mars `0.38g` yerçekiminde devrilme ve süspansiyon darbesi üst sınırı |
| **Orta Engebeli / Kumul Geçişi (5°–12° eğim)** | `100.0 – 133.3 m/dk` | `0.100 – 0.133 km/dk` | `6.0 – 8.0 km/sa` | `1.67 – 2.22 m/s` | Tekerlek patinajı (`slip`) kontrolü nedeniyle düşer |
| **Dik Krater Duvarı / Kayalık (12°–22° eğim)** | `50.0 – 83.3 m/dk` | `0.050 – 0.083 km/dk` | `3.0 – 5.0 km/sa` | `0.83 – 1.39 m/s` | `maxSlopeDeg = 22°–25°` sınırına yakın |
| **Şiddetli Kum Fırtınası (`τ = 4.5`, `speedMult = 0.48`)** | `75.0 – 116.0 m/dk` | `0.075 – 0.116 km/dk` | `4.5 – 7.0 km/sa` | `1.25 – 1.93 m/s` | Düşük görüş ve elektrostatik toz fırtınası kısıtı |

#### B) İnsansız Otonom Bilim Roverları (Gerçek NASA Mars Görevleri — Referans)
Otonom robotik keşif araçları gecikmeli Dünya komutu ve güç/işlemci sınırları nedeniyle çok daha yavaştır:
- **NASA Perseverance (Mars 2020):** Maksimum düz sert zemin hızı **`2.53 m/dk`** (`152 m/saat` = `0.152 km/saat`), pratik otonom sürüş ortalaması **`1.5 – 2.0 m/dk`**.
- **NASA Curiosity (MSL):** Maksimum düz sert zemin hızı **`1.50 – 2.33 m/dk`** (`90 – 140 m/saat` = `0.09 – 0.14 km/saat`), pratik ortalama **`0.5 – 1.2 m/dk`**.

### 3.2 İnsan Hızları (Dakikada `m/dk` — Mars Yüzeyinde EVA Yürüyüşü)
Mars yüzeyinde yerçekimi `3.721 m/s²` (`0.38g`) olmakla birlikte basınçlı uzay giysisi (`~60–100 kg` toplam ek kütle) eklem sertliği ve atalet oluşturur:

| Yürüyüş / Hareket Modu | Dakikadaki Hız (`m/dk`) | Dakikadaki Hız (`km/dk`) | Saatlik Hız (`km/sa`) | `m/s` | Kaynak / Açıklama |
|---|---|---|---|---|---|
| **Uzun Süreli Güvenli Yürüyüş (> 1 saat EVA)** | **`45.0 m/dk`** | `0.0450 km/dk` | `2.7 km/sa` | `0.75 m/s` | NASA Apollo Walkback > 1 sa sınırı |
| **Kısa Süreli Nominal EVA Yürüyüşü (< 1 saat, düz zemin)** | **`60.0 m/dk`** | `0.0600 km/dk` | `3.6 km/sa` | `1.00 m/s` | NASA kısa mesafe modeli & `evaSpeedKmH = 3.6` |
| **Engebeli / Eğimli Arazi Yürüyüşü (10°–25° eğim)** | `20.0 – 36.7 m/dk` | `0.020 – 0.037 km/dk` | `1.2 – 2.2 km/sa` | `0.33 – 0.61 m/s` | `slopeFactor = max(0.50, 1 - slope/46)` ile uyumlu |
| **Şiddetli Kum Fırtınası / Asit Sisi Yürüyüşü** | `21.7 – 28.3 m/dk` | `0.022 – 0.028 km/dk` | `1.3 – 1.7 km/sa` | `0.36 – 0.47 m/s` | Görüş kısıtı + rüzgar direnci |
| **Mars Operasyonel Maksimum Hız (Sıçrama / Loping Gait)** | **`83.3 – 90.0 m/dk`** | `0.083 – 0.090 km/dk` | `5.0 – 5.4 km/sa` | `1.39 – 1.50 m/s` | Giysi içinde dengeli en yüksek sürdürülebilir tempo |
| **Mutlak Acil Kısa Sprint Limiti (Düşme Riski Yüksek)** | **`116.7 – 150.0 m/dk`** | `0.117 – 0.150 km/dk` | `7.0 – 9.0 km/sa` | `1.94 – 2.50 m/s` | Sadece birkaç saniyelik acil kaçış (Apollo 17 tepe `~9 km/sa` referansı; O₂ tüketimi tavan `3.6–4.0 L/dk`'ya fırlar) |
| **Habitat / Rover İçi Giysisiz Yürüyüş (IVA Referans)** | `75.0 – 83.3 m/dk` | `0.075 – 0.083 km/dk` | `4.5 – 5.0 km/sa` | `1.25 – 1.39 m/s` | Basınçlı ortamda normal insan adımı |

---

## 4. Enerji, Batarya ve Güç Parametreleri

### 4.1 Basınçlı Mars Rover Enerji Modeli (NASA TM-20220006678 & SEV)
- **Batarya Kapasitesi:** `52.7 – 100 kWh` (Li-ion ana batarya; uzun menzil için yakıt hücresi veya RTG/fisyon destekli).
- **Nominal Güç Çekimi (Sürüş Halinde):**
  - Hareket (Propulsion): `10.0 kW` = **`166.7 Wh/dk`** (`düz zeminde ~6.0–8.0 kW = 100–133 Wh/dk`)
  - Yaşam Destek & Kabin İklimlendirme (Hotel Load): `1.8 kW` = **`30.0 Wh/dk`**
  - Bilim & İletişim / Radar: `0.25 kW` = **`4.2 Wh/dk`**
  - **Toplam Ortalama Sürüş Gücü:** `~12.05 kW` = **`200.8 Wh/dk`**
  - **Zirve Tırmanış / Kaba Zemin Gücü:** `15.0 – 18.0 kW` = **`250.0 – 300.0 Wh/dk`**
- **Mesafe Başına Enerji Tüketimi:** Düz sert zemin `0.65 – 0.85 kWh/km`; yumuşak kum/eğim `1.10 – 1.60 kWh/km`.
- **Tek Şarj Menzili:** `125 – 240 km` (güvenli dönüş için **`%35` batarya rezervi** korunmalıdır — `curiosity_mount_sharp_route.json`).

### 4.2 Astronot Uzay Giysisi (MxEMU / PLSS) Enerji Modeli
- **Batarya Kapasitesi:** `1.2 – 1.8 kWh` (yaklaşık `28 V`, 8 saat EVA + 1 saat rezerv).
- **Nominal Güç Tüketimi (Fan, Pompa, Sensör, Telsiz):** `55 – 85 W` = **`0.92 – 1.42 Wh/dk`**.
- **Soğuk Kutup / Gece Isıtma Zirvesi (ör. Korolev `-125 °C`):** `120 – 150 W` = **`2.00 – 2.50 Wh/dk`**.

---

## 5. Mars Fiziksel, Topografik ve Tehlike Parametreleri

### 5.1 Gezegen ve Atmosfer Sabitleri (NASA Mars Fact Sheet)
- **Ortalama Yarıçap (`R_mars`):** `3,389.5 km` (`3,389,500 m`)
- **Yüzey Yerçekimi (`g_mars`):** `3.721 m/s²` (`0.379 g_earth`, pratikte `0.38g`)
- **1 Mars Günü (Sol):** `24 saat 39 dk 35.2 sn` = **`1,479.59 dk`** (`88,775 sn`)
- **Yüzey Atmosfer Basıncı:** `6.36 mbar` ortalama (`0.636 kPa`; Dünya'nın `%0.6`'sı) — **solunamaz** (`%95.32 CO₂`, `%2.70 N₂`, `%1.60 Ar`, `%0.13 O₂`)
- **Yüzey Sıcaklığı:** `-140 °C` (kutup kışı) ile `+20 °C` (ekvator yaz öğleni); ortalama `-63 °C`
- **Ortalama Güneş Işınımı:** `586.2 W/m²` (Dünya'nın `%43.1`'i; toz fırtınasında `%80–95` düşer)
- **Topografik Yükseklik Aralığı (MOLA):** `-8,200 m` (Hellas havzası `-7,152 m`) ile `+21,229 m` (Olympus Mons)

### 5.2 Eğim ve Arazi Geçiş Limitleri
- **Basınçlı Rover Maksimum Güvenli Eğim:** `20° – 25°` (`curiosity_mount_sharp_route.json`: `25.0°`; `AppConfig/BACKEND_API`: `22.0°`)
- **İnsan EVA Maksimum Tırmanış Eğimi:** `25° – 30°` (emniyet halatı/kramponsuz kritik sınır)
- **Kritik Tekerlek Kayma Eşiği (`wheel slip`):** `0.40` (`%40`) | **Kaya Pürüzlülük Limiti:** `30 cm`
- **Hızın Eğimle Azalması (Basitleştirilmiş Formül):**

$$v_{\text{etkin}} = v_{\text{düz}} \times \max\left(0.40,\; 1 - \frac{\theta_{\text{eğim}}}{46^\circ}\right) \times k_{\text{asit}} \times k_{\text{fırtına}}$$

### 5.3 Çevresel Tehlikeler ve Radyasyon Eşikleri (`readme.md` Birimleriyle)
| Tehlike Katmanı | Düşük / Hafif | Orta | Şiddetli / Kritik | Hız & Sapma Etkisi (`AppConfig.js`) |
|---|---|---|---|---|
| **Asit Yağmuru / Sülfat Sisi (`H₂SO₄ / HCl`)** | `pH 3.8` | `pH 2.4` | `pH 1.3` | Hız çarpanı: `0.92` / `0.78` / `0.58`; Sapma ölçeği: `0.65` / `1.00` / `1.48` |
| **Kum Fırtınası / Toz Kasırgası (`τ` Optik Derinlik)** | `τ 1.2` | `τ 2.8` | `τ 4.5` (toz şeytanı içi `30 m/s = 1,800 m/dk`, `20 kV/m` statik) | Hız çarpanı: `0.88` / `0.70` / `0.48`; Sapma ölçeği: `0.70` / `1.00` / `1.55` |
| **Radyasyon — Alfa (`α`)** | `≤ 0.02 μSv/s` (`1.2 μSv/dk`) | `0.05 μSv/s` (`3.0 μSv/dk`) | `0.14 – 0.18 μSv/s` (`8.4 – 10.8 μSv/dk`) | Güvenli üst sınır: **`0.05 μSv/s`** (`3.0 μSv/dk`) |
| **Radyasyon — Beta (`β`)** | `≤ 0.40 mSv/sa` (`6.7 μSv/dk`) | `1.00 mSv/sa` (`16.7 μSv/dk`) | `1.65 – 2.15 mSv/sa` (`27.5 – 35.8 μSv/dk`) | Güvenli üst sınır: **`1.00 mSv/sa`** (`16.7 μSv/dk`) |
| **Radyasyon — Gama (`γ`)** | `≤ 0.20 mSv/sa` (`3.3 μSv/dk`) | `0.50 mSv/sa` (`8.3 μSv/dk`) | `0.82 – 0.96 mSv/sa` (`13.7 – 16.0 μSv/dk`) | Güvenli üst sınır: **`0.50 mSv/sa`** (`8.3 μSv/dk`) |
| **Foton Bombardımanı & Görev Dozu** | Arka plan `0.64 mSv/gün` (`0.44 μSv/dk`) | `4.8×10⁶ MeV/cm²·s` | `5.4 – 6.3×10⁶ MeV/cm²·s` | NASA kariyer limiti: **`< 600 mSv`** |

---

## 6. Kod Tabanıyla Eşleştirme ve Geliştirici Notları

Projede aktif kullanılan dosyalar ve `Prameters.md` parametrelerinin kod karşılıkları:
1. **`js/services/RoutePlannerService.js` & `js/services/BackendApiService.js`**:
   - `evaSpeedKmH = 3.6` → **`60.0 m/dk`** (kısa EVA için gerçekçi; uzun EVA >1 sa için `2.7 km/saat = 45.0 m/dk` önerilir).
   - `roverSpeedKmH = 14.5` → **`241.7 m/dk`** (basınçlı SEV rover üst seyir hızı için gerçekçi; nominal `10 km/saat = 166.7 m/dk`).
   - `o2LitersPerHour = 48.0` → **`0.80 L/dk`** (hafif-orta EVA için gerçekçi; NASA keşif ortalaması `1.01 L/dk`, tavan `3.60 – 4.00 L/dk` ile dinamik eğim/efor ölçeklemesi yapılabilir).
   - `waterLitersPerHour = 2.15` → **`0.0358 L/dk`** (yüksek efor üst bandı; nominal ortalama `0.80 – 1.10 L/saat`).
2. **`backend/src/lib.rs` (Rust A* Pathfinding)**:
   - Mevcut `DISTANCE_PER_MT = 25` ve `hoxy = path.len() * DISTANCE_PER_MT` sabit adımlı düşüşü yerine, `Prameters.md` içindeki hız (`m/dk`), eğim (`Δz`) ve maksimum O₂ (`0.80 – 4.00 L/dk`) oranlarıyla süre tabanlı gerçekçi O₂ tüketimi hesaplanması önerilir.

---

## 7. Başvurulan Resmi Kaynaklar
1. **NASA-STD-3001 Vol. 1 & 2 (Space Flight Human-System Standard)** — VO₂max (`32.9 mL/dk/kg` min), EVA su ve metabolik enerji gereksinimleri (`https://www.nasa.gov/reference/4-0-human-performance/`)
2. **NASA NTRS (`20260003038`, `19760003073`) — Mars Spacesuit Mass & Apollo/xEMU PLSS Metabolic Profiles** (`850 – 1,200 BTU/sa` ortalama, `3,000 BTU/sa` 10-dk zirve, `0.295 kg/sa` akış alarmı)
3. **NASA EVA Walkback Test & Apollo Traverse Analysis (`NASA-TP-2009-214796`)** — `2.7 – 3.6 km/sa` (`45 – 60 m/dk`) EVA yürüyüş ve loping hız geçiş sınırları (`1.4 m/s`)
4. **NASA Pressurized Rover / Space Exploration Vehicle (SEV) & `TM-20220006678`** — `10 – 19 km/sa` hız, `10 kW` hareket + `1.8 kW` otel yükü, `52.7 kWh` batarya
5. **NASA Science — Perseverance & Curiosity Rover Components** — `152 m/sa` (`2.53 m/dk`) ve `90–140 m/sa` (`1.50–2.33 m/dk`) robotik rover hızları
6. **NASA NSSDC Mars Fact Sheet & MSL Curiosity RAD** — `R = 3,389.5 km`, `g = 3.721 m/s²`, `6.36 mbar`, `586.2 W/m²`, `0.64 ± 0.12 mSv/gün` yüzey dozu, `< 600 mSv` `OCHMO-TB-020` limiti
