/**
 * @file Navbar.js
 * @description Görev Kontrol üst navigasyon çubuğu ve hızlı geçiş menüsü.
 */

export class Navbar {
  /**
   * Navbar yapıcı metodu
   * @param {string} containerId - Navigasyonun yerleştirileceği kapsayıcı element ID'si
   */
  constructor(containerId = "navbar-container") {
    this.container = document.getElementById(containerId);
    this.isMenuOpen = false;
  }

  /**
   * Navigasyon bileşenini ekrana çizer ve dinleyicileri bağlar
   */
  init() {
    if (!this.container) return;
    this.render();
    this.attachEventListeners();
  }

  /**
   * Navigasyon HTML yapısını oluşturur
   */
  render() {
    this.container.innerHTML = `
      <nav class="main-navbar-clean">
        <div class="nav-brand-clean">
          <a href="#crater-viewer-section" class="brand-link-clean">
            <span class="brand-radar-icon">◎</span>
            <span class="brand-title-clean">ASTRO<span class="text-mars">CHIEF</span></span>
          </a>
          <span class="brand-sub-badge">EVA CRATER NAVIGATOR // 2026</span>
        </div>

        <button class="nav-toggle" id="nav-toggle" aria-label="Menüyü Aç/Kapat" aria-expanded="false">
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
        </button>

        <div class="nav-menu-clean" id="nav-menu">
          <ul class="nav-links-clean">
            <li><a href="#crater-viewer-section" class="nav-link-clean active">Crater Map</a></li>
            <li><a href="#details" class="nav-link-clean">Details &amp; Science</a></li>
            <li><a href="#resources" class="nav-link-clean">NASA Data</a></li>
            <li><a href="#teams" class="nav-link-clean">Flight Crew</a></li>
          </ul>
          <div class="nav-actions-clean">
            <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener noreferrer" class="btn-clean-action">
              <span>JPL Mars Trek ↗</span>
            </a>
          </div>
        </div>
      </nav>
    `;
  }

  /**
   * Navigasyon etkileşimleri için olay dinleyicileri tanımlar
   */
  attachEventListeners() {
    const toggleBtn = document.getElementById("nav-toggle");
    const navMenu = document.getElementById("nav-menu");

    if (toggleBtn && navMenu) {
      toggleBtn.addEventListener("click", () => {
        this.isMenuOpen = !this.isMenuOpen;
        toggleBtn.setAttribute("aria-expanded", String(this.isMenuOpen));
        navMenu.classList.toggle("is-open", this.isMenuOpen);
        toggleBtn.classList.toggle("is-active", this.isMenuOpen);
      });

      const links = navMenu.querySelectorAll(".nav-link-clean");
      links.forEach((link) => {
        link.addEventListener("click", () => {
          if (this.isMenuOpen) {
            this.isMenuOpen = false;
            toggleBtn.setAttribute("aria-expanded", "false");
            navMenu.classList.remove("is-open");
            toggleBtn.classList.remove("is-active");
          }
        });
      });
    }

    // Scroll anında navbar arkaplan opaklığını yönetir
    window.addEventListener("scroll", () => {
      const nav = this.container.querySelector(".main-navbar-clean");
      if (nav) {
        if (window.scrollY > 30) {
          nav.classList.add("scrolled-dark");
        } else {
          nav.classList.remove("scrolled-dark");
        }
      }
    });
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc Navbar modülü tanıtımı.
   - Satır 6: Navbar sınıfının dışa aktarımı.
   - Satır 7-15: constructor; hedef element ID'si ve menü durumunu saklar.
   - Satır 17-23: init metodu; render ve event atamasını yapar.
   - Satır 25-54: render metodu; temiz radar logolu marka başlığı, bağlantı linkleri ve JPL Mars Trek dış bağlantısını üretir.
   - Satır 56-94: attachEventListeners metodu; mobil menü açılış/kapanışı ve sayfa kaydırma anındaki opaklık efektini yönetir.
   - Satır 95: Navbar sınıfı sonu.
   ========================================================================== */
