/**
 * @file StateStorageService.js
 * @description Uygulama ayarlarını saklayan ve Kural Gereği Factory Ayarlarını yöneten servis.
 * Factory ayarları: Ölçeğe bağlı (yaklaştıkça görünür alan) render, birimler (Litre, km/m, Saat)
 * ve Alfa/Beta/Gama radyasyon ile Foton Bombardıman alanları görünürlüğü içerir.
 */

export class StateStorageService {
  /**
   * StateStorageService yapıcı metodu
   */
  constructor() {
    this.storageKey = "astrochief_mars_navigator_v2";
  }

  /**
   * ZORUNLU FACTORY AYARLARI ŞABLONU:
   * - Harita ölçeği yaklaştıkça (LOD + görünür pencere kırpma) render edilir; tamamı render edilmez.
   * - Parametreler Litre (L), Kilometre/Metre (km/m), Saat (sa) ve Alfa/Beta/Gama + Foton alanlarını içerir.
   * @returns {Object} Fabrika çıkışı harita ve sistem ayarları
   */
  getFactoryDefaults() {
    return {
      activeCraterIndex: 0,
      mapScope: "globe",         // 'globe' (Mars Küre), 'global2d' (EPSG:104905), 'crater' (Hiper-yerel EVA)
      viewMode: "3d",            // '2d' veya '3d'
      filterAcidRain: true,
      filterDustStorm: true,
      progressiveLodRender: true, // Kural: Yalnızca yakınlaşılan/görünen alan render edilir (tamamı değil)
      showRadiationZones: true,   // Kural: Alfa, Beta, Gama ve Foton Bombardıman alanları açık
      terrainExaggeration: 1.0,
      basemapOpacity: 1.0,
      showNomenclature: true,
      showGraticule: false,
      showStarfield: true,
      oxygenReserveLiters: 420,  // Astronot Yaşam Destek (Litre)
      waterReserveLiters: 24.0,  // Suit Soğutma Suyu (Litre)
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
   * Kaydedilmiş ayarları yükler; yoksa veya bozuksa Factory ayarlarını döner
   * @returns {Object} Aktif ayarlar
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
      console.warn("[StateStorageService] Kayıtlı ayar okunamadı:", err.message);
      return defaults;
    }
  }

  /**
   * Kullanıcı tercihlerini kaydeder
   */
  saveState(stateSnapshot) {
    try {
      window.localStorage.setItem(this.storageKey, JSON.stringify(stateSnapshot));
    } catch (err) {
      console.warn("[StateStorageService] Kayıt hatası:", err.message);
    }
  }

  /**
   * FACTORY RESET: Tüm özelleştirmeleri temizler ve Factory ayarlarına döner
   * @returns {Object} Temiz Factory varsayılanları
   */
  factoryReset() {
    try {
      window.localStorage.removeItem(this.storageKey);
    } catch (err) {
      console.warn("[StateStorageService] Temizleme hatası:", err.message);
    }
    return this.getFactoryDefaults();
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-6: JSDoc Factory ayarları, LOD render ve birim standartları servisi tanıtımı.
   - Satır 8-14: constructor; localStorage kayıt anahtarını tanımlar.
   - Satır 16-43: getFactoryDefaults; harita ölçeği yaklaştıkça render etme (progressiveLodRender), Litre/km-m/Saat parametreleri ve Alfa/Beta/Gama + Foton Bombardıman alanları ayarlarını içerir.
   - Satır 45-61: loadState; tarayıcı belleğinden ayarları yükler, yoksa varsayılanı döner.
   - Satır 63-70: saveState; aktif ayarları kaydeder.
   - Satır 72-81: factoryReset; sol üst Ayarlar -> 1. seçenek olan Factory Reset işlemini yürütür.
   ========================================================================== */
