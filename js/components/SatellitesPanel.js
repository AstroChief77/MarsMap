/**
 * @file SatellitesPanel.js
 * @description Sol alt kosede bulunan UYDULAR paneli bileseni (10 dil destekli).
 * Kural geregi acilan pencerede:
 * - 2D / 3D gorunum secenegi
 * - Asit yagmurlari ve siddetleri (Hafif / Orta / Siddetli)
 * - Kum firtinalari/kasirga ve siddetleri
 * - Alfa/Beta/Gama isima ve uydu katmanlari
 * az ve oz yazilarla, arka planlarinda gercek Mars bolge fotograflariyla Uydular icinde yer alir.
 */

(function (ns) {
  "use strict";
  class SatellitesPanel {
    /**
     * SatellitesPanel yapici metodu
     * @param {HTMLElement} mountEl - #bottom-left-dock elemani
     * @param {Object} handlers - FPS korumali ayar degisikligi geri cagirilari
     */
    constructor(mountEl, handlers) {
      this.mountEl = mountEl;
      this.handlers = handlers;
      this.isOpen = false;
      this.preloadCardImages();
    }

    /**
     * Uydular panelindeki 5 yerel Mars bolge fotografini baslangicta bellekte dekode eder
     */
    preloadCardImages() {
      const urls = [
        "./res/images/sat_2d_view.jpg",
        "./res/images/sat_3d_view.jpg",
        "./res/images/acid_rain_region.jpg",
        "./res/images/dust_storm_region.jpg",
        "./res/images/radiation_region.jpg"
      ];
      this._preloadedImgs = urls.map((src) => {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
        return img;
      });
    }

    toggleOpen(forceState) {
      this.isOpen = typeof forceState === "boolean" ? forceState : !this.isOpen;
      this.mountEl.querySelector("#btn-satellites-toggle")?.classList.toggle("open", this.isOpen);
      this.mountEl.querySelector("#satellites-popover")?.classList.toggle("open", this.isOpen);
    }

    close() {
      if (!this.isOpen) return;
      this.toggleOpen(false);
    }

    /**
     * Sol alt Uydular dugmesini ve tum ic secenekleri DOM'a cizer
     */
    render(state, tileLayers) {
      if (!this.mountEl) return;
      const i18n = ns.i18n;
      const t = (k, v) => (i18n ? i18n.t(k, v) : k);
      const dirAttr = (i18n && i18n.isRtl()) ? 'dir="rtl"' : 'dir="ltr"';

      const layerChips = (tileLayers || []).map((layer) => {
        const shortNames = {
          "mars-viking-mdim21": t("layerViking"),
          "mars-mola-elevation": t("layerMola"),
          "mars-themis-day-ir": t("layerThemis"),
          "mars-global-geology": t("layerGeology")
        };
        const label = shortNames[layer.id] || layer.name;
        return `
          <button class="sat-layer-chip ${state.activeLayerId === layer.id ? "active" : ""}"
                  data-sat-layer="${layer.id}">
            ${label}
          </button>
        `;
      }).join("");

      const intensityBtn = (kind, level, label, currentVal, enabled) => `
        <button class="sat-int-btn ${currentVal === level ? "active" : ""}"
                data-intensity-kind="${kind}"
                data-intensity-val="${level}"
                ${enabled ? "" : "disabled"}>
          ${label}
        </button>
      `;

      this.mountEl.innerHTML = `
        <div class="sat-popover ${this.isOpen ? "open" : ""}" id="satellites-popover" role="dialog" aria-label="${t("satTitle")}" ${dirAttr}>
          <div class="sat-pop-header">
            <span class="sat-pop-title">${t("satTitle")}</span>
            <button class="sat-pop-close" id="btn-sat-close" title="${t("close")}">✕</button>
          </div>

          <!-- 1. 2D / 3D Gorunum Secenekleri (Arka Planda Mars Fotograflari) -->
          <div class="sat-view-grid">
            <button class="sat-photo-card sat-view-btn sat-bg-2d ${state.viewMode === "2d" ? "active" : ""}" data-view-mode="2d">
              ${state.viewMode === "2d" ? `<span class="sat-active-badge">${t("activeBadge")}</span>` : ""}
              <span class="sat-card-kicker">EPSG:104905</span>
              <span class="sat-card-label">${t("view2d")}</span>
            </button>

            <button class="sat-photo-card sat-view-btn sat-bg-3d ${state.viewMode === "3d" ? "active" : ""}" data-view-mode="3d">
              ${state.viewMode === "3d" ? `<span class="sat-active-badge">${t("activeBadge")}</span>` : ""}
              <span class="sat-card-kicker">${t("sphereKicker")}</span>
              <span class="sat-card-label">${t("view3d")}</span>
            </button>
          </div>

          <!-- 2. Asit Yagmurlari ve Siddetleri (Arka Planda Asit Bolge Fotografi) -->
          <div class="sat-photo-card sat-hazard-card sat-bg-acid">
            <div class="sat-hazard-head">
              <span class="sat-hazard-title">${t("acidRain")}</span>
              <button class="sat-switch ${state.filterAcidRain ? "on" : ""}" id="btn-toggle-acid">
                ${state.filterAcidRain ? t("stateOn") : t("stateOff")}
              </button>
            </div>
            <div class="sat-intensity-row">
              ${intensityBtn("acidIntensity", "hafif", `${t("intensityLow")} · pH 3.8`, state.acidIntensity, state.filterAcidRain)}
              ${intensityBtn("acidIntensity", "orta", `${t("intensityMedium")} · pH 2.4`, state.acidIntensity, state.filterAcidRain)}
              ${intensityBtn("acidIntensity", "siddetli", `${t("intensitySevere")} · pH 1.3`, state.acidIntensity, state.filterAcidRain)}
            </div>
          </div>

          <!-- 3. Kum Firtinalari / Kasirga ve Siddetleri (Arka Planda Firtinali Bolge Fotografi) -->
          <div class="sat-photo-card sat-hazard-card sat-bg-storm">
            <div class="sat-hazard-head">
              <span class="sat-hazard-title">${t("dustStorm")}</span>
              <button class="sat-switch ${state.filterDustStorm ? "on" : ""}" id="btn-toggle-storm">
                ${state.filterDustStorm ? t("stateOn") : t("stateOff")}
              </button>
            </div>
            <div class="sat-intensity-row">
              ${intensityBtn("stormIntensity", "hafif", `${t("intensityLow")} · τ 1.2`, state.stormIntensity, state.filterDustStorm)}
              ${intensityBtn("stormIntensity", "orta", `${t("intensityMedium")} · τ 2.8`, state.stormIntensity, state.filterDustStorm)}
              ${intensityBtn("stormIntensity", "siddetli", `${t("intensitySevere")} · τ 4.5`, state.stormIntensity, state.filterDustStorm)}
            </div>
          </div>

          <!-- 4. Radyasyon / Foton Kusagi (Arka Planda Aurora/Foton Fotografi) -->
          <div class="sat-photo-card sat-hazard-card sat-bg-rad">
            <div class="sat-hazard-head">
              <span class="sat-hazard-title">${t("photonRadiation")}</span>
              <button class="sat-switch ${state.showRadiationZones ? "on" : ""}" id="btn-toggle-rad">
                ${state.showRadiationZones ? t("stateOn") : t("stateOff")}
              </button>
            </div>
          </div>

          <!-- 5. Yerel data/tiles Uydu Katmanlari -->
          <div class="sat-layer-row">${layerChips}</div>
        </div>

        <button class="sat-trigger-btn ${this.isOpen ? "open" : ""}" id="btn-satellites-toggle" aria-expanded="${this.isOpen}">
          <span class="sat-live-dot"></span>
          <span>${t("satTrigger")}</span>
          <span class="sat-mode-tag">${state.viewMode.toUpperCase()}</span>
        </button>
      `;

      this.bindEvents(state);
    }

    bindEvents(state) {
      const t = (k) => (ns.i18n ? ns.i18n.t(k) : k);
      this.mountEl.querySelector("#btn-satellites-toggle")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleOpen();
      });
      this.mountEl.querySelector("#btn-sat-close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.close();
      });
      this.mountEl.querySelector("#satellites-popover")?.addEventListener("click", (e) => e.stopPropagation());

      this.mountEl.querySelectorAll("[data-view-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const mode = btn.getAttribute("data-view-mode");
          this.handlers.onSettingChange?.("viewMode", mode, mode === "3d" ? t("view3d") : t("view2d"));
        });
      });

      this.mountEl.querySelector("#btn-toggle-acid")?.addEventListener("click", () => {
        this.handlers.onSettingChange?.("filterAcidRain", !state.filterAcidRain, t("acidRain"));
      });

      this.mountEl.querySelector("#btn-toggle-storm")?.addEventListener("click", () => {
        this.handlers.onSettingChange?.("filterDustStorm", !state.filterDustStorm, t("dustStorm"));
      });

      this.mountEl.querySelector("#btn-toggle-rad")?.addEventListener("click", () => {
        this.handlers.onSettingChange?.("showRadiationZones", !state.showRadiationZones, t("photonRadiation"));
      });

      this.mountEl.querySelectorAll("[data-intensity-kind]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const kind = btn.getAttribute("data-intensity-kind");
          const val = btn.getAttribute("data-intensity-val");
          this.handlers.onSettingChange?.(kind, val, kind === "acidIntensity" ? t("acidRain") : t("dustStorm"));
        });
      });

      this.mountEl.querySelectorAll("[data-sat-layer]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const lid = btn.getAttribute("data-sat-layer");
          this.handlers.onSettingChange?.("activeLayerId", lid, t("satLayerLabel"));
        });
      });
    }
  }

  ns.SatellitesPanel = SatellitesPanel;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-10: JSDoc sol alt Uydular paneli ve fotograf arkaplanli secenek kurallari.
   - Satir 12-55: constructor, preloadCardImages (5 yerel resmi onbellekte dekode eder), toggleOpen ve close.
   - Satir 57-166: render; Uydular penceresinin icine 2D/3D, Asit Yagmuru+Siddeti, Firtina+Siddeti, Radyasyon ve Katman seceneklerini 10 dil destegiyle yerlestirir.
   - Satir 168-214: bindEvents; her degisikligi FPS koruma katmanina iletir.
   ========================================================================== */
