/**
 * @file RouteInspectorPanel.js
 * @description Sag ustte yer alan sade, dusuk metinli Rota Planlayici bileseni (9 dil destekli).
 * Yalnizca kullanicinin ihtiyac duydugu hedef, rezerv, sure/mesafe/kalan ozet ve istege bagli acilir adimlari gosterir.
 */

(function (ns) {
  "use strict";

  class RouteInspectorPanel {
    constructor(mountEl, handlers) {
      this.mountEl = mountEl;
      this.handlers = handlers;
      this._openSections = new Set();
    }

    _shortPlace(rawName, fallback = "") {
      const cleaned = String(rawName || fallback)
        .replace(/\s*\([^)]*°[^)]*\)\s*/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return cleaned || fallback;
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

    _buildReserveAlert(pri, t) {
      if (!pri) return "";
      const waterDef = Math.max(0, Number(((pri.waterLiters || 0) - (pri.startWaterL || 0)).toFixed(1)));
      const deficits = [];
      if ((pri.o2DeficitL || 0) > 0) deficits.push(`O₂ -${pri.o2DeficitL} L`);
      if ((pri.energyDeficitKwh || 0) > 0) deficits.push(`-${pri.energyDeficitKwh} kWh`);
      if (waterDef > 0) deficits.push(`${t("summaryWaterLabel")} -${waterDef} L`);
      if (deficits.length > 0) {
        return `⚠ ${t("deficitShort")}: ${deficits.join(" · ")}`;
      }
      const crit = [];
      if (pri.walkbackO2Alert) crit.push(t("walkbackO2Short"));
      if (pri.batteryReserveAlert) crit.push(t("walkbackBatteryShort"));
      return crit.length > 0 ? `⚠ ${crit.join(" · ")}` : "";
    }

    _renderCollapsibles({ state, activeTabRoute, pri, sec, showSecTab, radZone, wpList, selectedWp, t, esc }) {
      const parts = [];
      const steps = (activeTabRoute && activeTabRoute.steps) || [];

      if (steps.length > 0) {
        const stepsOpen = this._openSections.has("steps") ? "open" : "";
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

        parts.push(`
          <details class="insp-collapse" data-collapse-key="steps" ${stepsOpen}>
            <summary>
              <span>${esc(t("stepsListTitle", { count: steps.length }))}</span>
              <span class="insp-collapse-chevron">▾</span>
            </summary>
            <div class="insp-collapse-body">
              ${tabsHtml}
              <div class="step-list">${rowsHtml}</div>
            </div>
          </details>
        `);
      }

      if (state.showRadiationZones && radZone) {
        const radOpen = this._openSections.has("rad") ? "open" : "";
        parts.push(`
          <details class="insp-collapse" data-collapse-key="rad" ${radOpen}>
            <summary>
              <span>☢ ${esc(radZone.name || t("photonRadiation"))}</span>
              <span class="insp-collapse-meta">${esc(radZone.gammaLevel || "0.82 mSv/h")} ▾</span>
            </summary>
            <div class="insp-collapse-body">
              <div class="rad-grid">
                <div><span>${esc(t("radAlpha"))}</span><strong>${esc(radZone.alphaLevel || "0.14 μSv/s")}</strong></div>
                <div><span>${esc(t("radBeta"))}</span><strong>${esc(radZone.betaLevel || "1.65 mSv/h")}</strong></div>
                <div><span>${esc(t("radGamma"))}</span><strong>${esc(radZone.gammaLevel || "0.82 mSv/h")}</strong></div>
                <div><span>${esc(t("radPhotonFlux"))}</span><strong>${esc(radZone.photonFlux || "4.2×10⁴/cm²s")}</strong></div>
              </div>
            </div>
          </details>
        `);
      }

      if (state.routeScope === "crater" && wpList.length > 0) {
        const wpOpen = this._openSections.has("wp") ? "open" : "";
        const chipsHtml = wpList.slice(0, 6).map((w) => `
          <button type="button" data-wp-id="${esc(w.id)}"
                  class="wp-chip ${selectedWp && selectedWp.id === w.id ? "active" : ""}">
            ${esc(w.name)}
          </button>
        `).join("");
        const detailHtml = selectedWp ? `
          <div class="wp-detail-box">
            <div><strong>${esc(selectedWp.name)}</strong> · ${Number(selectedWp.elev || 0)} m · ${Number(selectedWp.slope || 0)}°</div>
            ${selectedWp.hazardNote ? `<div>${esc(selectedWp.hazardNote)}</div>` : ""}
          </div>
        ` : "";

        parts.push(`
          <details class="insp-collapse" data-collapse-key="wp" ${wpOpen}>
            <summary>
              <span>${esc(t("evaWaypointsTitle"))} (${wpList.length})</span>
              <span class="insp-collapse-chevron">▾</span>
            </summary>
            <div class="insp-collapse-body">
              <div class="wp-strip">${chipsHtml}</div>
              ${detailHtml}
            </div>
          </details>
        `);
      }

      return parts.join("");
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
        : { valid: false, missingKeys: ["o2", "energy", "water"], mode: state.expeditionMode || "rover-crew", profile: { minSpeedKmH: 4, maxSpeedKmH: 19, defaultSpeedKmH: 14.5 }, normalized: { startO2Pct: 0, startEnergyPct: 0 } });
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
      const activeOrigin = uiMeta.activeOrigin || state.customOrigin || { name: t("originWord"), lat: -4.59, lon: 137.44 };
      const activeDest = uiMeta.activeDestination || state.customDestination || { name: "Jezero", lat: 18.44, lon: 77.45 };
      const pickingDest = uiMeta.pickMode === "destination";
      const backendLoading = Boolean(uiMeta.backendLoading);
      const hasBackendResponse = Boolean(pri && paramCheck.valid && state.missionParamsConfirmed);

      const shortOrigin = this._shortPlace(activeOrigin.name, t("originWord"));
      const shortDest = this._shortPlace(activeDest.name, t("destWord"));
      const originLabelLine = `${shortOrigin} (${Number(activeOrigin.lat).toFixed(1)}°, ${Number(activeOrigin.lon).toFixed(1)}°)`;

      const targetOptions = (landingSites || [])
        .filter((s) => s.id !== "curiosity-gale")
        .map((s) => `
          <option value="${esc(s.id)}" ${(!state.useCustomCoordinates && s.id === state.globalTargetId) ? "selected" : ""}>
            ${esc(s.name)}
          </option>
        `).join("");

      const shortDur = this._formatShortDur(pri, t);
      const solHint = pri && pri.totalHours >= 24 ? `~${Math.floor(pri.totalHours / 24)} Sol` : "";
      const toggleMetaHtml = hasBackendResponse
        ? `<span class="insp-toggle-meta">${esc(shortDur)} · ${this._formatKm(pri.totalKm)} km</span>`
        : "";

      const radZone = (Array.isArray(radZones) && radZones[0]) || null;
      const wpList = Array.isArray(waypoints) ? waypoints : [];
      const miss = (k) => (paramAttempted && paramCheck.missingKeys.includes(k) ? "inp-missing" : "");
      const showGateAlert = Boolean(paramAttempted && !paramCheck.valid);
      const reserveAlert = this._buildReserveAlert(pri, t);

      const resultsHtml = hasBackendResponse ? `
        <div class="route-card primary">
          <div class="route-card-top">
            <span class="route-title-dot">${esc(t("blueRouteTitle"))}</span>
            <span class="route-duration-pill">${this._formatKm(pri.totalKm)} km</span>
          </div>

          <div class="route-kpi-grid">
            <div class="route-kpi">
              <span class="route-kpi-lbl">${esc(t("summaryDurationLabel"))}</span>
              <strong class="route-kpi-val">${esc(shortDur)}</strong>
              ${solHint ? `<span class="route-kpi-sub">${esc(solHint)}</span>` : ""}
            </div>
            <div class="route-kpi ${pri.walkbackO2Alert ? "warn" : ""}">
              <span class="route-kpi-lbl">${esc(t("summaryO2Label"))}</span>
              <strong class="route-kpi-val">${pri.arrivalO2L} L</strong>
              <span class="route-kpi-sub">%${Math.round(pri.arrivalO2Pct ?? 0)}</span>
            </div>
            <div class="route-kpi ${pri.batteryReserveAlert ? "warn" : ""}">
              <span class="route-kpi-lbl">${esc(t("summaryEnergyLabel"))}</span>
              <strong class="route-kpi-val">${pri.arrivalEnergyKwh} kWh</strong>
              <span class="route-kpi-sub">%${Math.round(pri.arrivalEnergyPct ?? 0)}</span>
            </div>
          </div>

          <div class="route-sub-line">
            ${esc(t("summaryWaterLabel"))}: <strong>${pri.arrivalWaterL} L</strong> · ${esc(t("summarySpeedLabel"))}: <strong>${pri.avgSpeedKmH} km/sa</strong>
          </div>

          ${reserveAlert ? `<div class="walkback-alert-box">${esc(reserveAlert)}</div>` : ""}
        </div>

        <button type="button" class="insp-start-btn" id="btn-start-joint-journey">
          ${esc(t("startJointJourneyBtn"))}
        </button>

        ${sec ? `
          <div class="route-card secondary">
            <span>${esc(t("routeAltShort"))}</span>
            <strong>${this._formatKm(sec.totalKm)} km · ${esc(this._formatShortDur(sec, t))}</strong>
          </div>
        ` : ""}

        ${this._renderCollapsibles({ state, activeTabRoute, pri, sec, showSecTab, radZone, wpList, selectedWp, t, esc })}
      ` : "";

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>${esc(t("inspToggleBtn"))}</span>
          ${toggleMetaHtml}
          <span class="insp-caret">${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="${esc(t("inspToggleBtn"))}" ${dirAttr}>
          <div class="insp-head">
            <div class="insp-title" title="${esc(`${shortOrigin} → ${shortDest}`)}">${esc(shortOrigin)} → ${esc(shortDest)}</div>
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

          <div class="insp-setup-box">
            <div class="insp-endpoint-row">
              <span class="insp-row-k">${esc(t("originPresetLabel"))}</span>
              <span class="insp-row-v">${esc(originLabelLine)}</span>
            </div>

            <div class="insp-target-row">
              <select class="insp-select" id="sel-target" aria-label="${esc(t("targetPresetLabel"))}">
                ${state.useCustomCoordinates ? `<option value="__custom__" selected>${esc(this._formatCustomDest(activeDest, t))}</option>` : ""}
                ${targetOptions}
              </select>
              <button type="button" class="insp-pick-btn ${pickingDest ? "active" : ""}" id="btn-pick-destination" title="${esc(t("pickDestBtn"))}">
                ${pickingDest ? esc(t("pickShortActive")) : `📍 ${esc(t("pickShortBtn"))}`}
              </button>
            </div>

            <div class="insp-param-grid">
              <div class="insp-param-cell">
                <label for="inp-mission-o2">
                  <span>${esc(t("paramO2Label"))}</span>
                  <span class="insp-cap-pct" id="insp-o2-cap-pct">${rawO2 ? `%${paramCheck.normalized.startO2Pct}` : ""}</span>
                </label>
                <input type="number" id="inp-mission-o2" class="${miss("o2")}" min="1" max="3000" step="10"
                       value="${esc(rawO2)}" placeholder="${esc(t("paramRequiredPlaceholder"))}" />
              </div>
              <div class="insp-param-cell">
                <label for="inp-mission-energy">
                  <span>${esc(t("paramEnergyLabel"))}</span>
                  <span class="insp-cap-pct" id="insp-energy-cap-pct">${rawEnergy ? `%${paramCheck.normalized.startEnergyPct}` : ""}</span>
                </label>
                <input type="number" id="inp-mission-energy" class="${miss("energy")}" min="0.5" max="300" step="0.5"
                       value="${esc(rawEnergy)}" placeholder="${esc(t("paramRequiredPlaceholder"))}" />
              </div>
              <div class="insp-param-cell">
                <label for="inp-mission-water">${esc(t("paramWaterLabel"))}</label>
                <input type="number" id="inp-mission-water" class="${miss("water")}" min="0.5" max="200" step="0.5"
                       value="${esc(rawWater)}" placeholder="${esc(t("paramRequiredPlaceholder"))}" />
              </div>
              <div class="insp-param-cell">
                <label for="inp-mission-speed">${esc(t("paramSpeedLabel"))}</label>
                <input type="number" id="inp-mission-speed" class="${miss("speed")}" min="${prof.minSpeedKmH}" max="${prof.maxSpeedKmH}" step="0.1"
                       value="${esc(rawSpeed)}" />
              </div>
            </div>

            <div class="insp-gate-alert ${showGateAlert ? "" : "hidden"}" id="insp-param-alert">
              ⚠ ${esc(t("paramGateAlert"))}
            </div>

            <button type="button" class="insp-calc-btn" id="btn-send-backend-route">
              ${esc(backendLoading ? t("calculatingShort") : t("calcRouteBtn"))}
            </button>
          </div>

          ${resultsHtml}
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

    /** Kullanici yazarken odak bozmadan kapasite % ve kapi uyarisini gunceller */
    syncParamGateUi(state, paramCheck, paramAttempted = false) {
      if (!this.mountEl) return;
      const o2PctEl = this.mountEl.querySelector("#insp-o2-cap-pct");
      const enPctEl = this.mountEl.querySelector("#insp-energy-cap-pct");
      if (o2PctEl) o2PctEl.textContent = state.oxygenReserveLiters > 0 ? `%${paramCheck.normalized.startO2Pct}` : "";
      if (enPctEl) enPctEl.textContent = state.energyReserveKwh > 0 ? `%${paramCheck.normalized.startEnergyPct}` : "";

      const missing = paramCheck.missingKeys || [];
      const map = { o2: "#inp-mission-o2", energy: "#inp-mission-energy", water: "#inp-mission-water", speed: "#inp-mission-speed" };
      Object.keys(map).forEach((k) => {
        const inp = this.mountEl.querySelector(map[k]);
        if (inp) inp.classList.toggle("inp-missing", Boolean(paramAttempted && missing.includes(k)));
      });
      const alertEl = this.mountEl.querySelector("#insp-param-alert");
      if (alertEl) alertEl.classList.toggle("hidden", !Boolean(paramAttempted && !paramCheck.valid));
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

      this.mountEl.querySelectorAll("[data-collapse-key]").forEach((det) => {
        det.addEventListener("toggle", () => {
          const key = det.getAttribute("data-collapse-key");
          if (!key) return;
          if (det.open) this._openSections.add(key);
          else this._openSections.delete(key);
        });
      });

      this.mountEl.querySelectorAll("[data-wp-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handlers.onSelectWaypoint?.(btn.getAttribute("data-wp-id"));
        });
      });

      this.mountEl.querySelectorAll("[data-step-tab]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handlers.onChangeStepTab?.(btn.getAttribute("data-step-tab"));
        });
      });

      this.mountEl.querySelectorAll("[data-step-lat]").forEach((row) => {
        row.addEventListener("click", () => {
          const lat = parseFloat(row.getAttribute("data-step-lat"));
          const lon = parseFloat(row.getAttribute("data-step-lon"));
          if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
            this.handlers.onFocusCoords?.(lat, lon);
          }
        });
      });
    }
  }

  ns.RouteInspectorPanel = RouteInspectorPanel;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-14: JSDoc sadelestirilmis sag ust Rota Planlayici sinifi ve constructor.
   - Satir 16-71: Metin/sure kisaltma, adim metni temizleme ve oz rezerv uyari yardimcilari.
   - Satir 73-147: _renderCollapsibles; varsayilan kapali acilir Adimlar, Radyasyon ve krater-ici Duraklar bolumleri.
   - Satir 149-292: render; tek satirli baslik, kompakt kurulum kutusu, 3'lu KPI rota ozeti ve Yolculugu Baslat butonu.
   - Satir 294-370: syncParamGateUi ve bindEvents; canli girdi dogrulamasi, hedef secimi ve acilir bolum durum korumasi.
   ========================================================================== */
