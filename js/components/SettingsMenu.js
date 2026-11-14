/**
 * @file SettingsMenu.js
 * @description Sol ust kosede bulunan Ayarlar menusu bileseni (Navbar olmadan yuzer konumda).
 * Acildiginda ILK secenek "Factory Reset" olur; altinda olcekli LOD karo yukleme,
 * Litre / km-m / Saat ve Alfa-Beta-Gama radyasyon parametreleri yer alir.
 */

export class SettingsMenu {
  /**
   * SettingsMenu yapici metodu
   * @param {Object} callbacks - Factory Reset ve ayar degisikligi callback'leri
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.isOpen = false;
  }

  /**
   * Sol ust ayarlar dugmesi ve acilir Factory menu HTML ciktisini uretir
   */
  renderMarkup(state) {
    return `
      <div class="globe-settings-anchor" id="trek-settings-anchor">
        <button class="globe-icon-btn ${this.isOpen ? "active" : ""}" id="btn-top-left-settings" title="Ayarlar (İlk Seçenek: Factory Reset)" aria-label="Ayarlar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>

        <div class="globe-settings-dropdown ${this.isOpen ? "open" : ""}" id="settings-dropdown-panel" role="menu" aria-label="Sistem Ayarları">
          <!-- ZORUNLU KURAL: Acildiginda ILK Cikan Secenek Factory Reset -->
          <button class="settings-item-primary-reset" id="btn-factory-reset" role="menuitem">
            <span class="reset-icon">↺</span>
            <span class="reset-text-wrap">
              <span class="reset-title">Factory Reset</span>
              <span class="reset-sub">Ölçekli tile LOD, birimler ve küreyi sıfırla</span>
            </span>
          </button>

          <div class="settings-divider"></div>

          <div class="settings-factory-specs">
            <div class="spec-head">FACTORY PARAMETRE STANDARTLARI</div>
            <div class="spec-line"><span>Hacim &amp; Rezerv:</span><strong>Litre (${state.oxygenReserveLiters} L O2 / ${state.waterReserveLiters} L Su)</strong></div>
            <div class="spec-line"><span>Ölçek &amp; Süre:</span><strong>km / m · Saat</strong></div>
            <div class="spec-line"><span>Işıma Düzeyi:</span><strong>Alfa (α) · Beta (β) · Gama (γ)</strong></div>
          </div>

          <div class="settings-divider"></div>

          <label class="settings-toggle-row">
            <span>Yaklaştıkça Karo Yükle (LOD)</span>
            <input type="checkbox" id="set-lod-render" ${state.progressiveLodRender ? "checked" : ""} />
          </label>

          <label class="settings-toggle-row">
            <span>Alfa/Beta/Gama &amp; Foton Alanları</span>
            <input type="checkbox" id="set-rad-zones" ${state.showRadiationZones ? "checked" : ""} />
          </label>

          <label class="settings-toggle-row">
            <span>Bölge İsimleri (Nomenclature)</span>
            <input type="checkbox" id="set-nomenclature" ${state.showNomenclature ? "checked" : ""} />
          </label>

          <label class="settings-toggle-row">
            <span>Enlem/Boylam Ağı (Graticule)</span>
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
      this.callbacks.onFactoryReset?.();
    });

    document.getElementById("set-lod-render")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting?.("progressiveLodRender", e.target.checked);
    });
    document.getElementById("set-rad-zones")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting?.("showRadiationZones", e.target.checked);
    });
    document.getElementById("set-nomenclature")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting?.("showNomenclature", e.target.checked);
    });
    document.getElementById("set-graticule")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting?.("showGraticule", e.target.checked);
    });
    document.getElementById("set-starfield")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting?.("showStarfield", e.target.checked);
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.getElementById("btn-top-left-settings")?.classList.remove("active");
    document.getElementById("settings-dropdown-panel")?.classList.remove("open");
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc Navbar'siz yuzer sol-ust Ayarlar menusu tanimi.
   - Satir 8-16: SettingsMenu constructor.
   - Satir 18-81: renderMarkup; 1. secenek Factory Reset butonu, Factory birim standartlari (Litre, km/m, Saat, Alfa/Beta/Gama) ve kure gorunum anahtarlarini uretir.
   - Satir 83-122: bindEvents ve close; ayar degisikliklerini MarsGlobeViewer'a iletir.
   ========================================================================== */
