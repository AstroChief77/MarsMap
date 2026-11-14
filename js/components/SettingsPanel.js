/**
 * @file SettingsPanel.js
 * @description Sol ust Ayarlar simgesi, ilk secenegi ZORUNLU "Factory Reset" olan menu,
 * 9 dilli (ko, ja, tr, de, en, he, ar, fr, es) dil secici ve hizli hedef seridi bileseni.
 */

(function (ns) {
  "use strict";
  class SettingsPanel {
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
     * Sol ust Ayarlar + Factory Reset + 10 Dil Secici + Hedef Seridini DOM'a cizer
     */
    render(state, craters, backendStatus = "") {
      if (!this.mountEl) return;
      const i18n = ns.i18n;
      const t = (k, v) => (i18n ? i18n.t(k, v) : k);
      const langs = i18n ? i18n.getSupportedLanguages() : [];
      const currentLang = state.lang || (i18n ? i18n.getLang() : "tr");
      const dirAttr = (i18n && i18n.isRtl()) ? 'dir="rtl"' : 'dir="ltr"';

      const craterButtons = craters.map((c) => {
        const short = c.id === "gale-crater" ? `📍 ${t("originWord")} (Gale)` : (c.id === "jezero-crater" ? "🎯 Jezero" : "🎯 Korolev");
        const active = state.activeCraterId === c.id;
        return `<button class="nav-target-btn ${active ? "active" : ""}" data-crater-nav="${c.id}">${short}</button>`;
      }).join("");

      const langChipsHtml = langs.map((l) => `
        <button type="button"
                class="lang-chip-btn ${l.code === currentLang ? "active" : ""}"
                data-lang-code="${l.code}"
                title="${l.label}">
          <span class="lang-chip-badge">${l.badge}</span>
          <span class="lang-chip-name">${l.label}</span>
        </button>
      `).join("");

      const langSelectOptions = langs.map((l) => `
        <option value="${l.code}" ${l.code === currentLang ? "selected" : ""}>🌐 ${l.badge} · ${l.label}</option>
      `).join("");

      this.mountEl.innerHTML = `
        <div class="settings-anchor" id="settings-anchor">
          <button class="icon-square-btn ${this.isOpen ? "active" : ""}" id="btn-settings" title="${t("settingsTooltip")}" aria-label="${t("settingsAria")}">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>

          <div class="settings-dropdown ${this.isOpen ? "open" : ""}" id="settings-dropdown" role="menu" ${dirAttr}>
            <!-- ZORUNLU KURAL: Acildiginda ilk secenek Factory Reset -->
            <button class="btn-factory-reset" id="btn-factory-reset" role="menuitem">
              <span class="reset-glyph">↺</span>
              <span>
                <span class="reset-title">${t("factoryResetTitle")}</span>
                <span class="reset-sub">${t("factoryResetSub")}</span>
              </span>
            </button>

            <div class="settings-sep"></div>

            <div class="lang-config-box">
              <div class="factory-spec-title">${t("languageSectionTitle")}</div>
              <div class="lang-chip-grid" role="group" aria-label="${t("languageLabel")}">
                ${langChipsHtml}
              </div>
            </div>

            <div class="settings-sep"></div>

            <div class="factory-spec-box">
              <div class="factory-spec-title">${t("factorySpecTitle")}</div>
              <div class="factory-spec-row"><span>${t("specRenderScale")}</span><strong>${t("specRenderScaleVal")}</strong></div>
              <div class="factory-spec-row"><span>${t("specVolumeReserve")}</span><strong>${t("specVolumeReserveVal", { o2: state.oxygenReserveLiters, water: state.waterReserveLiters })}</strong></div>
              <div class="factory-spec-row"><span>${t("specDistDuration")}</span><strong>${t("specDistDurationVal")}</strong></div>
              <div class="factory-spec-row"><span>${t("specRadiation")}</span><strong>${t("specRadiationVal")}</strong></div>
            </div>

            <div class="settings-sep"></div>

            <label class="setting-toggle-item">
              <span>${t("toggleLod")}</span>
              <input type="checkbox" data-setting-key="progressiveLodRender" data-setting-label="${t("toggleLod")}" ${state.progressiveLodRender ? "checked" : ""} />
            </label>
            <label class="setting-toggle-item">
              <span>${t("toggleRouteComments")}</span>
              <input type="checkbox" data-setting-key="showRouteComments" data-setting-label="${t("toggleRouteComments")}" ${state.showRouteComments ? "checked" : ""} />
            </label>
            <label class="setting-toggle-item">
              <span>${t("toggleNomenclature")}</span>
              <input type="checkbox" data-setting-key="showNomenclature" data-setting-label="${t("toggleNomenclature")}" ${state.showNomenclature ? "checked" : ""} />
            </label>
            <label class="setting-toggle-item">
              <span>${t("toggleGraticule")}</span>
              <input type="checkbox" data-setting-key="showGraticule" data-setting-label="${t("toggleGraticule")}" ${state.showGraticule ? "checked" : ""} />
            </label>
            <label class="setting-toggle-item">
              <span>${t("toggleStarfield")}</span>
              <input type="checkbox" data-setting-key="showStarfield" data-setting-label="${t("toggleStarfield")}" ${state.showStarfield ? "checked" : ""} />
            </label>
            <label class="setting-toggle-item">
              <span>${t("toggleHqGlobe")}</span>
              <input type="checkbox" data-setting-key="highQualityGlobeRay" data-setting-label="${t("toggleHqGlobe")}" ${state.highQualityGlobeRay ? "checked" : ""} />
            </label>

            <div class="setting-fps-note">${t("fpsNote")}</div>

            <div class="settings-sep"></div>

            <div class="backend-config-box">
              <div class="backend-config-title">${t("backendTitle")}</div>
              <input
                type="url"
                class="backend-url-input"
                id="inp-backend-url"
                value="${(state.backendApiUrl || "").replace(/"/g, "&quot;")}"
                placeholder="http://127.0.0.1:8080"
                aria-label="Rust Backend URL"
                dir="ltr"
              />
              <div class="backend-btn-row">
                <button type="button" class="backend-mini-btn" id="btn-backend-save">${t("backendSave")}</button>
                <button type="button" class="backend-mini-btn ghost" id="btn-backend-test">${t("backendTest")}</button>
              </div>
              <div class="backend-status-line" id="backend-status-line">${backendStatus || (state.backendApiUrl ? t("backendReady") : t("backendFallbackActive"))}</div>
            </div>
          </div>
        </div>

        <nav class="top-nav-pill" aria-label="${t("navGlobalRoute")}">
          <span class="brand-tag">ASTRO<span>CHIEF</span></span>
          <button class="nav-target-btn ${state.routeScope === "global" ? "active" : ""}" id="btn-scope-global">${t("navGlobalRoute")}</button>
          ${craterButtons}
          <button class="nav-info-btn" id="btn-open-mission-modal" title="${t("navInfoTitle")}">${t("navInfo")}</button>
          <select class="nav-lang-select" id="sel-top-lang" aria-label="${t("languageLabel")}" title="${t("languageLabel")}">
            ${langSelectOptions}
          </select>
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

      this.mountEl.querySelectorAll("[data-lang-code]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const code = btn.getAttribute("data-lang-code");
          this.handlers.onLanguageChange?.(code);
        });
      });

      this.mountEl.querySelector("#sel-top-lang")?.addEventListener("change", (e) => {
        this.handlers.onLanguageChange?.(e.target.value);
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

      this.mountEl.querySelector("#btn-backend-save")?.addEventListener("click", () => {
        const val = this.mountEl.querySelector("#inp-backend-url")?.value || "";
        this.handlers.onBackendUrlSave?.(val);
      });

      this.mountEl.querySelector("#btn-backend-test")?.addEventListener("click", () => {
        const val = this.mountEl.querySelector("#inp-backend-url")?.value || "";
        this.handlers.onBackendUrlTest?.(val);
      });
    }
  }

  ns.SettingsPanel = SettingsPanel;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc sol ust Ayarlar, Factory Reset ve 10 dil secici bileseni tanimi.
   - Satir 7-30: constructor, toggleOpen ve close; acilir menunun durumunu yonetir.
   - Satir 32-160: render; 1. secenekte Factory Reset butonu, 10 dilli secici izgarasi, Factory birim standartlari, 10sn FPS korumali anahtarlar ve ust dil secim kutusunu cizer.
   - Satir 162-222: bindEvents; dil degisimi, ayar tiklamalari, hedef secimleri ve Rust backend dugmelerini baglar.
   ========================================================================== */
