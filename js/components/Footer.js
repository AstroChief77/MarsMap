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
      <footer class="main-footer-clean">
        <div class="footer-top-clean">
          <div class="footer-brand-clean">
            <div class="footer-logo-clean">
              <span class="radar">◎</span>
              <span>Astro<span class="text-mars">Chief</span></span>
            </div>
            <p class="footer-desc-clean">
              2026 NASA Space Apps Challenge — "Interplanetary Survival Guide: Martian Map" için geliştirilmiş astronot Mars yürüyüşü ve krater navigasyon portalı.
            </p>
          </div>

          <div class="footer-col-clean">
            <h4 class="footer-col-title">GEZİNTİ</h4>
            <ul class="footer-list-clean">
              <li><a href="#crater-viewer-section">Crater Explorer Map</a></li>
              <li><a href="#details">Challenge Details &amp; Science</a></li>
              <li><a href="#resources">NASA Repositories</a></li>
              <li><a href="#teams">Flight Crew</a></li>
            </ul>
          </div>

          <div class="footer-col-clean">
            <h4 class="footer-col-title">RESMİ NASA PORTALLARI</h4>
            <ul class="footer-list-clean">
              <li><a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener noreferrer">JPL Mars Trek ↗</a></li>
              <li><a href="https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars" target="_blank" rel="noopener noreferrer">USGS Planetary Mapping ↗</a></li>
              <li><a href="https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" target="_blank" rel="noopener noreferrer">Curiosity Mount Sharp ↗</a></li>
              <li><a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noopener noreferrer">NASA Worldview ↗</a></li>
              <li><a href="https://mars.nasa.gov/mars2020/multimedia/raw-images/" target="_blank" rel="noopener noreferrer">Perseverance Raw Images ↗</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom-clean">
          <div class="footer-disclaimer-clean">
            <p><strong>NASA Yasal Bildirim:</strong> NASA does not endorse any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. For non-U.S. Government websites, participants must comply with any data use parameters of that specific website.</p>
          </div>
          <div class="footer-credits-row">
            <p>&copy; ${currentYear} AstroChief Mission Team // NASA Space Apps Challenge</p>
            <span class="active-telemetry-badge">● ORBITER RELAY TELEMETRY: ACTIVE (100%)</span>
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
   - Satır 7-14: constructor; kapsayıcı ID'sini saklar.
   - Satır 16-21: init metodu; bileşeni ekrana basar.
   - Satır 23-66: render metodu; marka logosu, hızlı menü linkleri, resmi NASA bağlantıları ve yasal uyarı metnini DOM'a yazar.
   - Satır 67: Footer sınıfı sonu.
   ========================================================================== */
