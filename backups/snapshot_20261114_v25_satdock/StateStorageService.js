/**
 * @file StateStorageService.js
 * @description Uygulama ayarlarini, Factory Reset standartlarini ve Backend URL tercihini yoneten servis.
 * Factory ayarlari: Olcege bagli tam kalite tile LOD, Litre / km-m / Saat parametreleri ve
 * Alfa/Beta/Gama radyasyon alanlarini icerir.
 */

export class StateStorageService {
  /**
   * StateStorageService yapici metodu
   */
  constructor() {
    this.storageKey = "astrochief_mars_globe_v25";
  }

  /**
   * ZORUNLU FACTORY AYARLARI SABLONU
   * @returns {Object} Fabrika cikisi harita ve backend istemci ayarlari
   */
  getFactoryDefaults() {
    return {
      activeLayerId: "mars-viking-mdim21",
      activeCraterIndex: 0,
      viewMode: "3d",             // '3d' Tam Kalite Kure | '2d' Equirectangular Harita
      filterAcidRain: true,
      filterDustStorm: true,
      progressiveLodRender: true, // Yakinlastikca tam ekran pikselinde ust zoom (z=0..7)
      showRadiationZones: true,   // Alfa, Beta, Gama ve Foton Bombardiman alanlari
      showNomenclature: true,
      showGraticule: false,
      showStarfield: true,
      basemapOpacity: 1.0,
      rotLat: -4.59,
      rotLon: 137.44,
      zoom: 1.08,
      backendApiUrl: "",
      oxygenReserveLiters: 420,
      waterReserveLiters: 24.0
    };
  }

  loadState() {
    const defaults = this.getFactoryDefaults();
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return defaults;
      return { ...defaults, ...JSON.parse(raw) };
    } catch (err) {
      console.warn("[StateStorageService] Ayar okunamadi:", err.message);
      return defaults;
    }
  }

  saveState(stateSnapshot) {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(stateSnapshot));
    } catch (err) {
      console.warn("[StateStorageService] Ayar kaydedilemedi:", err.message);
    }
  }

  /**
   * FACTORY RESET: Tum ayarlari ve backend adresini fabrika degerlerine dondurur
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
   - Satir 1-6: JSDoc Factory ayarlari ve v2.5 depo servisi tanimi.
   - Satir 8-14: constructor; localStorage anahtarini ayarlar.
   - Satir 16-40: getFactoryDefaults; olcekli tam kalite LOD, Litre/km/Saat/Alfa-Beta-Gama ve backendApiUrl varsayilanlarini dondurur.
   - Satir 42-69: loadState, saveState ve factoryReset metodlari.
   ========================================================================== */
