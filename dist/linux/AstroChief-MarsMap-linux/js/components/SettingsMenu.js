/**
 * @file SettingsMenu.js
 * @description Kural Gereği Sol Üstte bulunan Ayarlar (⚙️) menüsü bileşeni.
 * Açıldığında İLK çıkan seçenek "Factory Reset" olur ve hemen altında ölçekli LOD render,
 * Litre / km-m / Saat parametreleri ve Alfa-Beta-Gama radyasyon ayarları yer alır.
 */

export class SettingsMenu {
  /**
   * SettingsMenu yapıcı metodu
   * @param {Object} callbacks - Factory Reset ve ayar güncelleme geri çağrıları
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.isOpen = false;
  }

  /**
   * Sol üst ayarlar ikonu ve Factory Reset + Factory parametrelerini içeren menüyü üretir
   */
  renderMarkup(state) {
    return `
      <div class="trek-settings-anchor" id="trek-settings-anchor">
        <button class="trek-icon-tile trek-settings-btn ${this.isOpen ? "active" : ""}" id="btn-top-left-settings" title="Ayarlar (İlk Seçenek: Factory Reset)">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>

        <div class="trek-settings-dropdown ${this.isOpen ? "open" : ""}" id="settings-dropdown-panel" role="menu" aria-label="Sistem Ayarları">
          <!-- ZORUNLU KURAL: Açıldığında İLK Çıkan Seçenek Factory Reset -->
          <button class="settings-item-primary-reset" id="btn-factory-reset" role="menuitem">
            <span class="reset-icon">↺</span>
            <span class="reset-text-wrap">
              <span class="reset-title">Factory Reset</span>
              <span class="reset-sub">Harita ölçeği, birimler ve radyasyon alanlarını sıfırla</span>
            </span>
          </button>

          <div class="settings-divider"></div>

          <!-- Factory Sistem Parametreleri Özeti (Litre / km-m / Saat / Alfa-Beta-Gama) -->
          <div class="settings-factory-specs">
            <div class="spec-head">FACTORY PARAMETRE STANDARTLARI</div>
            <div class="spec-line"><span>Hacim &amp; Rezerv:</span><strong>Litre (420 L O2 / 24 L Su)</strong></div>
            <div class="spec-line"><span>Mesafe &amp; Süre:</span><strong>km / m • Saat</strong></div>
            <div class="spec-line"><span>Işıma Düzeyi:</span><strong>Alfa (α) · Beta (β) · Gama (γ)</strong></div>
          </div>

          <div class="settings-divider"></div>

          <label class="settings-toggle-row">
            <span>Yaklaştıkça Render (Ölçekli LOD)</span>
            <input type="checkbox" id="set-lod-render" ${state.progressiveLodRender ? "checked" : ""} />
          </label>

          <label class="settings-toggle-row">
            <span>Alfa/Beta/Gama &amp; Foton Alanları</span>
            <input type="checkbox" id="set-rad-zones" ${state.showRadiationZones ? "checked" : ""} />
          </label>

          <div class="settings-control-group">
            <div class="settings-row-label">
              <span>3D Terrain Exaggeration</span>
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
            <span>Yıldız Arkaplanı (Starfield)</span>
            <input type="checkbox" id="set-starfield" ${state.showStarfield ? "checked" : ""} />
          </label>
        </div>
      </div>
    `;
  }

  /**
   * Menü düğmelerini olay dinleyicilerine bağlar
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

    document.getElementById("set-lod-render")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting("progressiveLodRender", e.target.checked);
    });

    document.getElementById("set-rad-zones")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting("showRadiationZones", e.target.checked);
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
   * Dış tıklamada ayarlar penceresini kapatır
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
   - Satır 1-6: JSDoc Sol Üst Ayarlar ve Factory Reset menüsü bileşeni tanıtımı.
   - Satır 8-15: SettingsMenu yapıcısı; menü durumu ve geri çağrıları saklar.
   - Satır 17-82: renderMarkup; açıldığında 1. sırada Factory Reset butonunu, altında Factory parametre standartlarını (Litre, km/m, Saat, Alfa/Beta/Gama), LOD render ve görünüm anahtarlarını oluşturur.
   - Satır 84-135: bindEvents; Factory Reset, ölçekli LOD, radyasyon alanları ve harita ayar düğmelerini bağlar.
   - Satır 137-145: close; dışarı tıklandığında menüyü gizler.
   ========================================================================== */
