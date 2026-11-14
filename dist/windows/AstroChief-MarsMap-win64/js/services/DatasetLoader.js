/**
 * @file DatasetLoader.js
 * @description data/datasets/ altindaki NASA ve USGS JSON veri setlerini yukleyen servis sinifi.
 */

export class DatasetLoader {
  /**
   * DatasetLoader yapici metodu
   */
  constructor() {
    this.cache = new Map();
  }

  /**
   * Belirtilen yerel JSON veri setini okur ve onbellege alir
   * @param {string} path - JSON dosyasinin goreceli yolu
   * @returns {Promise<Object|null>} Yuklenen JSON nesnesi
   */
  async loadJson(path) {
    if (this.cache.has(path)) {
      return this.cache.get(path);
    }

    try {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`HTTP hata kodu: ${response.status}`);
      }
      const data = await response.json();
      this.cache.set(path, data);
      return data;
    } catch (error) {
      console.warn(`[DatasetLoader] ${path} yuklenemedi:`, error.message);
      return null;
    }
  }

  /**
   * JPL Mars Trek yerel karo (tile) katman katalogunu yukler
   * @returns {Promise<Object|null>} Karo katman listesi ve Mars sabitleri
   */
  async getTileLayersCatalog() {
    return await this.loadJson("./data/datasets/jpl_mars_trek_layers.json");
  }

  /**
   * NASA Mars inis sahalari veri setini getirir
   * @returns {Promise<Object|null>} Inis sahalari JSON nesnesi
   */
  async getLandingSites() {
    return await this.loadJson("./data/datasets/mars_landing_sites.json");
  }

  /**
   * Cevresel tehlike (toz firtinasi ve asidik risk bolgeleri) verilerini doner
   * @returns {Promise<Object|null>} Tehlike verileri
   */
  async getEnvironmentalHazards() {
    return await this.loadJson("./data/datasets/nasa_worldview_and_hazards.json");
  }

  /**
   * Perseverance ham gorsel veri setinden ornek kareleri getirir
   * @param {number} limit - Dondurulecek maksimum kayit sayisi
   * @returns {Promise<Array>} Gorsel metadata dizisi
   */
  async getPerseveranceSampleImages(limit = 3) {
    const data = await this.loadJson("./data/datasets/perseverance_raw_images.json");
    if (!data || !Array.isArray(data.images)) {
      return [];
    }
    return data.images.slice(0, limit);
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-4: JSDoc yerel veri seti okuyucu servis tanimi.
   - Satir 6-12: DatasetLoader constructor; tekrarli istekleri onlemek icin Map onbellegi baslatir.
   - Satir 14-36: loadJson; fetch API ile data/ altindaki JSON dosyalarini asenkron yukler.
   - Satir 38-58: getTileLayersCatalog, getLandingSites, getEnvironmentalHazards ve getPerseveranceSampleImages metodlari.
   ========================================================================== */
