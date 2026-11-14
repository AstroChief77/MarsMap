/**
 * @file RouteInspectorPanel.js
 * @description Sag ustte yer alan Rota Planlayici:
 * Bulundugumuz Konum -> Secilen Hedef Konum, Litre/km-m/Saat/Alfa-Beta-Gama Foton telemetrisi ve Rust Backend istek/yanit paneli (9 dil destekli).
 */

(function (ns) {
  "use strict";
  class RouteInspectorPanel {
    constructor(mountEl, handlers) {
      this.mountEl = mountEl;
      this.handlers = handlers;
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
      const paramsReady = Boolean(paramCheck.valid && state.missionParamsConfirmed);

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
      const latencyMs = typeof uiMeta.backendLatencyMs === "number" ? uiMeta.backendLatencyMs : null;
      const hasBackendResponse = Boolean(pri && paramCheck.valid && state.missionParamsConfirmed);

      const latencyLabel = latencyMs !== null
        ? `⏱ ${latencyMs} ms`
        : (state.backendApiUrl ? `⏱ ${t("inspNoConnection")}` : `⏱ ${t("inspLocalBadge")}`);
      const latencyClass = latencyMs !== null ? (latencyMs > 500 ? "slow" : "") : "offline";

      const targetOptions = (landingSites || [])
        .filter((s) => s.id !== "curiosity-gale")
        .map((s) => `
          <option value="${esc(s.id)}" ${(!state.useCustomCoordinates && s.id === state.globalTargetId) ? "selected" : ""}>
            ${esc(s.name)} (${Number(s.latitude).toFixed(1)}°, ${Number(s.longitude).toFixed(1)}°)
          </option>
        `).join("");

      const routeBadge = hasBackendResponse ? `${pri.totalMinutes} ${t("minsUnit")} · ${pri.totalKm.toFixed(0)} km` : esc(t("routeReady"));
      const stepRowsHtml = ((activeTabRoute && activeTabRoute.steps) || []).map((s) => `
        <div class="step-row" data-step-lat="${Number(s.lat)}" data-step-lon="${Number(s.lon)}" title="${esc(t("stepFocusTitle"))}">
          <div class="step-row-top">
            <span>#${Number(s.step)} · ${esc(s.instruction)}</span>
          </div>
          <div class="step-row-meta">
            ${Number(s.lat).toFixed(2)}°, ${Number(s.lon).toFixed(2)}° · ${Number(s.elevM)} m · ${esc(t("slopeWord"))} ${Number(s.slopeDeg)}° · ${Number(s.distKm)} km
          </div>
          ${s.hazardWarning ? `<div class="step-row-warn">⚠ ${esc(s.hazardWarning)}</div>` : ""}
        </div>
      `).join("");

      const radZone = (Array.isArray(radZones) && radZones[0]) || null;
      const radSummaryHtml = radZone ? `
        <div class="rad-panel">
          <div class="rad-panel-head">☢ ${esc(radZone.name || t("photonRadiation"))}</div>
          <div class="rad-grid">
            <div><span>${esc(t("radAlpha"))}</span><strong>${esc(radZone.alphaLevel || "0.14 μSv/s")}</strong></div>
            <div><span>${esc(t("radBeta"))}</span><strong>${esc(radZone.betaLevel || "1.65 mSv/h")}</strong></div>
            <div><span>${esc(t("radGamma"))}</span><strong>${esc(radZone.gammaLevel || "0.82 mSv/h")}</strong></div>
            <div><span>${esc(t("radPhotonFlux"))}</span><strong>${esc(radZone.photonFlux || "⚡ 4.2×10⁴/cm²s")}</strong></div>
          </div>
        </div>
      ` : "";

      const wpList = Array.isArray(waypoints) ? waypoints : [];
      const wpChipsHtml = wpList.length > 0 ? `
        <div class="wp-strip" aria-label="${esc(t("evaWaypointsTitle"))}">
          ${wpList.slice(0, 6).map((w) => `
            <button type="button" data-wp-id="${esc(w.id)}"
                    class="wp-chip ${selectedWp && selectedWp.id === w.id ? "active" : ""}">
              ${esc(w.name)} (${Number(w.elev || 0)}m)
            </button>
          `).join("")}
        </div>
      ` : "";

      const wpDetailHtml = selectedWp ? `
        <div class="wp-detail-box">
          <div style="font-weight:900;color:var(--ink-black);">
            ⚑ ${esc(selectedWp.name)} · ${esc(t("wpSolLabel"))} ${Number(selectedWp.sol || 0)} (${Number(selectedWp.elev || 0)} m · ${esc(t("slopeWord"))} ${Number(selectedWp.slope || 0)}°)
          </div>
          <div><strong>${esc(t("wpGeologyLabel"))}</strong> ${esc(selectedWp.geology || "")}</div>
          <div><strong>${esc(t("wpScienceLabel"))}:</strong> ${esc(selectedWp.science || "")}</div>
          <div><strong>${esc(t("wpSafetyLabel"))}</strong> ${esc(selectedWp.hazardNote || "")}</div>
          ${selectedWp.imageUrl ? `<img class="wp-photo" src="${esc(selectedWp.imageUrl)}" alt="${esc(selectedWp.imageCaption || selectedWp.name)}" decoding="async" />` : ""}
        </div>
      ` : "";

      const miss = (k) => (paramAttempted && paramCheck.missingKeys.includes(k) ? "inp-missing" : "");

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>${esc(t("inspToggleBtn"))}</span>
          <span style="color:var(--mars-red);">${routeBadge}</span>
          <span>${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="${esc(t("inspToggleBtn"))}" ${dirAttr}>
          <div class="insp-head">
            <div>
              <div class="insp-title">${esc(t("originWord"))} → ${esc(t("destWord"))}</div>
              <div class="insp-sub">🚙🧑‍🚀 ${esc(t(mode === "joint-eva-escort" ? "modeJointEva" : "modeRoverCrew"))}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
              <span class="insp-badge">${esc(t("scopeGlobalBadge"))}</span>
              <span class="insp-latency-pill ${latencyClass}" id="insp-latency-pill-card" title="${esc(t("latTitle"))}">${esc(latencyLabel)}</span>
            </div>
          </div>

          <div class="insp-param-box">
            <div class="insp-param-title">${esc(t("paramSectionTitle"))}</div>
            <div class="insp-mode-grid">
              <button type="button" class="insp-mode-btn ${mode === "rover-crew" ? "active" : ""}" data-expedition-mode="rover-crew" title="${esc(t("modeRoverCrewDesc"))}">
                🚙🧑‍🚀 ${esc(t("modeRoverCrew"))}
              </button>
              <button type="button" class="insp-mode-btn ${mode === "joint-eva-escort" ? "active" : ""}" data-expedition-mode="joint-eva-escort" title="${esc(t("modeJointEvaDesc"))}">
                🚙🥾 ${esc(t("modeJointEva"))}
              </button>
            </div>

            <div class="insp-param-grid">
              <div class="insp-param-cell">
                <label for="inp-mission-o2">
                  <span>${esc(t("paramO2Label"))}</span>
                  <span class="insp-cap-pct" id="insp-o2-cap-pct">${rawO2 ? `%${paramCheck.normalized.startO2Pct}` : "—"}</span>
                </label>
                <input type="number" id="inp-mission-o2" class="${miss("o2")}" min="1" max="3000" step="10"
                       value="${esc(rawO2)}" placeholder="${esc(t("paramRequiredPlaceholder"))}" />
              </div>
              <div class="insp-param-cell">
                <label for="inp-mission-energy">
                  <span>${esc(t("paramEnergyLabel"))}</span>
                  <span class="insp-cap-pct" id="insp-energy-cap-pct">${rawEnergy ? `%${paramCheck.normalized.startEnergyPct}` : "—"}</span>
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

            <div class="insp-gate-alert ${paramsReady ? "hidden" : ""}" id="insp-param-alert">
              ⚠ ${esc(t("paramGateAlert"))}
            </div>
          </div>

          <div class="insp-coord-box">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;background:var(--bg-white);padding:6px 8px;border-radius:5px;border:1px solid var(--line-light);">
              <span>📍 <strong>${esc(t("originPresetLabel"))}:</strong></span>
              <span style="font-weight:800;color:var(--route-blue);">${esc(activeOrigin.name || "Gale")} (${Number(activeOrigin.lat).toFixed(2)}°, ${Number(activeOrigin.lon).toFixed(2)}°)</span>
            </div>

            <div class="insp-select-wrap">
              <label for="sel-target">🎯 ${esc(t("targetPresetLabel"))} (${Number(activeDest.lat).toFixed(2)}°, ${Number(activeDest.lon).toFixed(2)}°)</label>
              <select class="insp-select" id="sel-target">
                ${state.useCustomCoordinates ? `<option value="__custom__" selected>${esc(activeDest.name || t("destWord"))} (${Number(activeDest.lat).toFixed(2)}°, ${Number(activeDest.lon).toFixed(2)}°)</option>` : ""}
                ${targetOptions}
              </select>
            </div>

            <button type="button" class="insp-pick-btn ${pickingDest ? "active" : ""}" id="btn-pick-destination" style="width:100%;padding:6px 10px;font-size:11.5px;">
              ${esc(pickingDest ? t("pickDestActive") : t("pickDestBtn"))}
            </button>

            <button type="button" class="insp-calc-btn" id="btn-send-backend-route">
              ${esc(backendLoading ? t("srcRustComputing") : `🚀 ${t("calcRouteBtn")}`)}
            </button>
          </div>

          ${hasBackendResponse ? `
            <div class="route-card primary">
              <div class="route-card-top">
                <span style="color:var(--route-blue);">${esc(t("blueRouteTitle"))}</span>
                <span class="route-duration-pill">${pri.totalMinutes} ${esc(t("minsUnit"))} · ${pri.totalKm.toFixed(1)} km</span>
              </div>
              <div class="route-summary-grid">
                <div class="route-sum-row"><span>${esc(t("summaryDurationLabel"))}:</span><strong>${pri.totalMinutes} ${esc(t("minsUnit"))} (${esc(pri.formattedDuration)})</strong></div>
                <div class="route-sum-row"><span>${esc(t("summarySpeedLabel"))}:</span><strong>${pri.avgSpeedKmH} km/sa (${pri.speedMPerMin} m/dk)</strong></div>
                <div class="route-sum-row"><span>${esc(t("summaryO2Label"))}:</span><strong>%${pri.startO2Pct} (${pri.startO2L} L) → ${pri.arrivalO2L} L (%${pri.arrivalO2Pct})</strong></div>
                <div class="route-sum-row"><span>${esc(t("summaryEnergyLabel"))}:</span><strong>%${pri.startEnergyPct} (${pri.startEnergyKwh} kWh) → ${pri.arrivalEnergyKwh} kWh (%${pri.arrivalEnergyPct})</strong></div>
                <div class="route-sum-row"><span>${esc(t("summaryWaterLabel"))}:</span><strong>${pri.startWaterL} L → ${pri.arrivalWaterL} L</strong></div>
              </div>
              ${(pri.walkbackO2Alert || pri.batteryReserveAlert) ? `
                <div class="walkback-alert-box">
                  ${pri.walkbackO2Alert ? `<div>⚠ ${esc(t("walkbackO2Warn"))}</div>` : ""}
                  ${pri.batteryReserveAlert ? `<div>⚡ ${esc(t("walkbackBatteryWarn"))}</div>` : ""}
                </div>
              ` : ""}
            </div>

            <button type="button" class="insp-start-btn" id="btn-start-joint-journey">
              ${esc(t("startJointJourneyBtn"))}
            </button>

            ${sec ? `
              <div class="route-card secondary">
                <div class="route-card-top">
                  <span style="color:var(--route-pale-blue);">${esc(t("paleRouteTitle"))}</span>
                  <span class="route-duration-pill">${sec.totalMinutes || Math.round((sec.totalHours || 0) * 60)} ${esc(t("minsUnit"))}</span>
                </div>
                <div class="route-metrics-line">${sec.totalKm.toFixed(1)} km · ${esc(sec.formattedDuration)} · %${sec.arrivalO2Pct ?? 0} O₂</div>
              </div>
            ` : ""}

            ${radSummaryHtml}
            ${wpChipsHtml}
            ${wpDetailHtml}

            ${stepRowsHtml ? `
              <div class="step-panel">
                <div class="step-tabs">
                  <button type="button" class="step-tab-btn ${!showSecTab ? "active" : ""}" data-step-tab="primary">${esc(t("stepTabPrimary", { count: (pri?.steps || []).length }))}</button>
                  ${sec ? `<button type="button" class="step-tab-btn ${showSecTab ? "active" : ""}" data-step-tab="secondary">${esc(t("stepTabSecondary", { count: (sec?.steps || []).length }))}</button>` : ""}
                </div>
                <div class="step-list">${stepRowsHtml}</div>
              </div>
            ` : ""}
          ` : `
            <div class="step-panel" style="font-size:11px;color:var(--ink-muted);">
              ${esc(t("noRouteAwaitingParams"))}
            </div>
          `}
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

    /** Kullanici yazarken input odagini bozmadan sadece kapi uyarisi ve kapasite % etiketlerini gunceller */
    syncParamGateUi(state, paramCheck, paramAttempted = false) {
      if (!this.mountEl) return;
      const o2PctEl = this.mountEl.querySelector("#insp-o2-cap-pct");
      const enPctEl = this.mountEl.querySelector("#insp-energy-cap-pct");
      if (o2PctEl) o2PctEl.textContent = state.oxygenReserveLiters > 0 ? `%${paramCheck.normalized.startO2Pct}` : "—";
      if (enPctEl) enPctEl.textContent = state.energyReserveKwh > 0 ? `%${paramCheck.normalized.startEnergyPct}` : "—";

      const missing = paramCheck.missingKeys || [];
      const map = { o2: "#inp-mission-o2", energy: "#inp-mission-energy", water: "#inp-mission-water", speed: "#inp-mission-speed" };
      Object.keys(map).forEach((k) => {
        const inp = this.mountEl.querySelector(map[k]);
        if (inp) inp.classList.toggle("inp-missing", Boolean(paramAttempted && missing.includes(k)));
      });
      const alertEl = this.mountEl.querySelector("#insp-param-alert");
      if (alertEl) alertEl.classList.toggle("hidden", Boolean(paramCheck.valid && state.missionParamsConfirmed));
    }

    bindEvents(state) {
      this.mountEl.querySelector("#btn-toggle-inspector")?.addEventListener("click", () => {
        this.handlers.onToggleInspector?.(!state.inspectorOpen);
      });

      this.mountEl.querySelectorAll("[data-expedition-mode]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handlers.onChangeExpeditionMode?.(btn.getAttribute("data-expedition-mode"));
        });
      });

      const bindParam = (id, key) => {
        this.mountEl.querySelector(id)?.addEventListener("input", (e) => {
          this.handlers.onChangeMissionParam?.(key, e.target.value);
        });
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
   - Satir 1-14: JSDoc sag ust Rota Planlayici, zorunlu on-gorev parametre kapisi ve ortak sefer paneli constructor.
   - Satir 15-269: render; Rover+Ekip / Rover+Yaya EVA mod secici, O2/Enerji/Su/Hiz girisleri, 5sn gecikme rozeti, dk/km-sa/%O2-L/kWh varis ozeti, %20 Walkback uyarisi, ortak sefer baslatma ve EVA durak foto kartini cizer.
   - Satir 271-287: syncParamGateUi; odak bozmadan O2/Enerji kapasite % etiketlerini ve zorunlu girdi uyarisini canli gunceller.
   - Satir 289-352: bindEvents; sefer modu, on-gorev sayisal girisleri, rota hesabi, ortak yolculuk baslatma ve EVA durak secimlerini baglar.
   ========================================================================== */
