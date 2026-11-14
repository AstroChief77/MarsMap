/**
 * @file SatelliteDockMenu.js
 * @description Sol alt Uydular Paneli (Acilir pencerede 2D/3D secimi ve arka planinda
 * Mars bolge fotograflari olan Asit Yagmuru / Kum Kasirgasi siddet filtreleri).
 */

export class SatelliteDockMenu {
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.isOpen = false;
  }

  renderMarkup(state) {
    const acidLevels = [
      { id: "low", label: "Hafif (pH 4.2)" },
      { id: "moderate", label: "Orta (pH 3.4)" },
      { id: "severe", label: "Şiddetli (pH 2.1)" }
    ];
    const stormLevels = [
      { id: "low", label: "Hafif (τ 0.8)" },
      { id: "moderate", label: "Orta (τ 2.4)" },
      { id: "severe", label: "Kasırga (τ 4.5)" }
    ];

    return `
      <div class="globe-bottom-left" aria-label="Uydular ve Atmosfer Filtreleri">
        <div class="sat-popover ${this.isOpen ? "open" : ""}" id="satellite-dock-popover" role="dialog" aria-label="Uydular Paneli">
          <div class="sat-pop-head">
            <span>Uydular &amp; Atmosfer</span>
            <div class="globe-mode-switch compact">
              <button class="globe-mode-btn ${state.viewMode === "2d" ? "active" : ""}" id="btn-mode-2d">2D</button>
              <button class="globe-mode-btn ${state.viewMode === "3d" ? "active" : ""}" id="btn-mode-3d">3D</button>
            </div>
          </div>

          <div class="sat-weather-card sat-acid-bg ${state.filterAcidRain ? "enabled" : "muted"}">
            <div class="sat-card-scrim">
              <div class="sat-card-top">
                <span class="sat-card-title">Asit Yağmuru</span>
                <label class="sat-mini-toggle">
                  <input type="checkbox" id="filter-acid-rain" ${state.filterAcidRain ? "checked" : ""} />
                  <span>${state.filterAcidRain ? "Aktif" : "Kapalı"}</span>
                </label>
              </div>
              <div class="sat-severity-row">
                ${acidLevels.map((lv) => `
                  <button class="sat-sev-btn ${state.acidIntensity === lv.id ? "active-acid" : ""}" data-acid-level="${lv.id}">
                    ${lv.label}
                  </button>
                `).join("")}
              </div>
            </div>
          </div>

          <div class="sat-weather-card sat-storm-bg ${state.filterDustStorm ? "enabled" : "muted"}">
            <div class="sat-card-scrim">
              <div class="sat-card-top">
                <span class="sat-card-title">Kum / Kasırga</span>
                <label class="sat-mini-toggle">
                  <input type="checkbox" id="filter-dust-storm" ${state.filterDustStorm ? "checked" : ""} />
                  <span>${state.filterDustStorm ? "Aktif" : "Kapalı"}</span>
                </label>
              </div>
              <div class="sat-severity-row">
                ${stormLevels.map((lv) => `
                  <button class="sat-sev-btn ${state.stormIntensity === lv.id ? "active-storm" : ""}" data-storm-level="${lv.id}">
                    ${lv.label}
                  </button>
                `).join("")}
              </div>
            </div>
          </div>
        </div>

        <div class="sat-dock-bar">
          <button class="sat-trigger-btn ${this.isOpen ? "active" : ""}" id="btn-satellite-dock" title="Uydular Panelini Aç">
            <span class="sat-icon">🛰️</span>
            <span>Uydular</span>
            <span class="sat-mode-badge">${state.viewMode.toUpperCase()}</span>
          </button>

          <button class="globe-filter-chip sat-pill-acid ${state.filterAcidRain ? "active-acid" : ""}" id="btn-quick-acid" title="Asit Yağmuru Filtresi">
            <span class="chip-dot dot-acid"></span>
            <span>Asit (${state.acidIntensity})</span>
          </button>

          <button class="globe-filter-chip sat-pill-storm ${state.filterDustStorm ? "active-storm" : ""}" id="btn-quick-storm" title="Kum / Kasırga Filtresi">
            <span class="chip-dot dot-storm"></span>
            <span>Kasırga (${state.stormIntensity})</span>
          </button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    const trigger = document.getElementById("btn-satellite-dock");
    const popover = document.getElementById("satellite-dock-popover");

    trigger?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.isOpen = !this.isOpen;
      trigger.classList.toggle("active", this.isOpen);
      popover?.classList.toggle("open", this.isOpen);
    });

    popover?.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("btn-mode-2d")?.addEventListener("click", () => this.callbacks.onChangeViewMode("2d"));
    document.getElementById("btn-mode-3d")?.addEventListener("click", () => this.callbacks.onChangeViewMode("3d"));

    document.getElementById("filter-acid-rain")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting("filterAcidRain", e.target.checked);
    });
    document.getElementById("filter-dust-storm")?.addEventListener("change", (e) => {
      this.callbacks.onChangeSetting("filterDustStorm", e.target.checked);
    });

    document.getElementById("btn-quick-acid")?.addEventListener("click", () => {
      this.callbacks.onToggleFilter("filterAcidRain");
    });
    document.getElementById("btn-quick-storm")?.addEventListener("click", () => {
      this.callbacks.onToggleFilter("filterDustStorm");
    });

    document.querySelectorAll("[data-acid-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.callbacks.onSetSeverity("acidIntensity", "filterAcidRain", btn.getAttribute("data-acid-level"));
      });
    });

    document.querySelectorAll("[data-storm-level]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.callbacks.onSetSeverity("stormIntensity", "filterDustStorm", btn.getAttribute("data-storm-level"));
      });
    });
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    document.getElementById("btn-satellite-dock")?.classList.remove("active");
    document.getElementById("satellite-dock-popover")?.classList.remove("open");
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-11: JSDoc ve SatelliteDockMenu yapici sinifi (acilir/kapanir durum).
   - Satir 13-96: renderMarkup; sol alt Uydular butonu, acilir 2D/3D secici ve fotografli Asit/Kasirga siddet kartlari.
   - Satir 98-147: bindEvents & close; 2D/3D, Asit/Kasirga acma-kapama ve siddet seviye secim olaylarini baglar.
   ========================================================================== */
