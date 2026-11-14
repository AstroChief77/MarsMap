/**
 * @file HazardFieldService.js
 * @description NASA Worldview, USGS jeoloji ve kullanici Uydular panelinden secilen siddete gore
 * Asit Yagmuru, Kum Firtinasi/Kasirga ve Alfa/Beta/Gama Foton Bombardimani bolgelerini hesaplayan servis.
 */

import { AppConfig } from "../models/AppConfig.js";

export class HazardFieldService {
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
    const acidSpec = this.intensityTable.acid[options.acidIntensity || "orta"];
    const stormSpec = this.intensityTable.storm[options.stormIntensity || "orta"];

    // 1. Asit Yagmuru & Sulfat Sisi Bolgeleri (Tharsis, Cerberus Fossae, Gale-Elysium Koridoru)
    const acidZones = options.filterAcidRain ? [
      {
        id: "acid-cerberus",
        name: `Asit Yağmuru (${acidSpec.ph})`,
        lat: -6.5,
        lon: 112.0,
        radiusDeg: 13 * acidSpec.detourScale,
        intensity: acidSpec.label,
        ph: acidSpec.ph
      },
      {
        id: "acid-tharsis",
        name: `Volkanik Sülfat Sisi (${acidSpec.ph})`,
        lat: -4.0,
        lon: -98.0,
        radiusDeg: 15 * acidSpec.detourScale,
        intensity: acidSpec.label,
        ph: acidSpec.ph
      },
      {
        id: "acid-meridiani",
        name: `Asidik Evaporit Zonu (${acidSpec.ph})`,
        lat: -3.5,
        lon: 12.0,
        radiusDeg: 12 * acidSpec.detourScale,
        intensity: acidSpec.label,
        ph: acidSpec.ph
      }
    ] : [];

    // 2. Kum Firtinasi / Kasirga Koridorlari (Hellas, Acidalia-Chryse, Solis Planum, Isidis Kenari)
    const stormZones = options.filterDustStorm ? [
      {
        id: "storm-hellas",
        name: `Hellas Kasırgası (${stormSpec.tau})`,
        lat: -42.4,
        lon: 70.5,
        radiusDeg: 20 * stormSpec.detourScale,
        intensity: stormSpec.label,
        tau: stormSpec.tau
      },
      {
        id: "storm-isidis",
        name: `Syrtis-Isidis Toz Fırtınası (${stormSpec.tau})`,
        lat: 16.5,
        lon: 92.0,
        radiusDeg: 13 * stormSpec.detourScale,
        intensity: stormSpec.label,
        tau: stormSpec.tau
      },
      {
        id: "storm-acidalia",
        name: `Acidalia Cephe Fırtınası (${stormSpec.tau})`,
        lat: 35.0,
        lon: -35.0,
        radiusDeg: 16 * stormSpec.detourScale,
        intensity: stormSpec.label,
        tau: stormSpec.tau
      },
      {
        id: "storm-solis",
        name: `Solis Planum Toz Girdabı (${stormSpec.tau})`,
        lat: -26.0,
        lon: -90.0,
        radiusDeg: 14 * stormSpec.detourScale,
        intensity: stormSpec.label,
        tau: stormSpec.tau
      }
    ] : [];

    // 3. Alfa / Beta / Gama Radyasyon ve Foton Bombardiman Alanlari
    const radiationZones = options.showRadiationZones !== false ? [
      {
        id: "rad-global-equator",
        name: "Foton Bombardıman Kuşağı (α/β/γ)",
        lat: 13.0,
        lon: 48.0,
        radiusDeg: 14,
        alphaLevel: "0.14 μSv/s (Alfa α)",
        betaLevel: "1.65 mSv/h (Beta β)",
        gammaLevel: "0.82 mSv/h (Gama γ)",
        photonFlux: "5.4x10^6 MeV/cm²·s"
      },
      {
        id: "rad-global-polar",
        name: "Kutupsal Kozmik Gama Alanı",
        lat: 68.0,
        lon: 158.0,
        radiusDeg: 16,
        alphaLevel: "0.06 μSv/s (Alfa α)",
        betaLevel: "2.15 mSv/h (Beta β)",
        gammaLevel: "0.96 mSv/h (Gama γ)",
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
    if (craterId === "jezero-crater") {
      return [{
        id: "rad-jz-1",
        name: "Foton Bombardıman Alanı // Kuzey Delta",
        relX: 16,
        relY: -44,
        radius: 52,
        alphaLevel: "0.08 μSv/s (Alfa α)",
        betaLevel: "1.42 mSv/h (Beta β)",
        gammaLevel: "0.64 mSv/h (Gama γ)",
        photonFlux: "4.8x10^6 MeV/cm²·s"
      }];
    }
    if (craterId === "korolev-crater") {
      return [{
        id: "rad-kr-1",
        name: "Gama & Foton Bombardıman Kuşağı",
        relX: -40,
        relY: 36,
        radius: 56,
        alphaLevel: "0.04 μSv/s (Alfa α)",
        betaLevel: "2.10 mSv/h (Beta β)",
        gammaLevel: "0.95 mSv/h (Gama γ)",
        photonFlux: "6.2x10^6 MeV/cm²·s"
      }];
    }
    return [{
      id: "rad-gl-1",
      name: "Foton Bombardıman Alanı // Merkezi Eyer",
      relX: 10,
      relY: -48,
      radius: 50,
      alphaLevel: "0.14 μSv/s (Alfa α)",
      betaLevel: "1.65 mSv/h (Beta β)",
      gammaLevel: "0.82 mSv/h (Gama γ)",
      photonFlux: "5.4x10^6 MeV/cm²·s"
    }];
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc cevresel tehlike ve radyasyon alani servis tanimi.
   - Satir 8-24: constructor ve setWorldviewData; siddet katsayi tablosunu ve NASA Worldview verisini tutar.
   - Satir 26-127: getGlobalHazardZones; Uydular panelindeki asit/firtina siddetine gore buyuyen kuresel tehlike ve foton bolgelerini doner.
   - Satir 129-172: getCraterRadiationZones; Gale, Jezero ve Korolev kraterleri icin Alfa/Beta/Gama ve Foton Bombardiman alanlarini dondurur.
   ========================================================================== */
