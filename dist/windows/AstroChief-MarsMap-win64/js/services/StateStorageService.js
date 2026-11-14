/**
 * @file StateStorageService.js
 * @description Uygulama ayarlarını, aktif katmanları ve kamera durumunu yerel depolamada (localStorage) saklayan
 * ve Sol Üst Ayarlar menüsündeki "Factory Reset" işlemini yöneten servis sınıfı.
 */

export class StateStorageService {
  /**
   * StateStorageService yapıcı metodu
   */
  constructor() {
    this.storageKey = "astrochief_mars_navigator_v2";
  }

  /**
   * Varsayılan fabrika ayarları şablonunu döner
   * @returns {Object} Fabrika çıkışı harita ve arayüz ayarları
   */
  getFactoryDefaults() {
    return {
      activeCraterIndex: 0,
      mapScope: "globe", // 'globe' (Mars Trek 3D Küre), 'global2d' (EPSG:104905), 'crater' (Hiper-yerel EVA Krater)
      viewMode: "3d",    // '2d' veya '3d'
      filterAcidRain: true,
      filterDustStorm: true,
      terrainExaggeration: 1.0,
      basemapOpacity: 1.0,
      showNomenclature: true,
      showGraticule: false,
      showStarfield: true,
      layers: {
        optical: true,
        topography: true,
        thermal: false,
        geology: true,
        evaRoute: true
      }
    };
  }

  /**
   * Kaydedilmiş ayarları yükler; yoksa veya bozuksa fabrika varsayılanlarını döner
   * @returns {Object} Aktif durum ayarları
   */
  loadState() {
    const defaults = this.getFactoryDefaults();
    try {
      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return {
        ...defaults,
        ...parsed,
        layers: { ...defaults.layers, ...(parsed.layers || {}) }
      };
    } catch (err) {
      console.warn("[StateStorageService] Kayıtlı durum okunamadı:", err.message);
      return defaults;
    }
  }

  /**
   * Güncel kullanıcı tercihlerini yerel depolamaya kaydeder
   * @param {Object} stateSnapshot - Saklanacak durum özeti
   */
  saveState(stateSnapshot) {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(stateSnapshot));
    } catch (err) {
      console.warn("[StateStorageService] Durum kaydedilemedi:", err.message);
    }
  }

  /**
   * FACTORY RESET: Tüm kullanıcı tercihlerini temizler ve temiz fabrika ayarlarını döner
   * @returns {Object} Sıfırlanmış fabrika ayarları
   */
  factoryReset() {
    try {
      window.localStorage.removeItem(this.storageKey);
    } catch (err) {
      console.warn("[StateStorageService] Depolama temizleme hatası:", err.message);
    }
    return this.getFactoryDefaults();
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc depolama ve Factory Reset servis modülü açıklaması.
   - Satır 7: StateStorageService sınıfının dışa aktarılması.
   - Satır 8-13: constructor; localStorage anahtar adını belirler.
   - Satır 15-36: getFactoryDefaults; haritanın fabrika çıkışı görünüm, filtre, büyütme ve katman ayarlarını tanımlar.
   - Satır 38-53: loadState; tarayıcı hafızasından kayıtlı kullanıcı ayarlarını okur, hata halinde varsayılana döner.
   - Satır 55-64: saveState; aktif filtre ve katman tercihlerini kaydeder.
   - Satır 66-75: factoryReset; sol üst ayarlar menüsündeki ilk seçenek olan Fabrika Ayarlarına Sıfırlama işlevini gerçekleştirir.
   ========================================================================== */
