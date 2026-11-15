/**
 * @file HazardFieldService.js
 * @description NASA Worldview, USGS jeoloji ve kullanici Uydular panelinden secilen siddete gore
 * CO2 Kuru Buz Donu/Perklorat Regolit, Toz Firtinasi/Girdabi ve Alfa/Beta/Gama Radyasyon bolgelerini hesaplayan servis.
 */

(function (ns) {
  "use strict";
  const { AppConfig } = ns;

  class HazardFieldService {
    /**
     * HazardFieldService yapici metodu
     * @param {AppConfig} config - Siddet katsayisi ve birim yapilandirmasi
     */
    constructor(config = new AppConfig()) {
      this.config = config;
      this.intensityTable = config.getIntensityTable();
      this.worldviewHazards = null;
    }

    /**
     * nasa_worldview_and_hazards.json verisini servise yukler
     * @param {Object} json - Worldview tehlike verisi
     */
    setWorldviewData(json) {
      this.worldviewHazards = json;
    }

    /**
     * Kuresel (lat/lon) Asit Yagmuru, Kum Firtinasi ve Radyasyon/Foton kusaklarini aktif siddete gore dondurur
     * @param {Object} options - { filterAcidRain, acidIntensity, filterDustStorm, stormIntensity, showRadiationZones }
     * @returns {Object} Kuresel tehlike alan listeleri
     */
    getGlobalHazardZones(options = {}) {
      const t = (k, v) => (ns.i18n ? ns.i18n.t(k, v) : k);
      const acidSpec = this.intensityTable.acid[options.acidIntensity || "orta"];
      const stormSpec = this.intensityTable.storm[options.stormIntensity || "orta"];

      // 1. Asit Yagmuru & Sulfat Sisi Bolgeleri (Tharsis, Cerberus Fossae, Gale-Elysium Koridoru)
      const acidZones = options.filterAcidRain ? [
        {
          id: "acid-cerberus",
          name: t("hzAcidCerberus", { ph: acidSpec.ph }),
          lat: -6.5,
          lon: 112.0,
          radiusDeg: 13 * acidSpec.detourScale,
          intensity: acidSpec.label,
          ph: acidSpec.ph
        },
        {
          id: "acid-tharsis",
          name: t("hzAcidTharsis", { ph: acidSpec.ph }),
          lat: -4.0,
          lon: -98.0,
          radiusDeg: 15 * acidSpec.detourScale,
          intensity: acidSpec.label,
          ph: acidSpec.ph
        },
        {
          id: "acid-meridiani",
          name: t("hzAcidMeridiani", { ph: acidSpec.ph }),
          lat: -3.5,
          lon: 12.0,
          radiusDeg: 12 * acidSpec.detourScale,
          intensity: acidSpec.label,
          ph: acidSpec.ph
        }
      ] : [];

      // 2. Kum Firtinasi / Kasirga Koridorlari (nasa_worldview_and_hazards.json verisiyle senkronize)
      const corridors = this.worldviewHazards?.mars_environmental_hazards?.global_and_regional_dust_storm_corridors || [];
      const wrapLon = (lon) => (((Number(lon) || 0) + 180) % 360 + 360) % 360 - 180;
      const findCorridor = (id, defLat, defLon) => {
        const hit = corridors.find((c) => c.region_id === id);
        return hit ? { lat: Number(hit.center_lat), lon: wrapLon(hit.center_lon) } : { lat: defLat, lon: defLon };
      };
      const hellasCoord = findCorridor("hellas-basin-corridor", -42.7, 70.0);
      const acidaliaCoord = findCorridor("acidalia-chryse-storm-track", 35.0, -35.0);
      const solisCoord = findCorridor("solis-planum-trigger", -26.0, -90.0);

      const stormZones = options.filterDustStorm ? [
        {
          id: "storm-hellas",
          name: t("hzStormHellas", { tau: stormSpec.tau }),
          lat: hellasCoord.lat,
          lon: hellasCoord.lon,
          radiusDeg: 20 * stormSpec.detourScale,
          intensity: stormSpec.label,
          tau: stormSpec.tau
        },
        {
          id: "storm-isidis",
          name: t("hzStormIsidis", { tau: stormSpec.tau }),
          lat: 9.0,
          lon: 98.0,
          radiusDeg: 13 * stormSpec.detourScale,
          intensity: stormSpec.label,
          tau: stormSpec.tau
        },
        {
          id: "storm-acidalia",
          name: t("hzStormAcidalia", { tau: stormSpec.tau }),
          lat: acidaliaCoord.lat,
          lon: acidaliaCoord.lon,
          radiusDeg: 16 * stormSpec.detourScale,
          intensity: stormSpec.label,
          tau: stormSpec.tau
        },
        {
          id: "storm-solis",
          name: t("hzStormSolis", { tau: stormSpec.tau }),
          lat: solisCoord.lat,
          lon: solisCoord.lon,
          radiusDeg: 14 * stormSpec.detourScale,
          intensity: stormSpec.label,
          tau: stormSpec.tau
        }
      ] : [];

      // 3. Alfa / Beta / Gama Radyasyon ve Foton Bombardiman Alanlari
      const radiationZones = options.showRadiationZones !== false ? [
        {
          id: "rad-global-equator",
          name: t("hzRadEquator"),
          lat: 13.0,
          lon: 48.0,
          radiusDeg: 14,
          alphaLevel: "0.14 μSv/s (α)",
          betaLevel: "1.65 mSv/h (β)",
          gammaLevel: "0.82 mSv/h (γ)",
          photonFlux: "5.4x10^6 MeV/cm²·s"
        },
        {
          id: "rad-global-polar",
          name: t("hzRadPolar"),
          lat: 63.0,
          lon: 112.0,
          radiusDeg: 16,
          alphaLevel: "0.06 μSv/s (α)",
          betaLevel: "2.15 mSv/h (β)",
          gammaLevel: "0.96 mSv/h (γ)",
          photonFlux: "6.3x10^6 MeV/cm²·s"
        }
      ] : [];

      return { acidZones, stormZones, radiationZones, acidSpec, stormSpec };
    }

    /**
     * Secili krater ici EVA yuruyusu icin Radyasyon (Alfa, Beta, Gama) ve Foton Bombardiman alanlarini doner
     * @param {string} craterId - Krater kimligi
     * @returns {Array} Krater ici isima bolgeleri
     */
    getCraterRadiationZones(craterId) {
      const t = (k, v) => (ns.i18n ? ns.i18n.t(k, v) : k);
      if (craterId === "jezero-crater") {
        return [{
          id: "rad-jz-1",
          name: t("hzRadJezero"),
          relX: 16,
          relY: -44,
          radius: 52,
          alphaLevel: "0.08 μSv/s (α)",
          betaLevel: "1.42 mSv/h (β)",
          gammaLevel: "0.64 mSv/h (γ)",
          photonFlux: "4.8x10^6 MeV/cm²·s"
        }];
      }
      if (craterId === "korolev-crater") {
        return [{
          id: "rad-kr-1",
          name: t("hzRadKorolev"),
          relX: -40,
          relY: 36,
          radius: 56,
          alphaLevel: "0.04 μSv/s (α)",
          betaLevel: "2.10 mSv/h (β)",
          gammaLevel: "0.95 mSv/h (γ)",
          photonFlux: "6.2x10^6 MeV/cm²·s"
        }];
      }
      return [{
        id: "rad-gl-1",
        name: t("hzRadGale"),
        relX: 10,
        relY: -48,
        radius: 50,
        alphaLevel: "0.14 μSv/s (α)",
        betaLevel: "1.65 mSv/h (β)",
        gammaLevel: "0.82 mSv/h (γ)",
        photonFlux: "5.4x10^6 MeV/cm²·s"
      }];
    }
  }

  ns.HazardFieldService = HazardFieldService;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc cevresel tehlike ve radyasyon alani servis tanimi.
   - Satir 8-24: constructor ve setWorldviewData; siddet katsayi tablosunu ve NASA Worldview verisini tutar.
   - Satir 26-127: getGlobalHazardZones; Uydular panelindeki asit/firtina siddetine gore buyuyen kuresel tehlike ve foton bolgelerini doner.
   - Satir 129-172: getCraterRadiationZones; Gale, Jezero ve Korolev kraterleri icin Alfa/Beta/Gama ve Foton Bombardiman alanlarini dondurur.
   ========================================================================== */
