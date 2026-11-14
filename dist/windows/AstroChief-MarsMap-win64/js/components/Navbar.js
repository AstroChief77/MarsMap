/**
 * @file Navbar.js
 * @description Google Maps tarzı sade kurumsal üst başlık (Header) bileşeni.
 * Zorunlu kural gereği sol en üstte Ayarlar ikonu (ilk seçenek Factory Reset) bulunur.
 */

import { SettingsMenu } from "./SettingsMenu.js";

export class Navbar {
  /**
   * Navbar yapıcı metodu
   * @param {string} containerId - Header kapsayıcı ID'si
   */
  constructor(containerId = "navbar-container") {
    this.container = document.getElementById(containerId);
    this.settingsMenu = null;
  }

  /**
   * Harita denetleyicisi ile bağ kurarak kurumsal Header'ı başlatır
   * @param {Object} callbacks - Factory reset, ayar değişimi, arama ve sidebar aç/kapa geri çağrıları
   * @param {Object} viewerState - Başlangıç ayar durumu
   */
  init(callbacks = {}, viewerState = { terrainExaggeration: 1, showNomenclature: true, showGraticule: false, showStarfield: true }) {
    if (!this.container) return;
    this.callbacks = callbacks;
    this.settingsMenu = new SettingsMenu({
      onFactoryReset: () => this.callbacks.onFactoryReset?.(),
      onChangeSetting: (k, v) => this.callbacks.onChangeSetting?.(k, v)
    });
    this.render(viewerState);
    this.bindEvents();
  }

  /**
   * Kurumsal beyaz-siyah-kırmızı üst Header HTML çıktısını oluşturur
   */
  render(viewerState) {
    this.container.innerHTML = `
      <header class="corp-header">
        <!-- SOL ÜST: Zorunlu Ayarlar Simgesi (1. Seçenek: Factory Reset) + Sidebar & Logo -->
        <div class="corp-header-left">
          ${this.settingsMenu.renderMarkup(viewerState)}

          <button class="corp-icon-btn" id="btn-header-sidebar-toggle" title="Kenar Çubuğunu Aç / Kapat" aria-label="Kenar Çubuğu">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2">
              <line x1="3" y1="6" x2="21" y2="6"></line>
              <line x1="3" y1="12" x2="21" y2="12"></line>
              <line x1="3" y1="18" x2="21" y2="18"></line>
            </svg>
          </button>

          <a href="#crater-viewer-section" class="corp-brand">
            <span class="corp-brand-mark"></span>
            <span class="corp-brand-name">AstroChief <span class="corp-brand-sub">Mars Map</span></span>
          </a>
        </div>

        <!-- ORTA: Sade Google Maps Arama Kutusu -->
        <div class="corp-header-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input type="text" id="header-crater-search" placeholder="Krater, bölge veya EVA durağı ara (Gale, Boxwork, Jezero)..." autocomplete="off" />
        </div>

        <!-- SAĞ: Kurumsal Bölüm Bağlantıları -->
        <nav class="corp-header-nav" aria-label="Ana Gezinti">
          <a href="#crater-viewer-section" class="corp-nav-link active">Harita</a>
          <a href="#details" class="corp-nav-link">Detaylar</a>
          <a href="#resources" class="corp-nav-link">NASA Verileri</a>
          <a href="#teams" class="corp-nav-link">Ekip</a>
          <a href="https://trek.nasa.gov/mars/" target="_blank" rel="noopener noreferrer" class="corp-external-btn">NASA Trek ↗</a>
        </nav>
      </header>
    `;

    this.settingsMenu.bindEvents();
  }

  /**
   * Header içi arama, kenar çubuğu ve dış tıklama olaylarını bağlar
   */
  bindEvents() {
    document.getElementById("btn-header-sidebar-toggle")?.addEventListener("click", () => {
      this.callbacks.onToggleSidebar?.();
    });

    document.getElementById("header-crater-search")?.addEventListener("input", (e) => {
      this.callbacks.onSearchQuery?.(e.target.value);
    });

    window.addEventListener("click", (e) => {
      if (!e.target.closest("#trek-settings-anchor")) {
        this.settingsMenu?.close();
      }
    });
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc kurumsal Google Maps tarzı Header modülü tanıtımı.
   - Satır 7: SettingsMenu bileşeninin içe aktarılması.
   - Satır 9-16: Navbar yapıcısı; kapsayıcı DOM elementini tanımlar.
   - Satır 18-30: init; ayar geri çağrılarıyla SettingsMenu ve Header'ı başlatır.
   - Satır 32-74: render; sol üstte Ayarlar (1. seçenek Factory Reset), menü açıcı, kurumsal logo, Google Maps arama çubuğu ve sağ bağlantıları çizer.
   - Satır 76-94: bindEvents; sidebar aç/kapa, canlı arama filtresi ve ayarlar menüsü kapanma olaylarını bağlar.
   ========================================================================== */
