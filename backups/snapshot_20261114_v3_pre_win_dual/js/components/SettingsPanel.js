/**
 * @file SettingsPanel.js
 * @description Sol ust Ayarlar simgesi, ilk secenegi ZORUNLU "Factory Reset" olan menu
 * ve kisa hedef secim seridi (Genel Mars, Gale, Jezero, Korolev, Bilgi) bileseni.
 */

export class SettingsPanel {
  /**
   * SettingsPanel yapici metodu
   * @param {HTMLElement} mountEl - #top-left-dock elemani
   * @param {Object} handlers - Olay geri cagirilari
   */
  constructor(mountEl, handlers) {
    this.mountEl = mountEl;
    this.handlers = handlers;
    this.isOpen = false;
  }

  toggleOpen(forceState) {
    this.isOpen = typeof forceState === "boolean" ? forceState : !this.isOpen;
    this.mountEl.querySelector("#btn-settings")?.classList.toggle("active", this.isOpen);
    this.mountEl.querySelector("#settings-dropdown")?.classList.toggle("open", this.isOpen);
  }

  close() {
    if (!this.isOpen) return;
    this.toggleOpen(false);
  }

  /**
   * Sol ust Ayarlar + Factory Reset + Hedef Seridini DOM'a cizer
   */
  render(state, craters) {
    if (!this.mountEl) return;

    const craterButtons = craters.map((c) => {
      const short = c.id === "gale-crater" ? "★ Gale" : (c.id === "jezero-crater" ? "Jezero" : "Korolev");
      const active = state.routeScope === "crater" && state.activeCraterId === c.id;
      return `<button class="nav-target-btn ${active ? "active" : ""}" data-crater-nav="${c.id}">${short}</button>`;
    }).join("");

    this.mountEl.innerHTML = `
      <div class="settings-anchor" id="settings-anchor">
        <button class="icon-square-btn ${this.isOpen ? "active" : ""}" id="btn-settings" title="Ayarlar (1. Seçenek: Factory Reset)" aria-label="Ayarlar">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>

        <div class="settings-dropdown ${this.isOpen ? "open" : ""}" id="settings-dropdown" role="menu">
          <!-- ZORUNLU KURAL: Acildiginda ilk secenek Factory Reset -->
          <button class="btn-factory-reset" id="btn-factory-reset" role="menuitem">
            <span class="reset-glyph">↺</span>
            <span>
              <span class="reset-title">Factory Reset</span>
              <span class="reset-sub">2D Varsayılan, Ölçekli LOD ve Birimleri Sıfırla</span>
            </span>
          </button>

          <div class="settings-sep"></div>

          <div class="factory-spec-box">
            <div class="factory-spec-title">FACTORY AYAR STANDARTLARI</div>
            <div class="factory-spec-row"><span>Render Ölçeği:</span><strong>Yaklaştıkça LOD (Görünür Alan)</strong></div>
            <div class="factory-spec-row"><span>Hacim &amp; Rezerv:</span><strong>Litre (${state.oxygenReserveLiters} L O₂ / ${state.waterReserveLiters} L Su)</strong></div>
            <div class="factory-spec-row"><span>Mesafe &amp; Süre:</span><strong>km / m · Saat</strong></div>
            <div class="factory-spec-row"><span>Işıma &amp; Alan:</span><strong>Alfa (α) · Beta (β) · Gama (γ) + Foton</strong></div>
          </div>

          <div class="settings-sep"></div>

          <label class="setting-toggle-item">
            <span>Yaklaştıkça Render Et (Ölçekli LOD)</span>
            <input type="checkbox" data-setting-key="progressiveLodRender" data-setting-label="Ölçekli LOD Render" ${state.progressiveLodRender ? "checked" : ""} />
          </label>
          <label class="setting-toggle-item">
            <span>Yol Yorumları &amp; Süre Etiketleri</span>
            <input type="checkbox" data-setting-key="showRouteComments" data-setting-label="Yol Yorumları" ${state.showRouteComments ? "checked" : ""} />
          </label>
          <label class="setting-toggle-item">
            <span>Bölge İsimleri (Nomenclature)</span>
            <input type="checkbox" data-setting-key="showNomenclature" data-setting-label="Bölge İsimleri" ${state.showNomenclature ? "checked" : ""} />
          </label>
          <label class="setting-toggle-item">
            <span>Koordinat Ağı (Graticule)</span>
            <input type="checkbox" data-setting-key="showGraticule" data-setting-label="Koordinat Ağı" ${state.showGraticule ? "checked" : ""} />
          </label>
          <label class="setting-toggle-item">
            <span>Yıldız Arkaplanı (Starfield)</span>
            <input type="checkbox" data-setting-key="showStarfield" data-setting-label="Yıldız Arkaplanı" ${state.showStarfield ? "checked" : ""} />
          </label>
          <label class="setting-toggle-item">
            <span>Yüksek Detay 3D Tarama</span>
            <input type="checkbox" data-setting-key="highQualityGlobeRay" data-setting-label="Yüksek Detay 3D Tarama" ${state.highQualityGlobeRay ? "checked" : ""} />
          </label>

          <div class="setting-fps-note">FPS &lt; 10 Koruma Aktif: Ayar FPS'i 10 altına düşürürse otomatik geri alınır.</div>
        </div>
      </div>

      <nav class="top-nav-pill" aria-label="Hızlı Hedefler">
        <span class="brand-tag">ASTRO<span>CHIEF</span></span>
        <button class="nav-target-btn ${state.routeScope === "global" ? "active" : ""}" id="btn-scope-global">Genel Rota</button>
        ${craterButtons}
        <button class="nav-info-btn" id="btn-open-mission-modal" title="Yarışma, Kaynaklar ve Ekip">Bilgi</button>
      </nav>
    `;

    this.bindEvents();
  }

  bindEvents() {
    this.mountEl.querySelector("#btn-settings")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleOpen();
    });

    this.mountEl.querySelector("#settings-dropdown")?.addEventListener("click", (e) => e.stopPropagation());

    this.mountEl.querySelector("#btn-factory-reset")?.addEventListener("click", () => {
      this.close();
      this.handlers.onFactoryReset?.();
    });

    this.mountEl.querySelectorAll("[data-setting-key]").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        const key = cb.getAttribute("data-setting-key");
        const label = cb.getAttribute("data-setting-label") || key;
        this.handlers.onSettingChange?.(key, e.target.checked, label);
      });
    });

    this.mountEl.querySelector("#btn-scope-global")?.addEventListener("click", () => {
      this.handlers.onSelectGlobalScope?.();
    });

    this.mountEl.querySelectorAll("[data-crater-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.handlers.onSelectCrater?.(btn.getAttribute("data-crater-nav"));
      });
    });

    this.mountEl.querySelector("#btn-open-mission-modal")?.addEventListener("click", () => {
      this.handlers.onOpenInfoModal?.();
    });
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc sol ust Ayarlar ve Factory Reset menu bileseni tanimi.
   - Satir 7-27: constructor, toggleOpen ve close; acilir menunun acik/kapali durumunu yonetir.
   - Satir 29-111: render; 1. secenekte Factory Reset butonu, Factory birim standartlari, FPS korumali anahtarlar ve ust krater seridini cizer.
   - Satir 113-147: bindEvents; ayar tiklamalarini FPS koruma denetleyicisine baglar.
   ========================================================================== */
