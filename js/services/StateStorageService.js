/**
 * @file StateStorageService.js
 * @description Kullanici harita ayarlarini saklayan ve Factory Reset islemini yoneten servis sinifi.
 */

(function (ns) {
  "use strict";
  const { AppConfig } = ns;

  class StateStorageService {
    /**
     * StateStorageService yapici metodu
     * @param {AppConfig} config - Uygulama fabrika ayar yapilandirmasi
     */
    constructor(config = new AppConfig()) {
      this.config = config;
      this.storageKey = config.storageKey;
    }

    /**
     * Fabrika varsayilan ayar kopyasini dondurur (Default 3D harita + LOD + birimler)
     * @returns {Object} Fabrika ayarlari nesnesi
     */
    getFactoryDefaults() {
      return this.config.getFactoryDefaults();
    }

    /**
     * Kayitli durumu localStorage'dan okur; kayit yoksa fabrika varsayilanlarini doner
     * @returns {Object} Gecerli uygulama durumu
     */
    loadState() {
      const defaults = this.getFactoryDefaults();
      try {
        const raw = window.localStorage.getItem(this.storageKey);
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        const merged = { ...defaults, ...parsed };
        const hasO2 = Number(merged.oxygenReserveLiters) > 0;
        const hasEnergy = Number(merged.energyReserveKwh) > 0;
        const hasSpeed = Number(merged.targetSpeedKmH) > 0;
        if (!hasO2 || !hasEnergy || !hasSpeed) {
          merged.missionParamsConfirmed = false;
        }
        if (merged.expeditionMode !== "joint-eva-escort") {
          merged.expeditionMode = "rover-crew";
        }
        return merged;
      } catch (err) {
        console.warn("[StateStorageService] Durum okunamadi:", err.message);
        return defaults;
      }
    }

    /**
     * Guncel durumu localStorage uzerine kaydeder
     * @param {Object} stateSnapshot - Kaydedilecek ayar nesnesi
     */
    saveState(stateSnapshot) {
      try {
        window.localStorage.setItem(this.storageKey, JSON.stringify(stateSnapshot));
      } catch (err) {
        console.warn("[StateStorageService] Durum kaydedilemedi:", err.message);
      }
    }

    /**
     * FACTORY RESET: Kayitli veriyi temizleyip zorunlu Fabrika Ayarlarini geri yukler
     * @returns {Object} Fabrika varsayilanlari
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

  ns.StateStorageService = StateStorageService;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc kalicilik ve Factory Reset servisi aciklamasi.
   - Satir 8-19: constructor; AppConfig uzerinden v4.4 depo anahtarini alir.
   - Satir 21-26: getFactoryDefaults; default 3D gorunum ve fabrika birimlerini saglar.
   - Satir 28-56: loadState; localStorage icinden ayar yukler ve zorunlu O2/Enerji/Su parametre kapisi kontrolunu uygular.
   - Satir 58-67: saveState; degisen harita ve filtre ayarlarini diske yazar.
   - Satir 69-82: factoryReset; depo kaydini siler ve fabrika standartlarina doner.
   ========================================================================== */
