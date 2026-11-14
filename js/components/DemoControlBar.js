/**
 * @file DemoControlBar.js
 * @description Juri sunumu sirasinda alt-orta alanda acilan Rehberli Demo Kontrol Cubugu.
 * Senaryo gecisleri, Rover/EVA Astronot secimi, oynat/duraklat, hiz carpani ve canli telemetri icerir.
 */

(function (ns) {
  "use strict";

  class DemoControlBar {
    constructor(mountEl, handlers = {}) {
      this.mountEl = mountEl;
      this.handlers = handlers;
      this.isScrubbing = false;
    }

    t(key, vars = {}) {
      return ns.i18n ? ns.i18n.t(key, vars) : key;
    }

    esc(str) {
      if (ns.i18n && ns.i18n.escapeHtml) return ns.i18n.escapeHtml(str);
      return String(str ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    /** Animasyon sirasinda DOM'u yeniden kurmadan yalnizca canli sayaclari gunceller */
    updateLiveTelemetry(tele) {
      if (!this.mountEl || !tele) return;
      const pctEl = this.mountEl.querySelector("#demo-pct-val");
      const distEl = this.mountEl.querySelector("#demo-dist-val");
      const elevEl = this.mountEl.querySelector("#demo-elev-val");
      const o2El = this.mountEl.querySelector("#demo-o2-val");
      const scrubEl = this.mountEl.querySelector("#demo-scrubber");
      if (pctEl) pctEl.textContent = `${tele.progressPct}%`;
      if (distEl) distEl.textContent = `${tele.traveledKm.toFixed(1)} / ${tele.totalKm.toFixed(1)} km`;
      if (elevEl) elevEl.textContent = `${tele.elevM >= 0 ? "+" : ""}${tele.elevM} m`;
      if (o2El) {
        o2El.textContent = `${tele.remainingO2L} L`;
        o2El.classList.toggle("warn", tele.remainingO2L < 95);
      }
      if (scrubEl && !this.isScrubbing) {
        scrubEl.value = String(Math.round((tele.progress || 0) * 1000));
      }
    }

    render(uiState) {
      if (!this.mountEl) return;
      if (!uiState || !uiState.active) {
        this.mountEl.innerHTML = "";
        return;
      }

      const dirAttr = (ns.i18n && ns.i18n.isRtl()) ? 'dir="rtl"' : 'dir="ltr"';
      const activeScen = uiState.scenarios[uiState.scenarioIdx] || uiState.scenarios[0];
      const tele = uiState.telemetry || {
        progressPct: 0, traveledKm: 0, totalKm: 0, elevM: 0, remainingO2L: 420, speedKmH: 14.5, progress: 0
      };

      if (uiState.collapsed) {
        this.mountEl.innerHTML = `
          <div class="demo-collapsed-pill" ${dirAttr}>
            <span class="demo-live-dot"></span>
            <span class="demo-collapsed-title">${this.esc(this.t(activeScen.titleKey))}</span>
            <button type="button" class="demo-mini-btn" id="demo-btn-play">${uiState.playing ? "⏸" : "▶"}</button>
            <button type="button" class="demo-mini-btn" id="demo-btn-expand" title="${this.esc(this.t("demoExpand"))}">▴</button>
            <button type="button" class="demo-mini-btn danger" id="demo-btn-close" title="${this.esc(this.t("demoClose"))}">✕</button>
          </div>
        `;
        this.bindEvents();
        return;
      }

      const stepPillsHtml = uiState.scenarios.map((sc, i) => `
        <button type="button"
                class="demo-scen-pill ${i === uiState.scenarioIdx ? "active" : ""}"
                data-demo-scen="${i}"
                title="${this.esc(this.t(sc.titleKey))}">
          ${i + 1}
        </button>
      `).join("");

      const speedBtnsHtml = [1, 2, 5, 10].map((sp) => `
        <button type="button" class="demo-speed-btn ${uiState.speedMult === sp ? "active" : ""}" data-demo-speed="${sp}">${sp}x</button>
      `).join("");

      this.mountEl.innerHTML = `
        <section class="demo-panel" aria-label="${this.esc(this.t("demoPanelTitle"))}" ${dirAttr}>
          <div class="demo-head">
            <div class="demo-head-left">
              <span class="demo-badge"><span class="demo-live-dot"></span> ${this.esc(this.t("demoPanelTitle"))}</span>
              <strong class="demo-scen-title">${this.esc(this.t(activeScen.titleKey))}</strong>
            </div>
            <div class="demo-head-right">
              <div class="demo-scen-pills">${stepPillsHtml}</div>
              <button type="button" class="demo-mini-btn ${uiState.autoTour ? "active" : ""}" id="demo-btn-autotour">${this.esc(this.t("demoAutoTour"))}</button>
              <button type="button" class="demo-mini-btn" id="demo-btn-collapse" title="${this.esc(this.t("demoCollapse"))}">▾</button>
              <button type="button" class="demo-mini-btn danger" id="demo-btn-close" title="${this.esc(this.t("demoClose"))}">✕</button>
            </div>
          </div>

          <p class="demo-cue-text">${this.esc(this.t(activeScen.cueKey))}</p>

          <div class="demo-controls-row">
            <div class="demo-transport">
              <button type="button" class="demo-ctrl-btn" id="demo-btn-prev" title="${this.esc(this.t("demoPrev"))}">⏮</button>
              <button type="button" class="demo-ctrl-btn primary" id="demo-btn-play" title="${this.esc(uiState.playing ? this.t("demoPause") : this.t("demoPlay"))}">
                ${uiState.playing ? `⏸ ${this.esc(this.t("demoPause"))}` : `▶ ${this.esc(this.t("demoPlay"))}`}
              </button>
              <button type="button" class="demo-ctrl-btn" id="demo-btn-restart" title="${this.esc(this.t("demoRestart"))}">↺</button>
              <button type="button" class="demo-ctrl-btn" id="demo-btn-next" title="${this.esc(this.t("demoNext"))}">⏭</button>
            </div>

            <div class="demo-scrubber-wrap">
              <input type="range" id="demo-scrubber" class="demo-scrubber" min="0" max="1000" value="${Math.round((tele.progress || 0) * 1000)}" aria-label="${this.esc(this.t("demoProgressLabel"))}" />
              <span class="demo-pct-pill" id="demo-pct-val">${tele.progressPct}%</span>
            </div>

            <div class="demo-speed-group">${speedBtnsHtml}</div>
          </div>

          <div class="demo-tele-row">
            <div class="demo-vehicle-switch">
              <button type="button" class="demo-veh-btn ${uiState.vehicle === "rover" ? "active" : ""}" data-demo-veh="rover">🚙 ${this.esc(this.t("demoVehicleRover"))}</button>
              <button type="button" class="demo-veh-btn ${uiState.vehicle === "astronaut" ? "active" : ""}" data-demo-veh="astronaut">🧑‍🚀 ${this.esc(this.t("demoVehicleEva"))}</button>
            </div>
            <div class="demo-metrics-chips">
              <span class="demo-metric-chip">⚡ ${tele.speedKmH} ${this.esc(this.t("demoSpeedUnit"))}</span>
              <span class="demo-metric-chip" id="demo-dist-val">${tele.traveledKm.toFixed(1)} / ${tele.totalKm.toFixed(1)} km</span>
              <span class="demo-metric-chip" id="demo-elev-val">${tele.elevM >= 0 ? "+" : ""}${tele.elevM} m</span>
              <span class="demo-metric-chip ${tele.remainingO2L < 95 ? "warn" : ""}" id="demo-o2-val">${tele.remainingO2L} L O₂</span>
            </div>
          </div>
        </section>
      `;

      this.bindEvents();
    }

    bindEvents() {
      if (!this.mountEl) return;
      this.mountEl.querySelector("#demo-btn-close")?.addEventListener("click", () => this.handlers.onClose?.());
      this.mountEl.querySelector("#demo-btn-collapse")?.addEventListener("click", () => this.handlers.onToggleCollapse?.());
      this.mountEl.querySelector("#demo-btn-expand")?.addEventListener("click", () => this.handlers.onToggleCollapse?.());
      this.mountEl.querySelector("#demo-btn-autotour")?.addEventListener("click", () => this.handlers.onToggleAutoTour?.());
      this.mountEl.querySelector("#demo-btn-play")?.addEventListener("click", () => this.handlers.onTogglePlay?.());
      this.mountEl.querySelector("#demo-btn-restart")?.addEventListener("click", () => this.handlers.onRestart?.());
      this.mountEl.querySelector("#demo-btn-prev")?.addEventListener("click", () => this.handlers.onPrev?.());
      this.mountEl.querySelector("#demo-btn-next")?.addEventListener("click", () => this.handlers.onNext?.());

      this.mountEl.querySelectorAll("[data-demo-scen]").forEach((btn) => {
        btn.addEventListener("click", () => this.handlers.onSelectScenario?.(Number(btn.getAttribute("data-demo-scen"))));
      });
      this.mountEl.querySelectorAll("[data-demo-speed]").forEach((btn) => {
        btn.addEventListener("click", () => this.handlers.onSetSpeed?.(Number(btn.getAttribute("data-demo-speed"))));
      });
      this.mountEl.querySelectorAll("[data-demo-veh]").forEach((btn) => {
        btn.addEventListener("click", () => this.handlers.onSetVehicle?.(btn.getAttribute("data-demo-veh")));
      });

      const scrub = this.mountEl.querySelector("#demo-scrubber");
      if (scrub) {
        scrub.addEventListener("mousedown", () => { this.isScrubbing = true; });
        scrub.addEventListener("mouseup", () => { this.isScrubbing = false; });
        scrub.addEventListener("input", (e) => {
          this.handlers.onScrub?.(Number(e.target.value) / 1000);
        });
      }
    }
  }

  ns.DemoControlBar = DemoControlBar;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc alt-orta Rehberli Demo Kontrol Cubugu bileseni tanimi.
   - Satir 10-24: constructor, t ve esc; DOM baglantisi, 9-dil cevirisi ve XSS kacisi.
   - Satir 26-42: updateLiveTelemetry; rAF animasyonu sirasinda sayac ve kaydiriciyi yerinden oynatmadan gunceller.
   - Satir 44-119: render; kucultulmus hap veya tam juri demo karti (senaryo secimi, hiz, arac secimi, telemetri) cizer.
   - Satir 121-151: bindEvents; oynat/duraklat, ileri/geri, arac tipi, hiz carpani ve ilerleme cubugu olaylarini baglar.
   ========================================================================== */
