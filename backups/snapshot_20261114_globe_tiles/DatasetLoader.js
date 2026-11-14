/**
 * @file DatasetLoader.js
 * @description Proje içindeki indirilen NASA ve USGS JSON veri setlerini okuyan ve önbelleğe alan servis sınıfı.
 */

export class DatasetLoader {
  /**
   * DatasetLoader yapıcı metodu
   */
  constructor() {
    this.cache = new Map();
  }

  /**
   * Belirtilen JSON veri setini asenkron olarak yükler ve önbellekte tutar
   * @param {string} path - JSON dosyasının göreceli yolu
   * @returns {Promise<Object|null>} Yüklenen JSON nesnesi veya hata durumunda null
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
      console.warn(`[DatasetLoader] ${path} yüklenemedi:`, error.message);
      return null;
    }
  }

  /**
   * Perseverance ham görsel veri setinden son kareleri getirir
   * @param {number} limit - Döndürülecek maksimum görsel kaydı
   * @returns {Promise<Array>} Görsel metadata dizisi
   */
  async getPerseveranceSampleImages(limit = 3) {
    const data = await this.loadJson("./data/datasets/perseverance_raw_images.json");
    if (!data || !Array.isArray(data.images)) {
      return [];
    }
    return data.images.slice(0, limit);
  }

  /**
   * Çevresel tehlike (toz fırtınası ve asidik sis) verilerini döner
   * @returns {Promise<Object|null>} Tehlike verileri
   */
  async getEnvironmentalHazards() {
    return await this.loadJson("./data/datasets/nasa_worldview_and_hazards.json");
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc servis modülü tanıtımı.
   - Satır 6: DatasetLoader sınıfının dışa aktarılması.
   - Satır 7-12: constructor; tekrar eden ağ/dosya isteklerini önlemek için Map tabanlı önbellek (cache) başlatır.
   - Satır 14-35: loadJson metodu; fetch API kullanarak yerel JSON dosyasını okur, doğrular ve cache'e kaydeder.
   - Satır 37-47: getPerseveranceSampleImages metodu; indirilen NASA Perseverance Sol 2031 veri setinden örnek görsel kayıtlarını ayıklar.
   - Satır 49-55: getEnvironmentalHazards metodu; fırtına ve asidik tehlike koridorlarını döner.
   - Satır 56: DatasetLoader sınıfı sonu.
   ========================================================================== */
