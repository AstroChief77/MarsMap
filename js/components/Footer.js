/**
 * @file Footer.js
 * @description Sayfa alt bilgi (footer) bileşeni sınıfı.
 */

export class Footer {
  /**
   * Footer yapıcı metodu
   * @param {string} containerId - Footer kapsayıcı element ID'si
   */
  constructor(containerId = "footer-container") {
    this.container = document.getElementById(containerId);
  }

  /**
   * Footer bileşenini başlatır ve ekrana basar
   */
  init() {
    if (!this.container) return;
    this.render();
  }

  /**
   * Footer HTML içeriğini üretir
   */
  render() {
    const currentYear = new Date().getFullYear();

    this.container.innerHTML = `
      <footer class="main-footer">
        <div class="footer-top">
          <div class="footer-brand">
            <div class="footer-logo">
              <span class="footer-logo-icon">🪐</span>
              <span class="footer-logo-text">Astro<span class="highlight">Chief</span></span>
            </div>
            <p class="footer-tagline">
              Gelişmiş Mars yüzey haritalandırma, rover rota analizi ve açık bilim veri entegrasyonu platformu.
            </p>
          </div>

          <div class="footer-links-group">
            <h4 class="footer-group-title">Gezinti</h4>
            <ul class="footer-links">
              <li><a href="#hero">Mission Home</a></li>
              <li><a href="#details">Details & Architecture</a></li>
              <li><a href="#resources">NASA Resources</a></li>
              <li><a href="#teams">Crew & Teams</a></li>
            </ul>
          </div>

          <div class="footer-links-group">
            <h4 class="footer-group-title">Resmi NASA Portalları</h4>
            <ul class="footer-links">
              <li><a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener noreferrer">JPL Mars Trek</a></li>
              <li><a href="https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars" target="_blank" rel="noopener noreferrer">USGS Planetary Mapping</a></li>
              <li><a href="https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" target="_blank" rel="noopener noreferrer">Curiosity Mount Sharp</a></li>
              <li><a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA Worldview</a></li>
              <li><a href="https://mars.nasa.gov/mars2020/multimedia/raw-images/" target="_blank" rel="noopener noreferrer">Perseverance Raw Images</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <div class="footer-compliance">
            <p class="compliance-text">
              <strong>NASA Yasal Bildirim:</strong> NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites.
            </p>
          </div>
          <div class="footer-copyright">
            <p>&copy; ${currentYear} AstroChief Mission Team. Tüm hakları saklıdır.</p>
            <p class="mission-status-badge">● Mission Status: ACTIVE</p>
          </div>
        </div>
      </footer>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc Footer modül tanımı.
   - Satır 6: Footer sınıfının dışa aktarılması.
   - Satır 7-10: constructor JSDoc açıklaması.
   - Satır 11-13: constructor metodu; containerId değerini saklar.
   - Satır 15-20: init metodu; bileşeni ekrana basar.
   - Satır 22-67: render metodu; marka logosu, hızlı menü linkleri, resmi portal linkleri ve NASA yasal uyarı metnini dinamik yıl ile birlikte DOM'a yazar.
   - Satır 68: Footer sınıfının sonu.
   ========================================================================== */
