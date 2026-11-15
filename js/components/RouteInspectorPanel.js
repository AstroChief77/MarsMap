/**
 * @file RouteInspectorPanel.js
 * @description Sag ustte yer alan minimalist Rota Planlayici bileseni (9 dil destekli).
 * Yalnizca hedef, 4 kisa rezerv alani, tek bakislik sonuc ve istege bagli detay baglantilari sunar.
 */

(function (ns) {
  "use strict";

  class RouteInspectorPanel {
    constructor(mountEl, handlers) {
      this.mountEl = mountEl;
      this.handlers = handlers;
      this._activeDetail = null;
      this._lastDrawerData = null;
    }

    _shortPlace(rawName, fallback = "") {
      const cleaned = String(rawName || fallback)
        .replace(/\s*\([^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return cleaned || fallback;
    }

    _shortFieldLabel(rawLabel) {
      return String(rawLabel || "")
        .replace(/\s*\([^)]*\)\s*/g, "")
        .trim();
    }

    _fmtNum(val) {
      const n = Number(val || 0);
      if (Math.abs(n) >= 20) return `${Math.round(n)}`;
      return Number(n.toFixed(1)).toString();
    }

    _formatShortDur(route, t) {
      if (!route) return "";
      const mins = Number(route.totalMinutes || 0);
      const hrs = Number(route.totalHours || 0);
      if (mins > 0 && mins < 60) return `${mins} ${t("minsUnit")}`;
      if (hrs > 0 && hrs < 24) return `${hrs.toFixed(1)} ${t("hoursShort")}`;
      if (hrs >= 24) return `${Math.round(hrs)} ${t("hoursShort")}`;
      return route.formattedDuration || "";
    }

    _formatKm(km) {
      const n = Number(km || 0);
      return n >= 100 ? `${Math.round(n)}` : n.toFixed(1);
    }

    _formatCustomDest(dest, t) {
      const base = this._shortPlace(dest?.name, t("destWord"));
      const lat = Number(dest?.lat || 0).toFixed(1);
      const lon = Number(dest?.lon || 0).toFixed(1);
      return `${base} (${lat}°, ${lon}°)`;
    }

    _cleanStepTitle(raw) {
      return String(raw || "")
        .replace(/Rust A\*\s*\([^)]*\)\s*·\s*/i, "")
        .replace(/:\s*MOLA\s*-?\d+\s*m\s*·\s*\([^)]*\)/i, "")
        .replace(/\s*·\s*\(\d+,\s*\d+\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
    }

    _buildStatusLine(pri, t, esc) {
      if (!pri) return { text: "", warn: false };
      const waterDef = Math.max(0, Number(((pri.waterLiters || 0) - (pri.startWaterL || 0)).toFixed(1)));
      const deficits = [];
      if ((pri.o2DeficitL || 0) > 0) deficits.push(`O₂ -${this._fmtNum(pri.o2DeficitL)} L`);
      if ((pri.energyDeficitKwh || 0) > 0) deficits.push(`-${this._fmtNum(pri.energyDeficitKwh)} kWh`);
      if (waterDef > 0) deficits.push(`${t("summaryWaterLabel")} -${this._fmtNum(waterDef)} L`);

      if (deficits.length > 0) {
        return { text: `⚠ ${t("deficitShort")}: ${deficits.join(" · ")}`, warn: true };
      }

      const o2Text = `O₂ ${this._fmtNum(pri.arrivalO2L)} L`;
      const enText = `${this._fmtNum(pri.arrivalEnergyKwh)} kWh`;
      const waterText = `${t("summaryWaterLabel")} ${this._fmtNum(pri.arrivalWaterL)} L`;
      const base = `${esc(o2Text)} · ${esc(enText)} · ${esc(waterText)}`;

      const crit = [];
      if (pri.walkbackO2Alert) crit.push(t("walkbackO2Short"));
      if (pri.batteryReserveAlert) crit.push(t("walkbackBatteryShort"));
      if (crit.length > 0) {
        return { text: `${base} · ⚠ ${crit.join(" · ")}`, warn: true };
      }
      return { text: base, warn: false };
    }

    _renderDetailDrawerHtml(activeKey) {
      const ctx = this._lastDrawerData;
      if (!ctx || !activeKey) return "";
      const { activeTabRoute, sec, showSecTab, radZone, wpList, selectedWp, t, esc } = ctx;

      if (activeKey === "steps") {
        const steps = (activeTabRoute && activeTabRoute.steps) || [];
        if (steps.length === 0) return "";
        const tabsHtml = sec ? `
          <div class="step-tabs">
            <button type="button" class="step-tab-btn ${!showSecTab ? "active" : ""}" data-step-tab="primary">${esc(t("blueRouteTitle"))}</button>
            <button type="button" class="step-tab-btn ${showSecTab ? "active" : ""}" data-step-tab="secondary">${esc(t("routeAltShort"))}</button>
          </div>
        ` : "";
        const rowsHtml = steps.map((s) => `
          <div class="step-row" data-step-lat="${Number(s.lat)}" data-step-lon="${Number(s.lon)}" title="${esc(t("stepFocusTitle"))}">
            <div class="step-row-top">
              <span>#${Number(s.step)} · ${esc(this._cleanStepTitle(s.instruction))}</span>
              <span class="step-dist">${Number(s.distKm) > 0 ? `${this._formatKm(s.distKm)} km` : ""}</span>
            </div>
            <div class="step-row-meta">${Number(s.elevM)} m · ${esc(t("slopeWord"))} ${Number(s.slopeDeg)}°</div>
            ${s.hazardWarning ? `<div class="step-row-warn">⚠ ${esc(s.hazardWarning)}</div>` : ""}
          </div>
        `).join("");
        return `<div class="insp-drawer">${tabsHtml}<div class="step-list">${rowsHtml}</div></div>`;
      }

      if (activeKey === "rad" && radZone) {
        return `
          <div class="insp-drawer">
            <div class="rad-grid">
              <div><span>${esc(t("radAlpha"))}</span><strong>${esc(radZone.alphaLevel || "0.14 μSv/s")}</strong></div>
              <div><span>${esc(t("radBeta"))}</span><strong>${esc(radZone.betaLevel || "1.65 mSv/h")}</strong></div>
              <div><span>${esc(t("radGamma"))}</span><strong>${esc(radZone.gammaLevel || "0.82 mSv/h")}</strong></div>
              <div><span>${esc(t("radPhotonFlux"))}</span><strong>${esc(radZone.photonFlux || "4.2×10⁴/cm²s")}</strong></div>
            </div>
          </div>
        `;
      }

      if (activeKey === "wp" && wpList.length > 0) {
        const chipsHtml = wpList.slice(0, 6).map((w) => `
          <button type="button" data-wp-id="${esc(w.id)}"
                  class="wp-chip ${selectedWp && selectedWp.id === w.id ? "active" : ""}">
            ${esc(w.name)}
          </button>
        `).join("");
        const detailHtml = selectedWp ? `
          <div class="wp-detail-line">
            <strong>${esc(selectedWp.name)}</strong> · ${Number(selectedWp.elev || 0)} m · ${Number(selectedWp.slope || 0)}°
            ${selectedWp.hazardNote ? ` · ${esc(selectedWp.hazardNote)}` : ""}
          </div>
        ` : "";
        return `<div class="insp-drawer"><div class="wp-strip">${chipsHtml}</div>${detailHtml}</div>`;
      }

      return "";
    }

    render(state, activeCrater, landingSites, waypoints, selectedWp, computedRoutes, radZones, uiMeta = {}) {
      if (!this.mountEl) return;
      const i18n = ns.i18n;
      const t = (k, v) => (i18n ? i18n.t(k, v) : k);
      const esc = (s) => (i18n && i18n.escapeHtml ? i18n.escapeHtml(s) : String(s ?? "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"));
      const dirAttr = (i18n && i18n.isRtl()) ? 'dir="rtl"' : 'dir="ltr"';

      const prevStepList = this.mountEl.querySelector(".step-list");
      const prevStepScroll = prevStepList ? prevStepList.scrollTop : 0;
      const activeEl = typeof document !== "undefined" ? document.activeElement : null;
      const activeId = activeEl && this.mountEl.contains(activeEl) ? activeEl.id : "";

      const helper = ns.MissionBudgetHelper ? new ns.MissionBudgetHelper() : null;
      const paramCheck = uiMeta.paramCheck || (helper
        ? helper.validateMissionParams(state)
        : { valid: false, missingKeys: ["o2", "energy", "water"], mode: state.expeditionMode || "rover-crew", profile: { minSpeedKmH: 4, maxSpeedKmH: 19, defaultSpeedKmH: 14.5 } });
      const mode = paramCheck.mode || "rover-crew";
      const prof = paramCheck.profile || { minSpeedKmH: 4, maxSpeedKmH: 19, defaultSpeedKmH: 14.5 };
      const paramAttempted = Boolean(uiMeta.paramAttempted);

      const rawO2 = state.oxygenReserveLiters > 0 ? state.oxygenReserveLiters : "";
      const rawEnergy = state.energyReserveKwh > 0 ? state.energyReserveKwh : "";
      const rawWater = state.waterReserveLiters > 0 ? state.waterReserveLiters : "";
      const rawSpeed = state.targetSpeedKmH > 0 ? state.targetSpeedKmH : prof.defaultSpeedKmH;

      const pri = computedRoutes?.primaryBlue || null;
      const sec = computedRoutes?.secondaryPaleBlue || null;
      const showSecTab = state.activeStepRouteTab === "secondary" && sec;
      const activeTabRoute = showSecTab ? sec : pri;
      const activeDest = uiMeta.activeDestination || state.customDestination || { name: "Jezero", lat: 18.44, lon: 77.45 };
      const activeOrigin = uiMeta.activeOrigin || state.customOrigin || null;
      const pickingDest = uiMeta.pickMode === "destination";
      const backendLoading = Boolean(uiMeta.backendLoading);
      const hasBackendResponse = Boolean(pri && paramCheck.valid && state.missionParamsConfirmed);

      const targetOptions = (landingSites || [])
        .filter((s) => s.id !== "curiosity-gale")
        .map((s) => `
          <option value="${esc(s.id)}" ${(!state.useCustomCoordinates && s.id === state.globalTargetId) ? "selected" : ""}>
            ${esc(this._shortPlace(s.name, s.name))}
          </option>
        `).join("");

      const shortDur = this._formatShortDur(pri, t);
      const solHint = pri && pri.totalHours >= 24 ? `~${Math.floor(pri.totalHours / 24)} Sol` : "";
      const toggleMetaHtml = hasBackendResponse
        ? `<span class="insp-toggle-meta">${esc(shortDur)} · ${this._formatKm(pri.totalKm)} km</span>`
        : "";

      const radZone = (state.showRadiationZones && Array.isArray(radZones) && radZones[0]) || null;
      const wpList = (state.routeScope === "crater" && Array.isArray(waypoints)) ? waypoints : [];
      const steps = (activeTabRoute && activeTabRoute.steps) || [];

      if (this._activeDetail === "steps" && steps.length === 0) this._activeDetail = null;
      if (this._activeDetail === "rad" && !radZone) this._activeDetail = null;
      if (this._activeDetail === "wp" && wpList.length === 0) this._activeDetail = null;

      this._lastDrawerData = { activeTabRoute, sec, showSecTab, radZone, wpList, selectedWp, t, esc };

      const miss = (k) => (paramAttempted && paramCheck.missingKeys.includes(k) ? "inp-missing" : "");
      const showGateAlert = Boolean(paramAttempted && !paramCheck.valid);
      const status = this._buildStatusLine(pri, t, esc);
      const radShort = radZone ? String(radZone.gammaLevel || "0.82 mSv/h").replace(/\s*\([^)]*\)/g, "").trim() : "";

      const footerLinks = [];
      if (steps.length > 0) {
        footerLinks.push(`<button type="button" class="insp-link-btn ${this._activeDetail === "steps" ? "active" : ""}" data-detail-toggle="steps">${esc(t("stepsListTitle", { count: steps.length }))} ▾</button>`);
      }
      if (radZone) {
        footerLinks.push(`<button type="button" class="insp-link-btn ${this._activeDetail === "rad" ? "active" : ""}" data-detail-toggle="rad">☢ ${esc(radShort)} ▾</button>`);
      }
      if (wpList.length > 0) {
        footerLinks.push(`<button type="button" class="insp-link-btn ${this._activeDetail === "wp" ? "active" : ""}" data-detail-toggle="wp">${esc(t("evaWaypointsTitle"))} (${wpList.length}) ▾</button>`);
      }

      const customOriginHtml = state.useCustomOrigin && activeOrigin
        ? `<div class="insp-origin-hint">${esc(t("originPresetLabel"))}: ${esc(this._shortPlace(activeOrigin.name, t("originWord")))}</div>`
        : "";

      const bottomSectionHtml = hasBackendResponse ? `
        <div class="insp-result">
          <div class="insp-hero">
            <div class="insp-hero-main">${esc(shortDur)} <span class="insp-hero-dist">· ${this._formatKm(pri.totalKm)} km</span></div>
            ${solHint ? `<span class="insp-hero-sol">${esc(solHint)}</span>` : ""}
          </div>

          <div class="insp-status-line ${status.warn ? "warn" : ""}">${status.text}</div>

          <div class="insp-action-row">
            <button type="button" class="insp-start-btn" id="btn-start-joint-journey">
              ${esc(t("startJointJourneyBtn"))}
            </button>
            <button type="button" class="insp-recalc-btn" id="btn-send-backend-route" title="${esc(t("calcRouteBtn"))}">
              ${backendLoading ? "…" : "↻"}
            </button>
          </div>

          ${footerLinks.length > 0 ? `<div class="insp-links-row">${footerLinks.join("")}</div>` : ""}
          <div id="insp-drawer-slot">${this._renderDetailDrawerHtml(this._activeDetail)}</div>
        </div>
      ` : `
        <button type="button" class="insp-calc-btn" id="btn-send-backend-route">
          ${esc(backendLoading ? t("calculatingShort") : t("calcRouteBtn"))}
        </button>
      `;

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>${esc(t("inspToggleBtn"))}</span>
          ${toggleMetaHtml}
          <span class="insp-caret">${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="${esc(t("inspToggleBtn"))}" ${dirAttr}>
          <div class="insp-head">
            <div class="insp-title">${esc(t("inspToggleBtn"))}</div>
            <button type="button" class="insp-close-btn" id="btn-close-inspector" aria-label="${esc(t("close"))}">✕</button>
          </div>

          <div class="insp-mode-grid">
            <button type="button" class="insp-mode-btn ${mode === "rover-crew" ? "active" : ""}" data-expedition-mode="rover-crew" title="${esc(t("modeRoverCrewDesc"))}">
              ${esc(t("modeRoverCrew"))}
            </button>
            <button type="button" class="insp-mode-btn ${mode === "joint-eva-escort" ? "active" : ""}" data-expedition-mode="joint-eva-escort" title="${esc(t("modeJointEvaDesc"))}">
              ${esc(t("modeJointEva"))}
            </button>
          </div>

          ${customOriginHtml}

          <div class="insp-target-row">
            <select class="insp-select" id="sel-target" aria-label="${esc(t("targetPresetLabel"))}">
              ${state.useCustomCoordinates ? `<option value="__custom__" selected>${esc(this._formatCustomDest(activeDest, t))}</option>` : ""}
              ${targetOptions}
            </select>
            <button type="button" class="insp-pick-btn ${pickingDest ? "active" : ""}" id="btn-pick-destination" title="${esc(t("pickDestBtn"))}">
              ${pickingDest ? esc(t("pickShortActive")) : "📍"}
            </button>
          </div>

          <div class="insp-param-grid">
            <div class="insp-param-cell" title="${esc(t("paramO2Label"))}">
              <label for="inp-mission-o2">${esc(this._shortFieldLabel(t("paramO2Label")))}</label>
              <input type="number" id="inp-mission-o2" class="${miss("o2")}" min="1" max="3000" step="10"
                     value="${esc(rawO2)}" placeholder="L" />
            </div>
            <div class="insp-param-cell" title="${esc(t("paramEnergyLabel"))}">
              <label for="inp-mission-energy">${esc(this._shortFieldLabel(t("paramEnergyLabel")))}</label>
              <input type="number" id="inp-mission-energy" class="${miss("energy")}" min="0.5" max="300" step="0.5"
                     value="${esc(rawEnergy)}" placeholder="kWh" />
            </div>
            <div class="insp-param-cell" title="${esc(t("paramWaterLabel"))}">
              <label for="inp-mission-water">${esc(this._shortFieldLabel(t("paramWaterLabel")))}</label>
              <input type="number" id="inp-mission-water" class="${miss("water")}" min="0.5" max="200" step="0.5"
                     value="${esc(rawWater)}" placeholder="L" />
            </div>
            <div class="insp-param-cell" title="${esc(t("paramSpeedLabel"))}">
              <label for="inp-mission-speed">${esc(this._shortFieldLabel(t("paramSpeedLabel")))}</label>
              <input type="number" id="inp-mission-speed" class="${miss("speed")}" min="${prof.minSpeedKmH}" max="${prof.maxSpeedKmH}" step="0.1"
                     value="${esc(rawSpeed)}" placeholder="km/h" />
            </div>
          </div>

          <div class="insp-gate-alert ${showGateAlert ? "" : "hidden"}" id="insp-param-alert">
            ⚠ ${esc(t("paramGateAlert"))}
          </div>

          ${bottomSectionHtml}
        </aside>
      `;

      const nextStepList = this.mountEl.querySelector(".step-list");
      if (nextStepList && prevStepScroll > 0) nextStepList.scrollTop = prevStepScroll;
      if (activeId) {
        const refocusEl = this.mountEl.querySelector(`#${activeId}`);
        if (refocusEl && document.activeElement !== refocusEl) refocusEl.focus();
      }

      this.bindEvents(state);
    }

    /** Kullanici yazarken odak bozmadan eksik girdi vurgusu ve uyariyi gunceller */
    syncParamGateUi(state, paramCheck, paramAttempted = false) {
      if (!this.mountEl) return;
      const missing = paramCheck.missingKeys || [];
      const map = { o2: "#inp-mission-o2", energy: "#inp-mission-energy", water: "#inp-mission-water", speed: "#inp-mission-speed" };
      Object.keys(map).forEach((k) => {
        const inp = this.mountEl.querySelector(map[k]);
        if (inp) inp.classList.toggle("inp-missing", Boolean(paramAttempted && missing.includes(k)));
      });
      const alertEl = this.mountEl.querySelector("#insp-param-alert");
      if (alertEl) alertEl.classList.toggle("hidden", !Boolean(paramAttempted && !paramCheck.valid));
    }

    _bindDrawerEvents() {
      const slot = this.mountEl.querySelector("#insp-drawer-slot");
      if (!slot) return;
      slot.querySelectorAll("[data-wp-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handlers.onSelectWaypoint?.(btn.getAttribute("data-wp-id"));
        });
      });
      slot.querySelectorAll("[data-step-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handlers.onChangeStepTab?.(btn.getAttribute("data-step-tab"));
        });
      });
      slot.querySelectorAll("[data-step-lat]").forEach((row) => {
        row.addEventListener("click", () => {
          const lat = parseFloat(row.getAttribute("data-step-lat"));
          const lon = parseFloat(row.getAttribute("data-step-lon"));
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            this.handlers.onFocusCoords?.(lat, lon);
          }
        });
      });
    }

    bindEvents(state) {
      this.mountEl.querySelector("#btn-toggle-inspector")?.addEventListener("click", () => {
        this.handlers.onToggleInspector?.(!state.inspectorOpen);
      });
      this.mountEl.querySelector("#btn-close-inspector")?.addEventListener("click", () => {
        this.handlers.onToggleInspector?.(false);
      });

      this.mountEl.querySelectorAll("[data-expedition-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handlers.onChangeExpeditionMode?.(btn.getAttribute("data-expedition-mode"));
        });
      });

      const bindParam = (id, key) => {
        const el = this.mountEl.querySelector(id);
        if (!el) return;
        const handler = (e) => this.handlers.onChangeMissionParam?.(key, e.target.value);
        el.addEventListener("input", handler);
        el.addEventListener("change", handler);
      };
      bindParam("#inp-mission-o2", "o2");
      bindParam("#inp-mission-energy", "energy");
      bindParam("#inp-mission-water", "water");
      bindParam("#inp-mission-speed", "speed");

      this.mountEl.querySelector("#sel-target")?.addEventListener("change", (e) => {
        if (e.target.value === "__custom__") return;
        this.handlers.onChangeGlobalEndpoints?.("globalTargetId", e.target.value);
      });

      this.mountEl.querySelector("#btn-pick-destination")?.addEventListener("click", () => {
        this.handlers.onTogglePickMode?.("destination");
      });

      this.mountEl.querySelector("#btn-send-backend-route")?.addEventListener("click", () => {
        this.handlers.onSendBackendRoute?.();
      });

      this.mountEl.querySelector("#btn-start-joint-journey")?.addEventListener("click", () => {
        this.handlers.onStartJointJourney?.();
      });

      this.mountEl.querySelectorAll("[data-detail-toggle]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = btn.getAttribute("data-detail-toggle");
          this._activeDetail = this._activeDetail === key ? null : key;
          this.mountEl.querySelectorAll("[data-detail-toggle]").forEach((b) => {
            b.classList.toggle("active", b.getAttribute("data-detail-toggle") === this._activeDetail);
          });
          const slot = this.mountEl.querySelector("#insp-drawer-slot");
          if (slot) {
            slot.innerHTML = this._renderDetailDrawerHtml(this._activeDetail);
            this._bindDrawerEvents();
          }
        });
      });

      this._bindDrawerEvents();
    }
  }

  ns.RouteInspectorPanel = RouteInspectorPanel;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-16: JSDoc minimalist sag ust Rota Planlayici sinifi ve constructor.
   - Satir 17-95: Metin kisaltma, sayi yuvarlama, cift koordinat temizleme ve tek satir durum ozeti.
   - Satir 97-159: _renderDetailDrawerHtml; istege bagli Adimlar, Radyasyon ve krater-ici Duraklar cekmecesi.
   - Satir 161-334: render; minimalist kart, mod sekmesi, tek satir hedef+harita, 4'lu micro rezerv izgarasi ve duz sonuc ozeti.
   - Satir 336-436: syncParamGateUi ve olay baglayicilar (girdi dogrulama, rota baslatma ve cekmece gecisleri).
   ========================================================================== */
