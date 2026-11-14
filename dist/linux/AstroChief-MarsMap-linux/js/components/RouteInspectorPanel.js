/**
 * @file RouteInspectorPanel.js
 * @description Sag ustte yer alan sadelestirilmis Rota Planlayici:
 * Sabit Bulundugumuz Konum -> Secilen Hedef Konum ve Rust Backend istek/yanit paneli (10 dil destekli).
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
      const dirAttr = (i18n && i18n.isRtl()) ? 'dir="rtl"' : 'dir="ltr"';

      const pri = computedRoutes?.primaryBlue || null;
      const sec = computedRoutes?.secondaryPaleBlue || null;
      const activeOrigin = uiMeta.activeOrigin || state.customOrigin || { name: t("originWord"), lat: -4.59, lon: 137.44 };
      const activeDest = uiMeta.activeDestination || state.customDestination || { name: "Jezero", lat: 18.44, lon: 77.45 };
      const pickingDest = uiMeta.pickMode === "destination";
      const backendLoading = Boolean(uiMeta.backendLoading);
      const latencyMs = typeof uiMeta.backendLatencyMs === "number" ? uiMeta.backendLatencyMs : null;
      const hasBackendResponse = Boolean(pri);

      const sourceLabel = backendLoading
        ? t("srcRustComputing")
        : (hasBackendResponse ? t("srcRustBackend") : t("latWaiting"));
      const latencyLabel = latencyMs !== null ? `⏱ ${latencyMs} ms` : t("latWaiting");
      const latencyClass = latencyMs !== null ? (latencyMs > 500 ? "slow" : "") : "offline";

      const targetOptions = (landingSites || [])
        .filter((s) => s.id !== "curiosity-gale")
        .map((s) => `
          <option value="${s.id}" ${(!state.useCustomCoordinates && s.id === state.globalTargetId) ? "selected" : ""}>
            ${s.name} (${s.latitude.toFixed(1)}°, ${s.longitude.toFixed(1)}°)
          </option>
        `).join("");

      const routeBadge = pri ? `${pri.formattedDuration} · ${pri.totalKm.toFixed(0)} km` : t("routeReady");
      const stepTab = state.activeStepRouteTab === "secondary" ? "secondary" : "primary";
      const activeStepRoute = stepTab === "secondary" ? (sec || pri) : pri;
      const stepRowsHtml = ((activeStepRoute && activeStepRoute.steps) || []).map((s) => `
        <div class="step-row" data-step-lat="${s.lat}" data-step-lon="${s.lon}" title="${t("stepFocusTitle")}">
          <div class="step-row-top">
            <span>#${s.step} · ${s.instruction}</span>
          </div>
          <div class="step-row-meta">
            ${Number(s.lat).toFixed(2)}°, ${Number(s.lon).toFixed(2)}° · ${s.elevM} m · ${t("slopeWord")} ${s.slopeDeg}° · ${s.distKm} km
          </div>
          ${s.hazardWarning ? `<div class="step-row-warn">⚠ ${s.hazardWarning}</div>` : ""}
        </div>
      `).join("");

      const endpointUrl = `${state.backendApiUrl || "http://127.0.0.1:8080"}/api/v1/route`;
      const reqPreviewObj = uiMeta.lastRequestPayload
        ? {
            origin: uiMeta.lastRequestPayload.origin,
            destination: uiMeta.lastRequestPayload.destination,
            factors: uiMeta.lastRequestPayload.factors
          }
        : {
            origin: { name: activeOrigin.name, lat: Number(activeOrigin.lat.toFixed(4)), lon: Number(activeOrigin.lon.toFixed(4)) },
            destination: { name: activeDest.name, lat: Number(activeDest.lat.toFixed(4)), lon: Number(activeDest.lon.toFixed(4)) },
            factors: {
              acidRain: { enabled: state.filterAcidRain, intensity: state.acidIntensity },
              dustStorm: { enabled: state.filterDustStorm, intensity: state.stormIntensity },
              radiation: { enabled: state.showRadiationZones }
            }
          };

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>${t("inspToggleBtn")}</span>
          <span style="color:var(--mars-red);">${routeBadge}</span>
          <span class="insp-latency-pill ${latencyClass}" id="insp-latency-pill" title="${t("latTitle")}">${latencyLabel}</span>
          <span>${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="${t("inspToggleBtn")}" ${dirAttr}>
          <div class="insp-head">
            <div>
              <span class="insp-badge">${t("scopeGlobalBadge")}</span>
              <div class="insp-title">${t("originWord")} → ${t("destWord")}</div>
            </div>
            <span class="insp-source-pill ${hasBackendResponse ? "rust" : ""}">${sourceLabel}</span>
          </div>

          <div class="insp-coord-box">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;background:var(--bg-white);padding:6px 8px;border-radius:5px;border:1px solid var(--line-light);">
              <span>📍 <strong>${t("originPresetLabel")}:</strong></span>
              <span style="font-weight:800;color:var(--route-blue);">Gale (${Number(activeOrigin.lat).toFixed(2)}°, ${Number(activeOrigin.lon).toFixed(2)}°)</span>
            </div>

            <div class="insp-select-wrap">
              <label for="sel-target">🎯 ${t("targetPresetLabel")} (${Number(activeDest.lat).toFixed(2)}°, ${Number(activeDest.lon).toFixed(2)}°)</label>
              <select class="insp-select" id="sel-target">
                ${state.useCustomCoordinates ? `<option value="__custom__" selected>${t("destWord")} (${Number(activeDest.lat).toFixed(2)}°, ${Number(activeDest.lon).toFixed(2)}°)</option>` : ""}
                ${targetOptions}
              </select>
            </div>

            <button type="button" class="insp-pick-btn ${pickingDest ? "active" : ""}" id="btn-pick-destination" style="width:100%;padding:6px 10px;font-size:11.5px;">
              ${pickingDest ? t("pickDestActive") : t("pickDestBtn")}
            </button>

            <button type="button" class="insp-calc-btn" id="btn-send-backend-route">
              ${backendLoading ? t("srcRustComputing") : `🚀 ${t("calcRouteBtn")}`}
            </button>
          </div>

          ${hasBackendResponse ? `
            <div class="route-card primary">
              <div class="route-card-top">
                <span style="color:var(--route-blue);">${t("blueRouteTitle")}</span>
                <span class="route-duration-pill">${pri.formattedDuration}</span>
              </div>
              <div class="route-metrics-line">${pri.totalKm.toFixed(1)} km · ${pri.o2Liters} L O₂ · ${pri.waterLiters} L ${t("waterUnit")}</div>
              <div class="route-comment-line">${pri.comment}</div>
            </div>

            ${sec ? `
              <div class="route-card secondary">
                <div class="route-card-top">
                  <span style="color:#1d4ed8;">${t("paleRouteTitle")}</span>
                  <span class="route-duration-pill">${sec.formattedDuration}</span>
                </div>
                <div class="route-metrics-line">${sec.totalKm.toFixed(1)} km · ${sec.o2Liters} L O₂ · ${sec.waterLiters} L ${t("waterUnit")}</div>
                <div class="route-comment-line">${sec.comment}</div>
              </div>
            ` : ""}

            ${stepRowsHtml ? `
              <div class="step-panel">
                <div style="font-size:10.5px;font-weight:900;color:var(--ink-black);">STEP-BY-STEP</div>
                ${sec ? `
                  <div class="step-tabs">
                    <button type="button" class="step-tab-btn ${stepTab === "primary" ? "active" : ""}" data-step-tab="primary">
                      ${t("stepTabPrimary", { count: (pri && pri.steps) ? pri.steps.length : 0 })}
                    </button>
                    <button type="button" class="step-tab-btn ${stepTab === "secondary" ? "active" : ""}" data-step-tab="secondary">
                      ${t("stepTabSecondary", { count: (sec && sec.steps) ? sec.steps.length : 0 })}
                    </button>
                  </div>
                ` : ""}
                <div class="step-list">${stepRowsHtml}</div>
              </div>
            ` : ""}
          ` : `
            <div class="step-panel" style="gap:4px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:10.5px;font-weight:900;color:var(--ink-black);">${t("backendTitle")}</span>
                <span style="font-size:9.5px;font-weight:800;color:var(--mars-red);">POST /api/v1/route</span>
              </div>
              <div style="font-size:10.5px;color:var(--ink-muted);">
                ${uiMeta.backendStatusText || t("backendReady")}
              </div>
              <div style="font-size:9.5px;font-weight:700;color:var(--ink-dark);word-break:break-all;" dir="ltr">${endpointUrl}</div>
              <pre id="backend-request-preview" dir="ltr" style="margin:2px 0 0;padding:6px;background:var(--bg-white);border:1px solid var(--line-light);border-radius:4px;font-size:9.5px;max-height:130px;overflow:auto;color:var(--ink-black);">${JSON.stringify(reqPreviewObj, null, 2)}</pre>
            </div>
          `}
        </aside>
      `;

      this.bindEvents(state);
    }

    bindEvents(state) {
      this.mountEl.querySelector("#btn-toggle-inspector")?.addEventListener("click", () => {
        this.handlers.onToggleInspector?.(!state.inspectorOpen);
      });

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
   - Satir 1-5: JSDoc sadelestirilmis sag ust Rota Planlayici (Konumumuz -> Hedef ve Backend istek/yanit) tanimi (10 dil destekli).
   - Satir 7-14: constructor; baglanti elemani ve geri cagirilari saklar.
   - Satir 15-172: render; Konumumuz gostergesini, Hedef secimini, Backend istek gonderme butonunu ve yanit geldiginde adimlari cizer.
   - Satir 174-212: bindEvents; hedef secimi, haritadan hedef tiklama, backend istek gonderme ve adim odaklama dugmelerini baglar.
   ========================================================================== */
