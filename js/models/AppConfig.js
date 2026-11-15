/**
 * @file AppConfig.js
 * @description AstroChief Mars Navigator icin zorunlu Factory Reset varsayilanlarini ve sabitleri tanimlayan sinif.
 * Kurallar: Default harita 3D baslar, yaklastikca LOD render yapilir, parametreler Litre / km-m / Saat / Alfa-Beta-Gama olur.
 */

(function (ns) {
  "use strict";
  class AppConfig {
    /**
     * Sistem performans koruma ve fabrika ayar sablonunu olusturur
     */
    constructor() {
      this.storageKey = "astrochief_mars_navigator_v4_4";
      this.fpsMinLimit = 10;
      this.fpsGuardWindowMs = 10000;    // KURAL: Ayar degistirildikten sonra 10 saniye < 10 FPS kalirsa geri al
      this.challengeUrl = "https://www.spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map/";
    }

    /**
     * Zorunlu Factory Ayarlari nesnesini dondurur
     * @returns {Object} Varsayilan fabrika yapilandirmasi
     */
    getFactoryDefaults() {
      return {
        lang: "en",                     // Varsayilan dil: Ingilizce (9 dil destekli)
        viewMode: "3d",                 // KURAL: Harita varsayilan olarak 3D baslar
        activeLayerId: "mars-viking-mdim21",
        activeCraterId: "gale-crater",
        routeScope: "global",           // Varsayilan: Bulundugumuz Konum -> Hedef Konum rotasi
        globalOriginId: "curiosity-gale",
        globalTargetId: "perseverance-jezero",
        customOrigin: {
          id: "curiosity-gale",
          name: "Bulunduğumuz Konum",
          lat: -4.5895,
          lon: 137.4417
        },
        customDestination: {
          id: "perseverance-jezero",
          name: "Jezero Krateri",
          lat: 18.4447,
          lon: 77.4508
        },
        useCustomCoordinates: false,
        backendApiUrl: "http://127.0.0.1:8080", // Varsayilan Rust backend adresi
        activeStepRouteTab: "primary",
        expeditionMode: "rover-crew",   // Birlesik Rover + Insan sefer modu ('rover-crew' | 'joint-eva-escort')
        targetSpeedKmH: 14.5,           // Birlesik sefer hedef hizi (km/sa)
        oxygenReserveLiters: null,      // Zorunlu on-gorev girisi (bos baslar, kapidan gecmeden rota baslamaz)
        oxygenTankCapacityL: 420,       // Referans %100 PLSS+SEV O2 tank kapasitesi (L)
        energyReserveKwh: null,         // Zorunlu on-gorev girisi (bos baslar)
        energyTankCapacityKwh: 75.0,    // Referans %100 SEV batarya kapasitesi (kWh)
        missionParamsConfirmed: false,  // Kullanici O2/Enerji girip onaylamadan rota & yolculuk baslamaz
        filterAcidRain: true,
        acidIntensity: "orta",          // 'hafif' | 'orta' | 'siddetli'
        filterDustStorm: true,
        stormIntensity: "orta",         // 'hafif' | 'orta' | 'siddetli'
        progressiveLodRender: true,     // KURAL: Olcek yaklastikca render et, tamamini render etme
        showRadiationZones: true,       // Alfa, Beta, Gama ve Foton Bombardiman alanlari
        showRouteComments: true,        // Harita uzerinde yol yorumlari ve sure etiketleri
        showNomenclature: true,
        showGraticule: false,
        showStarfield: true,
        graphicsQuality: "high",        // 'low' | 'medium' | 'high' | 'ultra'
        highQualityGlobeRay: false,     // Agir 3D ornekleme (FPS testine duyarli)
        enable3DTerrain: true,
        topoReliefScale: 1.0,
        camPitch: 0,
        camYaw: 0,
        rotLat: -4.59,
        rotLon: 137.44,
        zoom: 1.05,
        panX: 0,
        panY: 0,
        inspectorOpen: false
      };
    }

    /**
     * Mars cevresel tehlike (CO2 donu/perklorat ve toz firtinasi) siddet katsayilarini dondurur
     * @returns {Object} Siddet derecesi tablosu
     */
    getIntensityTable() {
      return {
        acid: {
          hafif:    { label: "Hafif", ph: "0.4% ClO₄⁻ · -75°C", speedMult: 0.92, detourScale: 0.65, alphaMult: 0.55 },
          orta:     { label: "Orta", ph: "0.8% ClO₄⁻ · -105°C", speedMult: 0.78, detourScale: 1.00, alphaMult: 1.00 },
          siddetli: { label: "Şiddetli", ph: "1.2% ClO₄⁻ · -125°C", speedMult: 0.58, detourScale: 1.48, alphaMult: 1.55 }
        },
        storm: {
          hafif:    { label: "Hafif", tau: "τ 1.2", speedMult: 0.88, detourScale: 0.70, alphaMult: 0.55 },
          orta:     { label: "Orta", tau: "τ 2.8", speedMult: 0.70, detourScale: 1.00, alphaMult: 1.00 },
          siddetli: { label: "Şiddetli", tau: "τ 4.5", speedMult: 0.48, detourScale: 1.55, alphaMult: 1.60 }
        }
      };
    }
  }

  ns.AppConfig = AppConfig;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc fabrika ayar sablonu ve kurallar aciklamasi.
   - Satir 7-18: AppConfig constructor; v4.4 depo anahtari, FPS >= 10 (10s) esigi ve NASA Space Apps URL'sini tanimlar.
   - Satir 20-78: getFactoryDefaults; default 3D mod, birlesik Rover+Insan sefer modu, bos/zorunlu O2-Enerji-Su parametre kapisi ve LOD standartlarini doner.
   - Satir 80-97: getIntensityTable; asit yagmuru ve kum firtinasi siddetlerinin (Hafif/Orta/Siddetli) rota ve hiz carpanlarini doner.
   ========================================================================== */
