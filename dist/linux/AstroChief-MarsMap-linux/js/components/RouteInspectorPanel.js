/**
 * @file RouteInspectorPanel.js
 * @description Sag ustte yer alan acilir/kapanir Rota (Konum A -> Varis B), Step-by-Step adim listesi,
 * Sure (Saat), Mesafe (km/m), Tuketim (Litre) ve Alfa/Beta/Gama Radyasyon inceleme paneli.
 */

(function (ns) {
  "use strict";
  class RouteInspectorPanel {
    /**
     * RouteInspectorPanel yapici metodu
     * @param {HTMLElement} mountEl - #top-right-dock elemani
     * @param {Object} handlers - Rota ve durak secimi geri cagirilari
     */
    constructor(mountEl, handlers) {
      this.mountEl = mountEl;
      this.handlers = handlers;
    }

    /**
     * Mavi/Soluk Mavi rota, A/B koordinat secici ve step-by-step adim listesini DOM'a cizer
     */
    render(state, activeCrater, landingSites, waypoints, selectedWp, computedRoutes, radZones, uiMeta = {}) {
      if (!this.mountEl) return;

      const pri = computedRoutes?.primaryBlue;
      const sec = computedRoutes?.secondaryPaleBlue;
      const activeOrigin = uiMeta.activeOrigin || state.customOrigin || { name: "Gale Krateri", lat: -4.59, lon: 137.44 };
      const activeDest = uiMeta.activeDestination || state.customDestination || { name: "Jezero Krateri", lat: 18.44, lon: 77.45 };
      const pickMode = uiMeta.pickMode || null;
      const backendLoading = Boolean(uiMeta.backendLoading);
      const latencyMs = typeof uiMeta.backendLatencyMs === "number" ? uiMeta.backendLatencyMs : null;
      const isRust = computedRoutes?.source === "rust-backend";
      const sourceLabel = backendLoading
        ? "⏳ Rust Hesaplıyor"
        : (isRust ? "🦀 Rust Backend" : "⚡ Yerel Yedek");
      const latencyLabel = latencyMs !== null
        ? `⏱ ${latencyMs} ms`
        : (state.backendApiUrl ? "⏱ Bekleniyor" : "⏱ Yerel");
      const latencyClass = latencyMs !== null ? (latencyMs > 500 ? "slow" : "") : "offline";

      const rad = (radZones && radZones[0]) || {
        name: "Foton Bombardıman Alanı",
        alphaLevel: "0.14 μSv/s (Alfa α)",
        betaLevel: "1.65 mSv/h (Beta β)",
        gammaLevel: "0.82 mSv/h (Gama γ)",
        photonFlux: "5.4x10^6 MeV/cm²·s"
      };

      const siteOptions = (selectedId) => (landingSites || []).map((s) => `
        <option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${s.name}</option>
      `).join("");

      const wpChips = state.routeScope === "crater" ? (waypoints || []).map((wp) => `
        <button class="wp-chip ${selectedWp?.id === wp.id ? "active" : ""}" data-wp-id="${wp.id}">
          ${wp.name}
        </button>
      `).join("") : "";

      const routeBadge = pri ? `${pri.formattedDuration} · ${pri.totalKm.toFixed(1)} km` : "Rota Hazır";
      const stepTab = state.activeStepRouteTab === "secondary" ? "secondary" : "primary";
      const activeStepRoute = stepTab === "secondary" ? (sec || pri) : pri;
      const stepRowsHtml = ((activeStepRoute && activeStepRoute.steps) || []).map((s) => `
        <div class="step-row" data-step-lat="${s.lat}" data-step-lon="${s.lon}" title="Haritada odakla">
          <div class="step-row-top">
            <span>#${s.step} · ${s.instruction}</span>
          </div>
          <div class="step-row-meta">
            ${Number(s.lat).toFixed(2)}°, ${Number(s.lon).toFixed(2)}° · ${s.elevM} m · Eğim ${s.slopeDeg}° · ${s.distKm} km
          </div>
          ${s.hazardWarning ? `<div class="step-row-warn">⚠ ${s.hazardWarning}</div>` : ""}
        </div>
      `).join("");

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>Rota &amp; Radyasyon</span>
          <span style="color:var(--mars-red);">${routeBadge}</span>
          <span class="insp-latency-pill ${latencyClass}" id="insp-latency-pill" title="Backend Gecikmesi (5sn yenileme)">${latencyLabel}</span>
          <span>${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="Güvenli Rota ve Radyasyon Paneli">
          <div class="insp-head">
            <div>
              <span class="insp-badge">${state.routeScope === "global" ? "KÜRESEL ROTA" : "KRATER EVA"}</span>
              <div class="insp-title">${state.routeScope === "global" ? `${activeOrigin.name} → ${activeDest.name}` : (activeCrater?.name || "Gale Krateri")}</div>
              <div class="insp-sub">
                Asit: <strong>${state.filterAcidRain ? state.acidIntensity : "Kapalı"}</strong> ·
                Fırtına: <strong>${state.filterDustStorm ? state.stormIntensity : "Kapalı"}</strong>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
              <span class="insp-source-pill ${isRust ? "rust" : ""}">${sourceLabel}</span>
              <span class="insp-latency-pill ${latencyClass}" id="insp-latency-pill-card" title="Backend Veri Gecikmesi (5sn)">${latencyLabel}</span>
            </div>
          </div>

          ${state.routeScope === "global" ? `
            <div class="insp-route-selectors">
              <div class="insp-select-wrap">
                <label for="sel-origin">Başlangıç Hazır Nokta</label>
                <select class="insp-select" id="sel-origin">${siteOptions(state.globalOriginId)}</select>
              </div>
              <div class="insp-select-wrap">
                <label for="sel-target">Hedef Hazır Nokta</label>
                <select class="insp-select" id="sel-target">${siteOptions(state.globalTargetId)}</select>
              </div>
            </div>

            <div class="insp-coord-box">
              <div class="insp-pick-row">
                <button type="button" class="insp-pick-btn ${pickMode === "origin" ? "active" : ""}" id="btn-pick-origin">
                  ${pickMode === "origin" ? "Haritaya Tıklayın (A)..." : "📍 Haritadan Konum (A)"}
                </button>
                <button type="button" class="insp-pick-btn ${pickMode === "destination" ? "active" : ""}" id="btn-pick-destination">
                  ${pickMode === "destination" ? "Haritaya Tıklayın (B)..." : "🎯 Haritadan Varış (B)"}
                </button>
              </div>
              <div class="insp-coord-grid">
                <div class="insp-coord-cell">
                  <label>Konum (A) Enlem / Boylam</label>
                  <div class="insp-coord-inputs">
                    <input type="number" step="0.1" id="inp-orig-lat" value="${Number(activeOrigin.lat).toFixed(2)}" aria-label="Konum Enlem" />
                    <input type="number" step="0.1" id="inp-orig-lon" value="${Number(activeOrigin.lon).toFixed(2)}" aria-label="Konum Boylam" />
                  </div>
                </div>
                <div class="insp-coord-cell">
                  <label>Varış (B) Enlem / Boylam</label>
                  <div class="insp-coord-inputs">
                    <input type="number" step="0.1" id="inp-dest-lat" value="${Number(activeDest.lat).toFixed(2)}" aria-label="Varış Enlem" />
                    <input type="number" step="0.1" id="inp-dest-lon" value="${Number(activeDest.lon).toFixed(2)}" aria-label="Varış Boylam" />
                  </div>
                </div>
              </div>
              <button type="button" class="insp-calc-btn" id="btn-calc-custom-route">Rotayı Hesapla (Step-by-Step)</button>
            </div>
          ` : `
            <button type="button" class="insp-calc-btn" id="btn-enter-global-picker">
              🧭 Haritadan Konum (A) → Varış (B) Seç
            </button>
          `}

          ${(pri && sec) ? `
            <div class="route-card primary">
              <div class="route-card-top">
                <span style="color:var(--route-blue);">● Mavi Yol (En Kısa Güvenli)</span>
                <span class="route-duration-pill">${pri.formattedDuration}</span>
              </div>
              <div class="route-metrics-line">${pri.totalKm.toFixed(2)} km (${pri.totalMeters} m) · ${pri.o2Liters} L O₂ · ${pri.waterLiters} L Su</div>
              <div class="route-comment-line">${pri.comment}</div>
            </div>

            <div class="route-card secondary">
              <div class="route-card-top">
                <span style="color:#1d4ed8;">○ Soluk Mavi (Güvenli Uzun)</span>
                <span class="route-duration-pill">${sec.formattedDuration}</span>
              </div>
              <div class="route-metrics-line">${sec.totalKm.toFixed(2)} km (${sec.totalMeters} m) · ${sec.o2Liters} L O₂ · ${sec.waterLiters} L Su</div>
              <div class="route-comment-line">${sec.comment}</div>
            </div>
          ` : ""}

          ${stepRowsHtml ? `
            <div class="step-panel">
              <div class="step-tabs">
                <button type="button" class="step-tab-btn ${stepTab === "primary" ? "active" : ""}" data-step-tab="primary">
                  Mavi Adımlar (${(pri && pri.steps) ? pri.steps.length : 0})
                </button>
                <button type="button" class="step-tab-btn ${stepTab === "secondary" ? "active" : ""}" data-step-tab="secondary">
                  Soluk Mavi (${(sec && sec.steps) ? sec.steps.length : 0})
                </button>
              </div>
              <div class="step-list">${stepRowsHtml}</div>
            </div>
          ` : ""}

          <div class="rad-panel">
            <div class="rad-panel-head">☢ ${rad.name}</div>
            <div class="rad-grid">
              <div><span>Alfa (α)</span><strong>${rad.alphaLevel}</strong></div>
              <div><span>Beta (β)</span><strong>${rad.betaLevel}</strong></div>
              <div><span>Gama (γ)</span><strong>${rad.gammaLevel}</strong></div>
              <div><span>Foton Akısı</span><strong>${rad.photonFlux}</strong></div>
            </div>
          </div>

          ${state.routeScope === "crater" ? `
            <div>
              <div style="font-size:10px;font-weight:900;color:var(--ink-muted);margin-bottom:4px;">EVA DURAKLARI</div>
              <div class="wp-strip">${wpChips}</div>
            </div>
            ${selectedWp ? `
              <div class="wp-detail-box">
                <div style="display:flex;justify-content:space-between;font-weight:900;">
                  <span>${selectedWp.name}</span>
                  <span style="color:var(--mars-red);">${selectedWp.elev} m · ${selectedWp.slopeText}</span>
                </div>
                ${selectedWp.imageUrl ? `<img src="${selectedWp.imageUrl}" alt="${selectedWp.name}" class="wp-photo" />` : ""}
                <p style="color:var(--ink-dark);"><strong>Jeoloji:</strong> ${selectedWp.geology}</p>
                <p style="color:var(--ink-muted);"><strong>Güvenlik:</strong> ${selectedWp.hazardNote}</p>
              </div>
            ` : ""}
          ` : ""}
        </aside>
      `;

      this.bindEvents(state);
    }

    bindEvents(state) {
      this.mountEl.querySelector("#btn-toggle-inspector")?.addEventListener("click", () => {
        this.handlers.onToggleInspector?.(!state.inspectorOpen);
      });

      this.mountEl.querySelector("#sel-origin")?.addEventListener("change", (e) => {
        this.handlers.onChangeGlobalEndpoints?.("globalOriginId", e.target.value);
      });
      this.mountEl.querySelector("#sel-target")?.addEventListener("change", (e) => {
        this.handlers.onChangeGlobalEndpoints?.("globalTargetId", e.target.value);
      });

      this.mountEl.querySelector("#btn-pick-origin")?.addEventListener("click", () => {
        this.handlers.onTogglePickMode?.("origin");
      });
      this.mountEl.querySelector("#btn-pick-destination")?.addEventListener("click", () => {
        this.handlers.onTogglePickMode?.("destination");
      });
      this.mountEl.querySelector("#btn-enter-global-picker")?.addEventListener("click", () => {
        this.handlers.onEnterGlobalPicker?.();
      });

      this.mountEl.querySelector("#btn-calc-custom-route")?.addEventListener("click", () => {
        const oLat = parseFloat(this.mountEl.querySelector("#inp-orig-lat")?.value);
        const oLon = parseFloat(this.mountEl.querySelector("#inp-orig-lon")?.value);
        const dLat = parseFloat(this.mountEl.querySelector("#inp-dest-lat")?.value);
        const dLon = parseFloat(this.mountEl.querySelector("#inp-dest-lon")?.value);
        this.handlers.onApplyCustomCoords?.(oLat, oLon, dLat, dLon);
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

      this.mountEl.querySelectorAll("[data-wp-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          this.handlers.onSelectWaypoint?.(btn.getAttribute("data-wp-id"));
        });
      });
    }
  }

  ns.RouteInspectorPanel = RouteInspectorPanel;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc sag ust rota, step-by-step adimlar ve radyasyon inceleme paneli tanimi.
   - Satir 7-18: constructor; baglanti elemani ve geri cagirilari saklar.
   - Satir 20-210: render; backend kaynak rozetini, A/B harita secim ve koordinat kutusunu, Mavi/Soluk Mavi yollari, Adim Adim listeyi ve radyasyon verilerini cizer.
   - Satir 212-261: bindEvents; harita secimi, elle koordinat girisi, adim odaklama ve panel dugmelerini baglar.
   ========================================================================== */
