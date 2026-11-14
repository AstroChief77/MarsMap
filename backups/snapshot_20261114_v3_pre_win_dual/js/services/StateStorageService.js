/**
 * @file StateStorageService.js
 * @description Kullanici harita ayarlarini saklayan ve Factory Reset islemini yoneten servis sinifi.
 */

import { AppConfig } from "../models/AppConfig.js";

export class StateStorageService {
  /**
   * StateStorageService yapici metodu
   * @param {AppConfig} config - Uygulama fabrika ayar yapilandirmasi
   */
  constructor(config = new AppConfig()) {
    this.config = config;
    this.storageKey = config.storageKey;
  }

  /**
   * Fabrika varsayilan ayar kopyasini dondurur (Default 2D harita + LOD + birimler)
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
      return { ...defaults, ...parsed };
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

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc kalicilik ve Factory Reset servisi aciklamasi.
   - Satir 8-17: constructor; AppConfig uzerinden v3 depo anahtarini alir.
   - Satir 19-24: getFactoryDefaults; default 2D gorunum ve fabrika birimlerini saglar.
   - Satir 26-39: loadState; localStorage icinden ayar yukler veya fabrika durumunu doner.
   - Satir 41-50: saveState; degisen harita ve filtre ayarlarini diske yazar.
   - Satir 52-63: factoryReset; depo kaydini siler ve fabrika standartlarina doner.
   ========================================================================== */
