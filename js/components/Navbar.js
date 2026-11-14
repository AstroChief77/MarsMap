/**
 * @file Navbar.js
 * @description Üst navigasyon çubuğunu ve mobil menü etkileşimini yöneten sınıf.
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
      <nav class="main-navbar">
        <div class="nav-brand">
          <a href="#hero" class="brand-link">
            <span class="brand-logo-icon">🪐</span>
            <span class="brand-text">Astro<span class="highlight">Chief</span></span>
          </a>
          <span class="brand-subtext">Mars Exploration Initiative</span>
        </div>

        <button class="nav-toggle" id="nav-toggle" aria-label="Menüyü Aç/Kapat" aria-expanded="false">
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
          <span class="hamburger-bar"></span>
        </button>

        <div class="nav-menu" id="nav-menu">
          <ul class="nav-links">
            <li><a href="#details" class="nav-link">Details</a></li>
            <li><a href="#resources" class="nav-link">Resources</a></li>
            <li><a href="#teams" class="nav-link">Teams</a></li>
          </ul>
          <div class="nav-actions">
            <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener noreferrer" class="btn-nav-action">
              <span>Mars Trek</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M7 17l9.2-9.2M17 17V7H7"/>
              </svg>
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

      // Menü linkine tıklandığında mobil menüyü otomatik kapat
      const links = navMenu.querySelectorAll(".nav-link");
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

    // Scroll anında navbar stilini güncelleme
    window.addEventListener("scroll", () => {
      const nav = this.container.querySelector(".main-navbar");
      if (nav) {
        if (window.scrollY > 40) {
          nav.classList.add("scrolled");
        } else {
          nav.classList.remove("scrolled");
        }
      }
    });
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc Navbar modülü açıklaması.
   - Satır 6: Navbar sınıfının dışa aktarımı.
   - Satır 7-10: constructor JSDoc açıklaması.
   - Satır 11-14: Hedef kapsayıcı DOM elementini seçer ve menü durumunu (isMenuOpen) başlatır.
   - Satır 16-23: init metodu; DOM'a render edip event dinleyicilerini tetikler.
   - Satır 25-58: render metodu; logo, menü linkleri (Details, Resources, Teams) ve CTA butonunu oluşturur.
   - Satır 60-98: attachEventListeners metodu; mobil menü toggle işlemi, link tıklama kapanışı ve sayfa kaydırma (scroll) efektini yönetir.
   - Satır 99: Navbar sınıfı sonu.
   ========================================================================== */
