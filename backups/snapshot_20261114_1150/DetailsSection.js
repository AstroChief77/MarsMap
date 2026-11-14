/**
 * @file DetailsSection.js
 * @description NASA Space Apps Challenge 2026 "Interplanetary Survival Guide: Martian Map"
 * meydan okuması hedeflerini, bilimsel kapsamını ve astronot Marswalk güvenlik parametrelerini açıklayan bileşen.
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
   * Details bölümünün HTML çıktısını üretir
   */
  render() {
    this.container.innerHTML = `
      <section id="details" class="section-details-dark">
        <div class="section-header-clean">
          <div class="challenge-event-badge">2026 NASA SPACE APPS CHALLENGE // INTERPLANETARY SURVIVAL GUIDE</div>
          <h2 class="clean-section-title">Martian Map & Human Marswalk Navigator</h2>
          <p class="clean-section-subtitle">
            İlk astronotlar Mars'a ayak bastığında, regional küresel haritaların ötesinde; anlık yüzey eğimlerini, atmosferik toz risklerini, jeolojik Boxwork katmanlarını ve yaşam destek marjlarını tek ekranda birleştiren yüksek çözünürlüklü bir navigasyon aracına ihtiyaç duyacaktır.
          </p>
        </div>

        <!-- 3 Temel Meydan Okuma Sütunu (Challenge Pillars) -->
        <div class="challenge-pillars-grid">
          <div class="pillar-card">
            <div class="pillar-num">01</div>
            <h3 class="pillar-title">Çok Katmanlı Veri Entegrasyonu</h3>
            <p class="pillar-desc">
              NASA JPL Mars Trek ve USGS haritalama verilerini hiper-yerel (krater ölçeğinde) birleştiriyoruz: Optik (HiRISE), Topografik (MOLA DEM), Termal (THEMIS IR) ve jeolojik katmanlar astronotun emrinde.
            </p>
            <ul class="pillar-check-list">
              <li>MOLA sayısal yükseklik modeliyle eğim ve kontur çıkarımı</li>
              <li>THEMIS termal verisiyle yüzey kaya bolluğu tahmini</li>
              <li>Perseverance ve Curiosity gerçek ham görselleriyle zemin doğrulaması</li>
            </ul>
          </div>

          <div class="pillar-card pillar-card-accent">
            <div class="pillar-num">02</div>
            <h3 class="pillar-title">Astronot Güvenliği & Hareket Kabiliyeti</h3>
            <p class="pillar-desc">
              Astronotlar ağır basınçlı uzay giysileriyle (spacesuit) yürüyecek ve numune taşıyacaktır. Rota motorumuz dik yamaçları, tekerlek batma riskini ve toz fırtınası koridorlarını gerçek zamanlı hesaplar.
            </p>
            <ul class="pillar-check-list">
              <li>Maksimum 25° güvenli tırmanış eğim sınırı kontrolü</li>
              <li>Bagnold kumulları gibi yumuşak regolit tuzaklarından kaçınma</li>
              <li>Uzay radyasyonu ve mevsimsel fırtına optik derinliği (Tau) izleme</li>
            </ul>
          </div>

          <div class="pillar-card">
            <div class="pillar-num">03</div>
            <h3 class="pillar-title">Boxwork Formasyonları & Bilimsel Hedefler</h3>
            <p class="pillar-desc">
              NASA'nın 2025-2026 meydan okumasında belirttiği üzere, Curiosity'nin Mount Sharp'ta incelediği 'Boxwork' mineral sırtları ve antik yaşanabilir göllerden asidik sülfat çölüne geçiş katmanları keşif rotamızın kalbindedir.
            </p>
            <ul class="pillar-check-list">
              <li>Yellowknife Bay ve Glen Torridon smektit kili istasyonları</li>
              <li>Vera Rubin Ridge hematit demir oksit damarları</li>
              <li>Gediz Vallis moloz seli ve antik su kanalları</li>
            </ul>
          </div>
        </div>

        <!-- Görev Mimarisi ve Format Vizyonu -->
        <div class="hud-format-box">
          <div class="hud-format-header">
            <span class="hud-terminal-prompt">&gt; ASTRONAUT HUD &amp; MISSION CONTROL ARCHITECTURE</span>
          </div>
          <div class="hud-format-body">
            <div class="format-item">
              <span class="format-tag">[HABITAT DISPLAY]</span>
              <p>Mürettebatın iniş modülünde veya yüzey habitatında rotayı planladığı büyük harita çalışma ekranı.</p>
            </div>
            <div class="format-item">
              <span class="format-tag">[EVA TABLET &amp; ROVER]</span>
              <p>Basınçlı gezici araçta (Pressurized Rover) sürücünün ve astronotun gerçek zamanlı takip ettiği telemetri arayüzü.</p>
            </div>
            <div class="format-item">
              <span class="format-tag">[HELMET VISOR HUD]</span>
              <p>Astronot kask vizörüne yansıtılan anlık eğim, O2 marjı ve bir sonraki waypoint istikameti göstergeleri.</p>
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
   - Satır 1-5: JSDoc Space Apps 2026 meydan okuma bilgisi ve dosya başlığı.
   - Satır 7: DetailsSection sınıfının export edilmesi.
   - Satır 8-15: constructor; hedef DOM konteyner ID'sini saklar.
   - Satır 17-22: init metodu; bileşeni ekrana çizer.
   - Satır 24-95: render metodu; yarışma başlığı, 3 temel sütun (Çok katmanlı entegrasyon, astronot güvenliği/hareket kabiliyeti, Boxwork bilimsel hedefleri) ve Habitat/HUD format vizyon kutusunu DOM'a yazar.
   - Satır 96: DetailsSection sınıfı sonu.
   ========================================================================== */
