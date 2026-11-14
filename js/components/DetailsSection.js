/**
 * @file DetailsSection.js
 * @description NASA Space Apps Challenge 2026 "Interplanetary Survival Guide: Martian Map"
 * meydan okuması hedeflerini, krater seçim analizini ve astronot Marswalk mimarisini sunan bileşen.
 */

export class DetailsSection {
  /**
   * DetailsSection yapıcı metodu
   * @param {string} containerId - Bileşenin yerleştirileceği HTML ID
   */
  constructor(containerId = "details-container") {
    this.container = document.getElementById(containerId);
  }

  /**
   * Bileşeni başlatır ve ekrana basar
   */
  init() {
    if (!this.container) return;
    this.render();
  }

  /**
   * Details bölümünün %60 Beyaz, %30 Siyah, %10 Kırmızı HTML çıktısını üretir
   */
  render() {
    this.container.innerHTML = `
      <section id="details" class="section-details-dark">
        <div class="white-panel-wrapper">
          <div class="section-header-clean">
            <div class="challenge-event-badge">2026 NASA SPACE APPS CHALLENGE // INTERPLANETARY SURVIVAL GUIDE</div>
            <h2 class="clean-section-title">Martian Map &amp; Human Marswalk Navigator</h2>
            <p class="clean-section-subtitle">
              İlk astronotlar Mars'a ayak bastığında, küresel haritaların ötesinde; anlık yüzey eğimlerini, asidik sülfat/toz fırtınası risklerini, Boxwork katmanlarını ve yaşam destek marjlarını tek ekranda birleştiren hiper-yerel bir krater navigasyon aracına ihtiyaç duyacaktır.
            </p>
          </div>

          <!-- 3 Temel Meydan Okuma Sütunu -->
          <div class="challenge-pillars-grid">
            <div class="pillar-card">
              <div class="pillar-num">01</div>
              <h3 class="pillar-title">Çok Katmanlı Veri Entegrasyonu</h3>
              <p class="pillar-desc">
                JPL Mars Trek ve USGS harita verilerini krater ölçeğinde birleştiriyoruz: Optik (HiRISE/CTX), Topografik (MOLA DEM), Termal (THEMIS IR) ve Jeolojik katmanlar anlık olarak açılıp kapatılabilir.
              </p>
              <ul class="pillar-check-list">
                <li>MOLA sayısal yükseklik modeliyle eğim ve kontur çıkarımı</li>
                <li>THEMIS termal verisiyle kaya yoğunluğu analizi</li>
                <li>Perseverance &amp; Curiosity gerçek ham görselleriyle zemin teyidi</li>
              </ul>
            </div>

            <div class="pillar-card pillar-card-accent">
              <div class="pillar-num">02</div>
              <h3 class="pillar-title">Astronot Güvenliği &amp; Asit/Fırtına Filtreleri</h3>
              <p class="pillar-desc">
                Astronotlar ağır basınçlı giysilerle yürürken dik yamaçları, asidik sülfat koridorlarını ve bölgesel toz fırtınalarını gerçek zamanlı filtreleyerek en güvenli rotasyonu seçebilirler.
              </p>
              <ul class="pillar-check-list">
                <li>Sol altta anlık 2D / 3D perspektif geçişi ve tehlike filtreleri</li>
                <li>Asidik sülfat sisi (pH ~2.4) ve kum kasırgası (Tau 3.4) uyarısı</li>
                <li>Maksimum 25° güvenli tırmanış eğim sınırı kontrolü</li>
              </ul>
            </div>

            <div class="pillar-card">
              <div class="pillar-num">03</div>
              <h3 class="pillar-title">Boxwork Formasyonları &amp; Bilimsel Hedefler</h3>
              <p class="pillar-desc">
                NASA'nın 2025-2026 challenge metninde doğrudan referans verdiği üzere, Curiosity'nin Mount Sharp'ta incelediği 'Boxwork' mineral sırtları ve antik su deltaları ana hedefimizdir.
              </p>
              <ul class="pillar-check-list">
                <li>Yellowknife Bay ve Glen Torridon kil tabakası durakları</li>
                <li>Boxwork kutu şekilli mineral ağları (Challenge Odak Alanı)</li>
                <li>Jezero Three Forks numune deposu ve Neretva Deltası</li>
              </ul>
            </div>
          </div>

          <!-- Hangi Krater Seçilmeli? Karşılaştırma Tablosu -->
          <div class="crater-comparison-box">
            <h3 class="comp-title">🎯 Hangi Krater Seçilmeli? (Bilimsel &amp; Yarışma Analizi)</h3>
            <div class="comp-table-wrapper">
              <table class="comp-table">
                <thead>
                  <tr>
                    <th>Krater Adı</th>
                    <th>Bilimsel Odak &amp; Challenge Uyumu</th>
                    <th>Mevcut Veri Zenginliği</th>
                    <th>Astronot / EVA Riski</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="recommended-row">
                    <td><strong>Gale Krateri &amp; Mount Sharp</strong> <span class="badge-winner">1. ÖNERİLEN</span></td>
                    <td>Challenge metnindeki <strong>Boxwork oluşumları</strong> ve 5.5 km tırmanış rotası birebir buradadır. Asidik sülfat geçişi nettir.</td>
                    <td>12+ yıl Curiosity verisi, 4100+ Sol eğim, yükseklik ve mineral haritaları.</td>
                    <td>Orta-Yüksek (31° dik yamaçlar ve Bagnold kumulları rota planlamayı değerli kılar).</td>
                  </tr>
                  <tr>
                    <td><strong>Jezero Krateri &amp; Neretva Deltası</strong> <span class="badge-winner">2. ALTERNATİF</span></td>
                    <td>Antik nehir deltası, karbonatlar ve yaşam izi (biyoimza) arayışı.</td>
                    <td>1.05M+ canlı Perseverance ham fotoğrafı, numune deposu verileri.</td>
                    <td>Düşük-Orta (Delta yarları ve bölgesel toz şeytanları).</td>
                  </tr>
                  <tr>
                    <td><strong>Korolev Krateri</strong></td>
                    <td>1.8 km kalınlığında saf su buzu kalkanı (İnsanlı üs için ISRU su/yakıt kaynağı).</td>
                    <td>HRSC topoğrafik yükseklik ve radar buz kalınlığı verileri.</td>
                    <td>Çok Yüksek (-130°C kutup soğuğu ve kaygan buz yüzeyi).</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Görev Mimarisi ve HUD Vizyonu -->
          <div class="hud-format-box">
            <div class="hud-format-header">
              <span class="hud-terminal-prompt">&gt; ASTRONAUT HUD &amp; MISSION CONTROL ARCHITECTURE</span>
            </div>
            <div class="hud-format-body">
              <div class="format-item">
                <span class="format-tag">[HABITAT DISPLAY]</span>
                <p>Mürettebatın iniş modülünde veya yüzey habitatında rotayı planladığı merkezi harita ekranı.</p>
              </div>
              <div class="format-item">
                <span class="format-tag">[EVA TABLET &amp; ROVER]</span>
                <p>Basınçlı gezici araçta asit ve toz fırtınası filtreleriyle anlık takip edilen navigasyon tableti.</p>
              </div>
              <div class="format-item">
                <span class="format-tag">[HELMET VISOR HUD]</span>
                <p>Kask vizörüne yansıtılan anlık eğim, O2 rezervi, radyasyon dozu ve waypoint istikameti.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc Space Apps 2026 meydan okuma ve krater karşılaştırma bileşeni başlığı.
   - Satır 7: DetailsSection sınıfının dışa aktarılması.
   - Satır 8-15: constructor; hedef DOM kapsayıcı ID'sini saklar.
   - Satır 17-22: init metodu; bileşeni ekrana çizer.
   - Satır 24-134: render metodu; .white-panel-wrapper içinde Space Apps detayları, 3 temel sütun, Gale/Jezero/Korolev krater karşılaştırma tablosu ve HUD mimarisini oluşturur.
   - Satır 135: DetailsSection sınıfının sonu.
   ========================================================================== */
