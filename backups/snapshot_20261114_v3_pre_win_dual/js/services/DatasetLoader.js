/**
 * @file DatasetLoader.js
 * @description data/datasets/ altindaki NASA ve USGS JSON veri setlerini onbellekle yukleyen servis sinifi.
 */

export class DatasetLoader {
  /**
   * DatasetLoader yapici metodu
   */
  constructor() {
    this.cache = new Map();
  }

  /**
   * Yerel JSON dosyasini fetch ile okur ve Map onbellegine alir
   * @param {string} path - JSON dosyasinin goreceli yolu
   * @returns {Promise<Object|null>} Yuklenen JSON verisi
   */
  async loadJson(path) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }
    try {
      const res = await fetch(path);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      this.cache.set(path, json);
      return json;
    } catch (err) {
      console.warn(`[DatasetLoader] ${path} okunamadi:`, err.message);
      return null;
    }
  }

  async getTileLayersCatalog() {
    return this.loadJson("./data/datasets/jpl_mars_trek_layers.json");
  }

  async getLandingSites() {
    return this.loadJson("./data/datasets/mars_landing_sites.json");
  }

  async getEnvironmentalHazards() {
    return this.loadJson("./data/datasets/nasa_worldview_and_hazards.json");
  }

  async getGeologyData() {
    return this.loadJson("./data/datasets/usgs_mars_geology.json");
  }

  async getCuriosityRoute() {
    return this.loadJson("./data/datasets/curiosity_mount_sharp_route.json");
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-4: JSDoc yerel NASA/USGS JSON veri okuyucu tanimi.
   - Satir 6-12: constructor; tekrar eden istekleri engellemek icin Map onbellegi kurar.
   - Satir 14-31: loadJson; belirtilen veri setini asenkron okur ve saklar.
   - Satir 33-51: getTileLayersCatalog, getLandingSites, getEnvironmentalHazards, getGeologyData ve getCuriosityRoute metodlari.
   ========================================================================== */
