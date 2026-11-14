/**
 * @file craterWaypointsData.js
 * @description Gale, Jezero ve Korolev kraterleri için bilimsel EVA keşif durakları (waypoints),
 * jeolojik veriler, eğim riskleri ve fotoğraf referansları veri modülü.
 */

(function (ns) {
  "use strict";
  const CRATER_WAYPOINTS_DATA = {
    "gale-crater": [
      {
        id: "wp-1",
        name: "Bradbury Landing",
        sol: 0,
        elev: -4400,
        slope: 1.2,
        slopeText: "1.2°",
        geology: "Alüvyon ovası, bazalt çakılları (Hesperian)",
        science: "Yüzeye iniş teyidi, yaşam destek kalibrasyonu ve ilk radyasyon referans ölçümü.",
        hazardNote: "Düşük risk. Sert zemin; astronot yürüyüşü ve ikmal aracı için ideal başlangıç.",
        relX: -145,
        relY: -85,
        status: "Başlangıç Üssü",
        type: "base",
        acidRisk: false,
        stormRisk: false
      },
      {
        id: "wp-2",
        name: "Yellowknife Bay",
        sol: 125,
        elev: -4420,
        slope: 2.5,
        slopeText: "2.5°",
        geology: "Sheepbed çamurtaşı, antik tatlı su göl tabanı",
        science: "Yaşam için temel C, H, N, O, P, S elementlerinin bulunduğu ilk antik yaşanabilir göl yatağı.",
        hazardNote: "Düşük risk. Hafif toz birikintisi; bot tabanı tutuşu stabil.",
        relX: -95,
        relY: -45,
        status: "Bilimsel Keşif",
        type: "lake",
        acidRisk: false,
        stormRisk: false
      },
      {
        id: "wp-3",
        name: "Pahrump Hills & Bagnold Sınırı",
        sol: 753,
        elev: -4450,
        slope: 14.5,
        slopeText: "14.5°",
        geology: "Murray formasyonu bazal katmanı ve bazalt kumulları",
        science: "Mount Sharp'ın taban tortul katmanlarının başlangıcı; rüzgar erozyonu analizi.",
        hazardNote: "Yüksek toz ve patinaj riski! Kumul tuzaklarından kaçınarak kayalık kenardan ilerleyin.",
        relX: -35,
        relY: -10,
        status: "Kumul Geçişi",
        type: "outcrop",
        acidRisk: false,
        stormRisk: true
      },
      {
        id: "wp-4",
        name: "Vera Rubin Ridge",
        sol: 1800,
        elev: -4210,
        slope: 18.0,
        slopeText: "18.0°",
        geology: "Sert hematit kristalli erozyon dirençli sırt",
        science: "Demir oksit mineralizasyonu ve asidik yeraltı suyunun kayaç kimyasına etkisi.",
        hazardNote: "Dik tırmanış (18°) ve keskin rüzgar aşındırmalı taşlar (ventifact). Asidik sülfat kalıntıları.",
        relX: 35,
        relY: 28,
        status: "Zorlu Sırt",
        type: "ridge",
        acidRisk: true,
        stormRisk: false
      },
      {
        id: "wp-5",
        name: "Boxwork Sırtları & Sülfat Ünitesi",
        sol: 3400,
        elev: -4020,
        slope: 12.5,
        slopeText: "12.5°",
        geology: "Magnezyum/Kalsiyum sülfat ve Boxwork mineral ağları",
        science: "2026 Space Apps Ana Hedefi: Curiosity'nin 2025'te incelediği kutu şekilli mineral sırtları; antik asidik kuruma döneminin kanıtı.",
        hazardNote: "Asidik sülfat tozu & bıçak sırtı kayaçlar. Kask vizörü ve eldiven contalarını kontrol edin.",
        relX: 95,
        relY: 72,
        status: "Challenge Ana Hedefi",
        type: "boxwork",
        highlight: true,
        acidRisk: true,
        stormRisk: false
      },
      {
        id: "wp-6",
        name: "Gediz Vallis Kanalı",
        sol: 4100,
        elev: -3900,
        slope: 16.2,
        slopeText: "16.2°",
        geology: "Kaya moloz akıntısı ve antik ani sel kanalı",
        science: "Mount Sharp yamaçlarından akan son şiddetli su ve çamur sellerinin bıraktığı dev kaya blokları.",
        hazardNote: "Kaygan moloz blokları ve yüksek yamaç eğimi. Çift astronot emniyet halatı önerilir.",
        relX: 150,
        relY: 118,
        status: "Zirve İstasyonu",
        type: "channel",
        acidRisk: false,
        stormRisk: true
      }
    ],
    "jezero-crater": [
      {
        id: "j-wp-1",
        name: "Octavia E. Butler İniş Sahası",
        sol: 0,
        elev: -2570,
        slope: 1.0,
        slopeText: "1.0°",
        geology: "Krater tabanı olivinli volkanik bazalt",
        science: "Perseverance & Ingenuity iniş noktası. Yüzey düzlüğü ve habitat kurulumuna uygunluk.",
        hazardNote: "Çok düşük risk. Geniş görüş alanı ve sağlam bazaltik zemin.",
        relX: -120,
        relY: -65,
        status: "Başlangıç Üssü",
        type: "base",
        acidRisk: false,
        stormRisk: false
      },
      {
        id: "j-wp-2",
        name: "Three Forks (Numune Deposu)",
        sol: 650,
        elev: -2530,
        slope: 3.5,
        slopeText: "3.5°",
        geology: "Delta alt katmanı ince tortul çökeller",
        science: "Dünya'ya iade edilecek 10 mühürlü kaya çekirdeği tüpünün bulunduğu stratejik depo noktası.",
        hazardNote: "Düşük risk. Bölgesel toz şeytanlarına (dust devils) karşı optik sensör takibi.",
        relX: -35,
        relY: -18,
        status: "Kritik Depo",
        type: "depot",
        highlight: true,
        imageUrl: "./res/images/perseverance_supercam_sol2031.jpg",
        imageCaption: "NASA Perseverance Sol 2031 SuperCam Ham Yüzey Görüntüsü",
        acidRisk: false,
        stormRisk: true
      },
      {
        id: "j-wp-3",
        name: "Neretva Vallis Delta Önü",
        sol: 1100,
        elev: -2480,
        slope: 14.0,
        slopeText: "14.0°",
        geology: "Antik nehir deltası yelpazesi, smektit kili ve karbonatlar",
        science: "Antik Mars yaşamına dair mikrobiyal biyoimza ve fosil izi arama potansiyeli en yüksek nokta.",
        hazardNote: "Orta-Yüksek risk: Dik delta yarları (scarps) ve gevşek kumlu çökeller.",
        relX: 65,
        relY: 42,
        status: "Aktif Delta Sahası",
        type: "delta",
        imageUrl: "./res/images/perseverance_supercam_sol2031.jpg",
        imageCaption: "Jezero Krateri Delta Kenarı Ham Kamera Verisi (Sol 2031)",
        acidRisk: false,
        stormRisk: false
      },
      {
        id: "j-wp-4",
        name: "Krater Kenar Duvarı (Bright Angel)",
        sol: 1650,
        elev: -2310,
        slope: 21.5,
        slopeText: "21.5°",
        geology: "Noachian dönemi yaşlı krater duvarı ve hidrotermal damarlar",
        science: "Göl öncesi erken Mars kabuğu ve asidik/hidrotermal kayaç değişim izleri.",
        hazardNote: "Yüksek eğim (21.5°) ve kuvvetli rüzgar kesmesi (wind shear).",
        relX: 130,
        relY: 88,
        status: "Üst Sınır Sahası",
        type: "ridge",
        acidRisk: true,
        stormRisk: true
      }
    ],
    "korolev-crater": [
      {
        id: "k-wp-1",
        name: "Kuzey Krater Kenar Kampı",
        sol: 0,
        elev: -1820,
        slope: 4.0,
        slopeText: "4.0°",
        geology: "Buz çevresi bazaltik krater kenarı",
        science: "Kalıcı kutup buzulu kenarında termal yalıtımlı astronot üssü konumlandırması.",
        hazardNote: "Aşırı soğuk (-125°C). Giysi ısıtıcı batarya tüketimi yüksek.",
        relX: -115,
        relY: -70,
        status: "Kenar Üssü",
        type: "base",
        acidRisk: false,
        stormRisk: false
      },
      {
        id: "k-wp-2",
        name: "Saf Su Buzu Kalkanı (ISRU Noktası)",
        sol: 45,
        elev: -2000,
        slope: 8.5,
        slopeText: "8.5°",
        geology: "1.8 km kalınlığında kalıcı saf H2O su buzu tabakası",
        science: "İnsanlı üs için oksijen ve roket yakıtı (CH4 + O2) üretimi amacıyla buz karot sondajı.",
        hazardNote: "Kaygan sert buz yüzeyi ve CO2 kırağı fırtınaları; krampon zorunlu.",
        relX: 10,
        relY: 5,
        status: "ISRU Ana Kaynağı",
        type: "ice",
        highlight: true,
        acidRisk: false,
        stormRisk: true
      }
    ]
  };

  ns.CRATER_WAYPOINTS_DATA = CRATER_WAYPOINTS_DATA;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc modül başlığı ve krater durak verileri açıklaması.
   - Satır 7: CRATER_WAYPOINTS_DATA dışa aktarılan ana nesne sözlüğü.
   - Satır 8-95: "gale-crater" dizisi; Bradbury Landing, Yellowknife Bay, Pahrump Hills, Vera Rubin Ridge, Boxwork Sırtları ve Gediz Vallis duraklarını içerir.
   - Satır 96-159: "jezero-crater" dizisi; Octavia E. Butler, Three Forks (gerçek NASA Sol 2031 görsel bağlantılı), Neretva Vallis ve Bright Angel durakları.
   - Satır 160-191: "korolev-crater" dizisi; kutup kenar kampı ve ISRU su buzu kalkanı durakları.
   - Satır 192: Sözlük nesnesinin bitişi.
   ========================================================================== */
