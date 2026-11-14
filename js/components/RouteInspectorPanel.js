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

      const pri = computedRoutes?.primaryBlue || null;
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
          <option value="${esc(s.id)}" ${(!state.useCustomCoordinates && s.id === state.globalTargetId) ? "selected" : ""}>
            ${esc(s.name)} (${Number(s.latitude).toFixed(1)}°, ${Number(s.longitude).toFixed(1)}°)
          </option>
        `).join("");

      const routeBadge = pri ? `${esc(pri.formattedDuration)} · ${pri.totalKm.toFixed(0)} km` : esc(t("routeReady"));
      const stepRowsHtml = ((pri && pri.steps) || []).map((s) => `
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

      const o2Max = Number(state.oxygenReserveLiters || 420);
      const waterMax = Number(state.waterReserveLiters || 24);
      const o2Over = pri ? pri.o2Liters > o2Max : false;
      const waterOver = pri ? pri.waterLiters > waterMax : false;
      const totalMeters = pri ? (pri.totalMeters || Math.round(pri.totalKm * 1000)) : 0;

      const radZone = (Array.isArray(radZones) && radZones[0]) || null;
      const radSummaryHtml = radZone ? `
        <div style="font-size:10px;background:var(--bg-solid-white);border:1px solid var(--line-light);border-radius:6px;padding:5px 7px;color:var(--ink-dark);">
          ☢ <strong>${esc(radZone.name || t("photonRadiation"))}:</strong>
          ${esc(radZone.alphaLevel || "0.14 μSv/s (α)")} · ${esc(radZone.betaLevel || "1.65 mSv/h (β)")} · ${esc(radZone.gammaLevel || "0.82 mSv/h (γ)")}
          ${radZone.photonFlux ? ` · ⚡ ${esc(radZone.photonFlux)}` : ""}
        </div>
      ` : "";

      const wpChipsHtml = Array.isArray(waypoints) && waypoints.length > 0 ? `
        <div class="wp-strip">
          ${waypoints.slice(0, 4).map((w) => {
            const isSel = selectedWp && selectedWp.id === w.id;
            return `
            <button type="button" class="wp-chip ${isSel ? "active" : ""}" data-wp-id="${esc(w.id)}">
              ${esc(w.name)} (${Number(w.elev || 0)}m)
            </button>
          `;
          }).join("")}
        </div>
      ` : "";

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>${esc(t("inspToggleBtn"))}</span>
          <span style="color:var(--mars-red);">${routeBadge}</span>
          <span class="insp-latency-pill ${latencyClass}" id="insp-latency-pill" title="${esc(t("latTitle"))}">${esc(latencyLabel)}</span>
          <span>${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="${esc(t("inspToggleBtn"))}" ${dirAttr}>
          <div class="insp-head">
            <div>
              <span class="insp-badge">${esc(t("scopeGlobalBadge"))}</span>
              <div class="insp-title">${esc(t("originWord"))} → ${esc(t("destWord"))}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
              <span class="insp-source-pill ${hasBackendResponse ? "rust" : ""}">${esc(sourceLabel)}</span>
              <span class="insp-latency-pill ${latencyClass}" id="insp-latency-pill-card" title="${esc(t("latTitle"))}">${esc(latencyLabel)}</span>
            </div>
          </div>

          <div class="insp-coord-box">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11.5px;background:var(--bg-solid-white);padding:6px 8px;border-radius:6px;border:1px solid var(--line-light);">
              <span style="white-space:nowrap;">📍 <strong>${esc(t("originPresetLabel"))}:</strong></span>
              <span style="font-weight:800;color:var(--route-blue);text-align:end;">${esc(activeOrigin.name || "Gale")} (${Number(activeOrigin.lat).toFixed(2)}°, ${Number(activeOrigin.lon).toFixed(2)}°)</span>
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
                <span class="route-duration-pill">${esc(pri.formattedDuration)}</span>
              </div>
              <div class="route-metrics-line">${pri.totalKm.toFixed(1)} km (${totalMeters} m) · ${pri.o2Liters}/${o2Max} L O₂ · ${pri.waterLiters}/${waterMax} L ${esc(t("waterUnit"))}</div>
              ${(o2Over || waterOver) ? `<div style="font-size:10px;font-weight:800;color:var(--mars-red);">${esc(t("reserveDeficitAlert"))} ${o2Over ? `O₂ +${pri.o2Liters - o2Max}L ` : ""}${waterOver ? `${esc(t("waterUnit"))} +${(pri.waterLiters - waterMax).toFixed(1)}L` : ""}</div>` : ""}
              ${pri.comment ? `<div class="route-comment-line">${esc(pri.comment)}</div>` : ""}
            </div>
            ${radSummaryHtml}
            ${wpChipsHtml}

            ${stepRowsHtml ? `
              <div class="step-panel">
                <div style="font-size:10.5px;font-weight:900;color:var(--ink-black);">${esc(t("stepsHeading"))} (${(pri && pri.steps) ? pri.steps.length : 0})</div>
                <div class="step-list">${stepRowsHtml}</div>
              </div>
            ` : ""}
          ` : `
            <div class="step-panel" style="font-size:11px;color:var(--ink-muted);">
              ${esc(t("stepsEmptyHint"))}
            </div>
          `}
        </aside>
      `;

      const nextStepList = this.mountEl.querySelector(".step-list");
      if (nextStepList && prevStepScroll > 0) nextStepList.scrollTop = prevStepScroll;

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
   - Satir 1-5: JSDoc sag ust Rota Planlayici, 5 sn backend gecikme rozeti ve O2/Su/Radyasyon denetimi tanimi (9 dil destekli).
   - Satir 7-13: constructor; baglanti elemani ve geri cagirilari saklar.
   - Satir 15-163: render; 5 sn #insp-latency-pill ve ayrik .insp-source-pill / #insp-latency-pill-card rozet yigini, Konum/Hedef secimi, Mavi rota metrikleri, O2/Su rezerv uyarisi, Alfa/Beta/Gama + Foton paneli, .wp-chip EVA duraklari ve adimlari cizer.
   - Satir 165-208: bindEvents; hedef secimi, haritadan hedef tiklama, backend istek gonderme, EVA durak ve adim odaklama dugmelerini baglar.
   ========================================================================== */
