/**
 * @file craterLocations.js
 * @description Mars Kraterleri ve hedef keşif bölgeleri veri seti.
 * NASA Space Apps 2026 - Interplanetary Survival Guide meydan okuması hedefleri.
 */

export const CRATERS_DATA = [
  {
    id: "gale-crater",
    name: "Gale Krateri & Mount Sharp",
    englishName: "Gale Crater (Aeolis Mons)",
    coordinates: { lat: -4.5895, lon: 137.4417 },
    diameter_km: 154,
    depth_m: 5500,
    elevation_datum_m: -4400,
    recommended: true,
    tag: "NASA Challenge Odak Krateri (Boxwork & Sedimanter)",
    description: "NASA Space Apps 2026 yarışma metninde doğrudan örnek gösterilen bölge. Curiosity'nin 2025'te keşfettiği 'Boxwork' mineral oluşumları, kilden asidik sülfata geçiş katmanları ve insanlı Mars yürüyüşü (Marswalk) için 5.5 km'lik tırmanış rotası sunar.",
    scientific_targets: [
      "Boxwork jeolojik mineral sırtları (2025 Curiosity bulgusu)",
      "Tatlı su gölü çamurtaşından asidik sülfat tabakasına geçiş",
      "Gediz Vallis moloz akıntısı ve antik sel kanalı",
      "Vera Rubin Ridge hematit kristalleri"
    ],
    hazards: {
      slope: "Yer yer 31° dik tırmanış (Greenheugh Pediment)",
      terrain: "Keskin ventifact taşları (tekerlek ve bot yırtılma riski)",
      atmosphere: "Bagnold kumul tuzağı ve mevsimsel toz fırtınaları"
    },
    default_zoom: 1.2,
    center_offset: { x: 0, y: 0 }
  },
  {
    id: "jezero-crater",
    name: "Jezero Krateri & Antik Nehir Deltası",
    englishName: "Jezero Crater & Neretva Delta",
    coordinates: { lat: 18.4447, lon: 77.4508 },
    diameter_km: 49,
    depth_m: 2570,
    elevation_datum_m: -2570,
    recommended: true,
    tag: "Aktif Rover & Örnek Toplama Sahası",
    description: "Perseverance ve Ingenuity'nin aktif keşif sahası. Antik nehir deltası, karbonat çökeltileri ve mikrobiyal yaşam izleri barındırma potansiyeli en yüksek sahadır. 1 milyondan fazla gerçek ham fotoğraf verisine sahiptir.",
    scientific_targets: [
      "Neretva Vallis nehir deltası tortul yelpazesi",
      "Karbonat ve smektit kil mineralleri",
      "Dünya'ya getirilecek tüplenmiş kaya çekirdekleri (Sample Depot)"
    ],
    hazards: {
      slope: "Delta önü dik yararları (delta scarps)",
      terrain: "Kumlu gevşek regolit ve rüzgar çukurları",
      atmosphere: "Bölgesel toz şeytanları (dust devils)"
    },
    default_zoom: 1.5,
    center_offset: { x: -40, y: 20 }
  },
  {
    id: "korolev-crater",
    name: "Korolev Krateri & Su Buzu Buzulu",
    englishName: "Korolev Crater (Permanent Water Ice)",
    coordinates: { lat: 73.0, lon: 165.0 },
    diameter_km: 81,
    depth_m: 2000,
    elevation_datum_m: -2000,
    recommended: false,
    tag: "ISRU Su Kaynağı & Kutup Bölgesi",
    description: "İçinde 1.8 km kalınlığında, 2.200 kilometreküp saf su buzu kalkanı barındıran dev krater. İnsanlı üs için sınırsız su ve yakıt kaynağı (ISRU) potansiyeline sahiptir.",
    scientific_targets: [
      "Kalıcı soğuk tuzak (cold trap) buz tabakası",
      "Mars iklim geçmişini saklayan polar katmanlar"
    ],
    hazards: {
      slope: "Buzul kenarı dik krater duvarları",
      terrain: "Kaygan sert buz yüzeyi ve derin çatlaklar",
      atmosphere: "Aşırı kutup soğuğu (-130°C) ve CO2 kuru buz yoğunlaşması"
    },
    default_zoom: 1.0,
    center_offset: { x: 0, y: 0 }
  }
];

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc başlık ve Space Apps 2026 meydan okuması bilgisi.
   - Satır 7: CRATERS_DATA sabit dizisinin dışa aktarımı.
   - Satır 8-32: Gale Krateri ve Mount Sharp veri nesnesi; koordinatlar, Boxwork hedefleri, eğim ve tehlikeler.
   - Satır 33-54: Jezero Krateri veri nesnesi; Perseverance iniş sahası, nehir deltası ve örnek tüpleri.
   - Satır 55-73: Korolev Krateri veri nesnesi; su buzu rezervi ve kutup koşulları.
   - Satır 74: Dizi sonu.
   ========================================================================== */
