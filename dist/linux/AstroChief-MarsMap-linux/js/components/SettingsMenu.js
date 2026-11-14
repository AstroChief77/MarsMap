/**
 * @file SettingsMenu.js
 * @description Tasarım Kuralları gereği Sol Üstte yer alan Ayarlar (⚙️) menüsü bileşeni.
 * Açıldığında çıkan İLK seçenek mutlaka "Factory Reset" (Fabrika Ayarlarına Sıfırla) olarak konumlanır.
 */

export class SettingsMenu {
  /**
   * SettingsMenu yapıcı metodu
   * @param {Object} callbacks - Ayar değişiklikleri ve factoryReset geri çağrıları
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.isOpen = false;
  }

  /**
   * Sol üst ayarlar ikonu ve açılır menü HTML şablonunu üretir
   * @param {Object} state - Mevcut viewer ayar durumu
   * @returns {string} HTML metni
   */
  renderMarkup(state) {
    return `
      <div class="trek-settings-anchor" id="trek-settings-anchor">
        <button class="trek-icon-tile trek-settings-btn ${this.isOpen ? "active" : ""}" id="btn-top-left-settings" title="Ayarlar (Factory Reset)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>

        <div class="trek-settings-dropdown ${this.isOpen ? "open" : ""}" id="settings-dropdown-panel" role="menu" aria-label="Sistem Ayarları">
          <!-- ZORUNLU KURAL: İlk Seçenek Her Zaman Factory Reset -->
          <button class="settings-item-primary-reset" id="btn-factory-reset" role="menuitem">
            <span class="reset-icon">↺</span>
            <span class="reset-text-wrap">
              <span class="reset-title">Factory Reset</span>
              <span class="reset-sub">Tüm filtreleri, kamerayı ve katmanları sıfırla</span>
            </span>
          </button>

          <div class="settings-divider"></div>

          <div class="settings-control-group">
            <div class="settings-row-label">
              <span>Terrain Exaggeration</span>
              <strong id="exag-readout">${state.terrainExaggeration.toFixed(1)}x</strong>
            </div>
            <input type="range" id="range-exaggeration" min="1" max="3" step="0.5" value="${state.terrainExaggeration}" />
          </div>

          <label class="settings-toggle-row">
            <span>Nomenclature (IAU Bölge İsimleri)</span>
            <input type="checkbox" id="set-nomenclature" ${state.showNomenclature ? "checked" : ""} />
          </label>

          <label class="settings-toggle-row">
            <span>Graticule (Enlem/Boylam Ağı)</span>
            <input type="checkbox" id="set-graticule" ${state.showGraticule ? "checked" : ""} />
          </label>

          <label class="settings-toggle-row">
            <span>Yıldız Simülasyonu (Starfield)</span>
            <input type="checkbox" id="set-starfield" ${state.showStarfield ? "checked" : ""} />
          </label>
        </div>
      </div>
    `;
  }

  /**
   * Ayarlar menüsü düğme ve seçenek olaylarını bağlar
   */
  bindEvents() {
    const btn = document.getElementById("btn-top-left-settings");
    const panel = document.getElementById("settings-dropdown-panel");

    btn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isOpen = !this.isOpen;
      btn.classList.toggle("active", this.isOpen);
      panel?.classList.toggle("open", this.isOpen);
    });

    panel?.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("btn-factory-reset")?.addEventListener("click", () => {
      this.isOpen = false;
      btn?.classList.remove("active");
      panel?.classList.remove("open");
      this.callbacks.onFactoryReset();
    });

    document.getElementById("range-exaggeration")?.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      const readout = document.getElementById("exag-readout");
      if (readout) readout.innerText = `${val.toFixed(1)}x`;
      this.callbacks.onChangeSetting("terrainExaggeration", val);
    });

    document.getElementById("set-nomenclature")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting("showNomenclature", e.target.checked);
    });

    document.getElementById("set-graticule")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting("showGraticule", e.target.checked);
    });

    document.getElementById("set-starfield")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting("showStarfield", e.target.checked);
    });
  }

  /**
   * Dış tıklamalarda menüyü kapatır
   */
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.getElementById("btn-top-left-settings")?.classList.remove("active");
    document.getElementById("settings-dropdown-panel")?.classList.remove("open");
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc Sol Üst Ayarlar ve Factory Reset bileşeni tanımı.
   - Satır 7-14: SettingsMenu yapıcısı; menü açıklık durumu ve geri çağrı nesnesini alır.
   - Satır 16-67: renderMarkup; sol üstteki beyaz kare ayarlar ikonu ve açıldığında en üstte "Factory Reset" barındıran açılır menüyü üretir.
   - Satır 69-108: bindEvents; Factory Reset butonu, Terrain Exaggeration sürgüsü, Nomenclature, Graticule ve Starfield anahtarlarını bağlar.
   - Satır 110-118: close; pencere dışına tıklandığında menüyü gizler.
   ========================================================================== */
