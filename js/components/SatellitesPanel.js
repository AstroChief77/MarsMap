/**
 * @file SatellitesPanel.js
 * @description Sol alt kosede bulunan UYDULAR paneli bileseni (9 dil destekli).
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
      const prev = this.isOpen;
      this.isOpen = typeof forceState === "boolean" ? forceState : !this.isOpen;
      if (this.isOpen) this.handlers.onPopoverOpen?.();
      this.mountEl.querySelector("#btn-satellites-toggle")?.classList.toggle("open", this.isOpen);
      this.mountEl.querySelector("#satellites-popover")?.classList.toggle("open", this.isOpen);
      if (this.isOpen !== prev) this.handlers.onPanelToggle?.(this.isOpen);
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
      const esc = (s) => (i18n && i18n.escapeHtml ? i18n.escapeHtml(s) : String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
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
          <button type="button"
                  class="sat-layer-chip ${state.activeLayerId === layer.id ? "active" : ""}"
                  data-sat-layer="${esc(layer.id)}">
            ${esc(label)}
          </button>
        `;
      }).join("");

      const intensityBtn = (kind, level, label, currentVal, enabled) => `
        <button type="button"
                class="sat-int-btn ${currentVal === level ? "active" : ""}"
                data-intensity-kind="${esc(kind)}"
                data-intensity-val="${esc(level)}"
                ${enabled ? "" : "disabled"}>
          ${esc(label)}
        </button>
      `;

      const acidStateText = state.filterAcidRain ? t("stateOn") : t("stateOff");
      const stormStateText = state.filterDustStorm ? t("stateOn") : t("stateOff");
      const radStateText = state.showRadiationZones ? t("stateOn") : t("stateOff");
      const modeTag = String(state.viewMode || "3d").toUpperCase();

      this.mountEl.innerHTML = `
        <div class="sat-popover ${this.isOpen ? "open" : ""}" id="satellites-popover" role="dialog" aria-label="${esc(t("satTitle"))}" ${dirAttr}>
          <div class="sat-pop-header">
            <span class="sat-pop-title">${esc(t("satTitle"))}</span>
            <button type="button" class="sat-pop-close" id="btn-sat-close" title="${esc(t("close"))}">✕</button>
          </div>

          <!-- 1. 2D / 3D Gorunum Secenekleri (Arka Planda Mars Fotograflari - Resme Basilir) -->
          <div class="sat-view-grid">
            <button type="button"
                    class="sat-photo-card sat-view-btn sat-bg-2d ${state.viewMode === "2d" ? "active" : "inactive"}"
                    data-view-mode="2d"
                    aria-pressed="${state.viewMode === "2d"}">
              ${state.viewMode === "2d" ? `<span class="sat-active-badge">${esc(t("activeBadge"))}</span>` : ""}
              <span class="sat-card-kicker">EPSG:104905</span>
              <span class="sat-card-label">${esc(t("view2d"))}</span>
            </button>

            <button type="button"
                    class="sat-photo-card sat-view-btn sat-bg-3d ${state.viewMode === "3d" ? "active" : "inactive"}"
                    data-view-mode="3d"
                    aria-pressed="${state.viewMode === "3d"}">
              ${state.viewMode === "3d" ? `<span class="sat-active-badge">${esc(t("activeBadge"))}</span>` : ""}
              <span class="sat-card-kicker">${esc(t("sphereKicker"))}</span>
              <span class="sat-card-label">${esc(t("view3d"))}</span>
            </button>
          </div>

          <!-- 2. Asit Yagmurlari ve Siddetleri (Arka Planda Asit Bolge Fotografi - Resme Tiklayinca Ac/Kapa) -->
          <div class="sat-photo-card sat-hazard-card sat-bg-acid ${state.filterAcidRain ? "active" : "inactive"}"
               data-card-toggle="filterAcidRain"
               role="button"
               tabindex="0"
               aria-pressed="${state.filterAcidRain}"
               aria-label="${esc(t("acidRain"))} (${esc(acidStateText)})"
               title="${esc(t("acidRain"))} — ${esc(acidStateText)}">
            <div class="sat-hazard-head">
              <span class="sat-hazard-title">${esc(t("acidRain"))}</span>
              <span class="sat-switch ${state.filterAcidRain ? "on" : ""}" id="btn-toggle-acid" aria-hidden="true">
                ${esc(acidStateText)}
              </span>
            </div>
            <div class="sat-intensity-row">
              ${intensityBtn("acidIntensity", "hafif", `${t("intensityLow")} · pH 3.8`, state.acidIntensity, state.filterAcidRain)}
              ${intensityBtn("acidIntensity", "orta", `${t("intensityMedium")} · pH 2.4`, state.acidIntensity, state.filterAcidRain)}
              ${intensityBtn("acidIntensity", "siddetli", `${t("intensitySevere")} · pH 1.3`, state.acidIntensity, state.filterAcidRain)}
            </div>
          </div>

          <!-- 3. Kum Firtinalari / Kasirga ve Siddetleri (Arka Planda Firtinali Bolge Fotografi - Resme Tiklayinca Ac/Kapa) -->
          <div class="sat-photo-card sat-hazard-card sat-bg-storm ${state.filterDustStorm ? "active" : "inactive"}"
               data-card-toggle="filterDustStorm"
               role="button"
               tabindex="0"
               aria-pressed="${state.filterDustStorm}"
               aria-label="${esc(t("dustStorm"))} (${esc(stormStateText)})"
               title="${esc(t("dustStorm"))} — ${esc(stormStateText)}">
            <div class="sat-hazard-head">
              <span class="sat-hazard-title">${esc(t("dustStorm"))}</span>
              <span class="sat-switch ${state.filterDustStorm ? "on" : ""}" id="btn-toggle-storm" aria-hidden="true">
                ${esc(stormStateText)}
              </span>
            </div>
            <div class="sat-intensity-row">
              ${intensityBtn("stormIntensity", "hafif", `${t("intensityLow")} · τ 1.2`, state.stormIntensity, state.filterDustStorm)}
              ${intensityBtn("stormIntensity", "orta", `${t("intensityMedium")} · τ 2.8`, state.stormIntensity, state.filterDustStorm)}
              ${intensityBtn("stormIntensity", "siddetli", `${t("intensitySevere")} · τ 4.5`, state.stormIntensity, state.filterDustStorm)}
            </div>
          </div>

          <!-- 4. Radyasyon / Foton Kusagi (Arka Planda Aurora/Foton Fotografi - Resme Tiklayinca Ac/Kapa) -->
          <button type="button"
                  class="sat-photo-card sat-hazard-card sat-bg-rad ${state.showRadiationZones ? "active" : "inactive"}"
                  data-card-toggle="showRadiationZones"
                  aria-pressed="${state.showRadiationZones}"
                  aria-label="${esc(t("photonRadiation"))} (${esc(radStateText)})"
                  title="${esc(t("photonRadiation"))} — ${esc(radStateText)}">
            <div class="sat-hazard-head">
              <span class="sat-hazard-title">${esc(t("photonRadiation"))}</span>
              <span class="sat-switch ${state.showRadiationZones ? "on" : ""}" id="btn-toggle-rad" aria-hidden="true">
                ${esc(radStateText)}
              </span>
            </div>
          </button>

          <!-- 5. Yerel data/tiles Uydu Katmanlari -->
          <div class="sat-layer-row">${layerChips}</div>
        </div>

        <button type="button" class="sat-trigger-btn ${this.isOpen ? "open" : ""}" id="btn-satellites-toggle" aria-expanded="${this.isOpen}">
          <span class="sat-trigger-top">
            <span class="sat-mode-tag">${esc(modeTag)}</span>
          </span>
          <span class="sat-trigger-label">${esc(t("satTrigger"))}</span>
        </button>
      `;

      this.bindEvents(state);
    }

    bindEvents(state) {
      const t = (k) => (ns.i18n ? ns.i18n.t(k) : k);
      const labelMap = {
        filterAcidRain: t("acidRain"),
        filterDustStorm: t("dustStorm"),
        showRadiationZones: t("photonRadiation")
      };

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

      this.mountEl.querySelectorAll("[data-card-toggle]").forEach((card) => {
        const key = card.getAttribute("data-card-toggle");
        const toggleCard = () => this.handlers.onSettingChange?.(key, !state[key], labelMap[key] || key);
        card.addEventListener("click", (e) => {
          if (e.target.closest("[data-intensity-kind]")) return;
          toggleCard();
        });
        if (card.tagName !== "BUTTON") {
          card.addEventListener("keydown", (e) => {
            if (e.target !== card) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              toggleCard();
            }
          });
        }
      });

      this.mountEl.querySelectorAll("[data-intensity-kind]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
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
   - Satir 12-58: constructor, preloadCardImages (5 yerel resmi onbellekte dekode eder), toggleOpen (onPopoverOpen + onPanelToggle dahil) ve close.
   - Satir 60-199: render; esc() kacisi ile kare uydu tetikleyicisini ve 2D/3D, Asit Yagmuru, Firtina, Radyasyon ve Katman kartlarini cizer.
   - Satir 201-264: bindEvents; kart resmi tiklama/klavye (Enter/Space) gecislerini ve siddet secimlerini FPS koruma katmanina iletir.
   ========================================================================== */
