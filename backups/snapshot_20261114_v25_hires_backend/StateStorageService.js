/**
 * @file StateStorageService.js
 * @description Uygulama ayarlarini saklayan ve Factory Reset standartlarini yoneten servis.
 * Factory ayarlari: Olcege bagli (yakinlastikca gorunur karo) LOD render, Litre / km-m / Saat
 * birimleri ve Alfa/Beta/Gama + Foton Bombardıman alanlarini icerir.
 */

export class StateStorageService {
  /**
   * StateStorageService yapici metodu
   */
  constructor() {
    this.storageKey = "astrochief_mars_globe_v24";
  }

  /**
   * ZORUNLU FACTORY AYARLARI SABLONU
   * @returns {Object} Varsayilan fabrika harita ayarlari
   */
  getFactoryDefaults() {
    return {
      activeLayerId: "mars-viking-mdim21",
      activeCraterIndex: 0,
      viewMode: "3d",             // '3d' Gezinebilen Kure | '2d' Duz Karolu Harita
      filterAcidRain: true,
      filterDustStorm: true,
      progressiveLodRender: true, // Yakinlastikca gorunur karolari data/tiles'dan yukle
      showRadiationZones: true,   // Alfa, Beta, Gama ve Foton alanlari
      showNomenclature: true,
      showGraticule: false,
      showStarfield: true,
      basemapOpacity: 1.0,
      rotLat: -4.59,
      rotLon: 137.44,
      zoom: 1.08,
      oxygenReserveLiters: 420,
      waterReserveLiters: 24.0
    };
  }

  /**
   * Kayitli ayarlari yukler, yoksa Factory varsayilanlarini doner
   */
  loadState() {
    const defaults = this.getFactoryDefaults();
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch (err) {
      console.warn("[StateStorageService] Ayar okunamadi:", err.message);
      return defaults;
    }
  }

  /**
   * Guncel ayarlari localStorage uzerine kaydeder
   */
  saveState(stateSnapshot) {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(stateSnapshot));
    } catch (err) {
      console.warn("[StateStorageService] Ayar kaydedilemedi:", err.message);
    }
  }

  /**
   * FACTORY RESET: Tum ayarlari sifirlar ve Factory varsayilanlarini geri yukler
   */
  factoryReset() {
    try {
      window.localStorage.removeItem(this.storageKey);
    } catch (err) {
      console.warn("[StateStorageService] Sifirlama hatasi:", err.message);
    }
    return this.getFactoryDefaults();
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc Factory ayarlari ve kalicilik servisi tanimi.
   - Satir 8-14: constructor; v2.4 yerel depo anahtarini tanimlar.
   - Satir 16-39: getFactoryDefaults; yerel karo katmani, LOD render, radyasyon ve birim standartlarini dondurur.
   - Satir 41-72: loadState, saveState ve factoryReset metodlari.
   ========================================================================== */
