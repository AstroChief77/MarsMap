/**
 * @file DetailsSection.js
 * @description Proje detayları (Details), görev hedefleri ve mimarisini render eden sınıf.
 */

export class DetailsSection {
  /**
   * DetailsSection yapıcı metodu
   * @param {string} containerId - Bileşenin yerleştirileceği hedef element ID'si
   */
  constructor(containerId = "details-container") {
    this.container = document.getElementById(containerId);
  }

  /**
   * Bileşeni başlatır ve DOM'a yansıtır
   */
  init() {
    if (!this.container) return;
    this.render();
  }

  /**
   * Details bölümünün HTML yapısını oluşturur
   */
  render() {
    this.container.innerHTML = `
      <section id="details" class="section-details">
        <div class="section-header">
          <div class="section-badge">Mission Scope</div>
          <h2 class="section-title">Mission Details & Architecture</h2>
          <p class="section-subtitle">
            AstroChief projesi, Mars yüzey keşif verilerini, jeolojik haritaları ve gezici rotalarını bir araya getirerek derinlemesine gezegensel analiz sunan yeni nesil bir araştırma ve operasyon portalıdır.
          </p>
        </div>

        <div class="details-grid">
          <!-- Detay Kartı 1: Keşif & Veri Entegrasyonu -->
          <div class="detail-card">
            <div class="detail-card-icon">🚀</div>
            <h3 class="detail-card-title">Gezegen Yüzeyi Keşfi</h3>
            <p class="detail-card-desc">
              NASA JPL Mars Trek ve Perseverance verileri temel alınarak iniş sahaları, kraterler ve yüzey morfolojisi çok katmanlı olarak incelenir.
            </p>
            <ul class="detail-list">
              <li>Jezero Krateri ve Gale Krateri odaklı saha analizi</li>
              <li>Topoğrafik yükseklik ve eğim haritalandırması</li>
              <li>Sıcaklık ve atmosferik toz fırtınası korelasyonu</li>
            </ul>
          </div>

          <!-- Detay Kartı 2: Jeolojik Katmanlar & Haritalama -->
          <div class="detail-card highlight-card">
            <div class="detail-card-icon">🗺️</div>
            <h3 class="detail-card-title">USGS Jeolojik Haritalama</h3>
            <p class="detail-card-desc">
              Standartlaştırılmış jeolojik katmanlar ve mineral dağılımları USGS-NASA Geologic Mapping Program standartlarına göre modellenir.
            </p>
            <ul class="detail-list">
              <li>Noachian, Hesperian ve Amazonian dönem katmanları</li>
              <li>Hidrasyon mineralleri ve kil tabakası tespiti</li>
              <li>Spektral veri katmanları ile interaktif analiz</li>
            </ul>
          </div>

          <!-- Detay Kartı 3: Gezici (Rover) Rota Optimizasyonu -->
          <div class="detail-card">
            <div class="detail-card-icon">🚜</div>
            <h3 class="detail-card-title">Rover Rota & Tırmanış Planı</h3>
            <p class="detail-card-desc">
              Curiosity'nin Mount Sharp tırmanış modeli örnek alınarak, geziciler için eğim, enerji verimliliği ve bilimsel hedeflere göre rotalar görselleştirilir.
            </p>
            <ul class="detail-list">
              <li>Eğim ve zemin sertliği bazlı yol tahmini</li>
              <li>Otonom sürüş ve numune alma noktası işaretleme</li>
              <li>Flyover simülasyonları ve 3D rota projeksiyonu</li>
            </ul>
          </div>
        </div>

        <!-- Görev İstatistikleri ve Önemli Veriler Şeridi -->
        <div class="mission-metrics-strip">
          <div class="metric-item">
            <span class="metric-value">1,000,000+</span>
            <span class="metric-label">Perseverance Ham Görsel</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">5.5 km</span>
            <span class="metric-label">Mount Sharp Tırmanış İrtifası</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">3D Trek</span>
            <span class="metric-label">JPL İnteraktif Yüzey Modeli</span>
          </div>
          <div class="metric-item">
            <span class="metric-value">100% NASA</span>
            <span class="metric-label">Açık Veri & Bilimsel Standart</span>
          </div>
        </div>
      </section>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc sınıf tanıtımı ve modül bilgisi.
   - Satır 6: DetailsSection sınıfının export edilmesi.
   - Satır 7-10: constructor dokümantasyonu.
   - Satır 11-13: constructor, kapsayıcı DOM ID'sini saklar.
   - Satır 15-20: init metodu, elemanın varlığını kontrol edip render'ı çağırır.
   - Satır 22-89: render metodu; başlık, 3 temel görev sütun kartı ve istatistik şeridini (metrics strip) DOM'a yazar.
   - Satır 90: DetailsSection sınıfının bitişi.
   ========================================================================== */
