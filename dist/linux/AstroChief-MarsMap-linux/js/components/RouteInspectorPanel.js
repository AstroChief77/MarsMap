/**
 * @file RouteInspectorPanel.js
 * @description Sag ustte yer alan sadelestirilmis Rota (Bulundugumuz Konum -> Hedef Konum),
 * Step-by-Step adim listesi ve Radyasyon inceleme paneli.
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

      const pri = computedRoutes?.primaryBlue;
      const sec = computedRoutes?.secondaryPaleBlue;
      const activeOrigin = uiMeta.activeOrigin || state.customOrigin || { name: "Bulunduğumuz Konum", lat: -4.59, lon: 137.44 };
      const activeDest = uiMeta.activeDestination || state.customDestination || { name: "Jezero Krateri", lat: 18.44, lon: 77.45 };
      const pickingDest = uiMeta.pickMode === "destination";
      const backendLoading = Boolean(uiMeta.backendLoading);
      const latencyMs = typeof uiMeta.backendLatencyMs === "number" ? uiMeta.backendLatencyMs : null;
      const isRust = computedRoutes?.source === "rust-backend";
      const sourceLabel = backendLoading
        ? "⏳ Hesaplıyor..."
        : (isRust ? "🦀 Rust Backend" : "⚡ Yerel Motor");
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

      const targetOptions = (landingSites || [])
        .filter((s) => s.id !== "curiosity-gale")
        .map((s) => `
          <option value="${s.id}" ${(!state.useCustomCoordinates && s.id === state.globalTargetId) ? "selected" : ""}>
            ${s.name} (${s.latitude.toFixed(1)}°, ${s.longitude.toFixed(1)}°)
          </option>
        `).join("");

      const routeBadge = pri ? `${pri.formattedDuration} · ${pri.totalKm.toFixed(0)} km` : "Rota Hazır";
      const stepTab = state.activeStepRouteTab === "secondary" ? "secondary" : "primary";
      const activeStepRoute = stepTab === "secondary" ? (sec || pri) : pri;
      const stepRowsHtml = ((activeStepRoute && activeStepRoute.steps) || []).map((s) => `
        <div class="step-row" data-step-lat="${s.lat}" data-step-lon="${s.lon}" title="Haritada bu adıma odaklan">
          <div class="step-row-top">
            <span>#${s.step} · ${s.instruction}</span>
          </div>
          <div class="step-row-meta">
            ${Number(s.lat).toFixed(2)}°, ${Number(s.lon).toFixed(2)}° · İrtifa ${s.elevM} m · Eğim ${s.slopeDeg}° · ${s.distKm} km
          </div>
          ${s.hazardWarning ? `<div class="step-row-warn">⚠ ${s.hazardWarning}</div>` : ""}
        </div>
      `).join("");

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>Rota</span>
          <span style="color:var(--mars-red);">${routeBadge}</span>
          <span class="insp-latency-pill ${latencyClass}" id="insp-latency-pill" title="Backend Gecikmesi (5sn yenileme)">${latencyLabel}</span>
          <span>${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="Basit Rota ve Radyasyon Paneli">
          <div class="insp-head">
            <div>
              <span class="insp-badge">ROTA PLANLAYICI</span>
              <div class="insp-title">Konumumuz → Hedef</div>
              <div class="insp-sub">
                Asit: <strong>${state.filterAcidRain ? state.acidIntensity : "Kapalı"}</strong> ·
                Fırtına: <strong>${state.filterDustStorm ? state.stormIntensity : "Kapalı"}</strong>
              </div>
            </div>
            <span class="insp-source-pill ${isRust ? "rust" : ""}">${sourceLabel}</span>
          </div>

          <div class="insp-coord-box">
            <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;background:var(--bg-white);padding:6px 8px;border-radius:5px;border:1px solid var(--line-light);">
              <span>📍 <strong>Bulunduğumuz Konum:</strong></span>
              <span style="font-weight:800;color:var(--route-blue);">Gale (${Number(activeOrigin.lat).toFixed(2)}°, ${Number(activeOrigin.lon).toFixed(2)}°)</span>
            </div>

            <div class="insp-select-wrap">
              <label for="sel-target">🎯 Hedef Konum (${Number(activeDest.lat).toFixed(2)}°, ${Number(activeDest.lon).toFixed(2)}°)</label>
              <select class="insp-select" id="sel-target">
                ${state.useCustomCoordinates ? `<option value="__custom__" selected>Haritadan Seçilen Hedef (${Number(activeDest.lat).toFixed(1)}°, ${Number(activeDest.lon).toFixed(1)}°)</option>` : ""}
                ${targetOptions}
              </select>
            </div>

            <button type="button" class="insp-pick-btn ${pickingDest ? "active" : ""}" id="btn-pick-destination" style="width:100%;padding:7px 10px;font-size:11.5px;">
              ${pickingDest ? "🎯 Haritada Hedef Noktaya Tıklayın..." : "🎯 Haritadan Hedef Konum Seç"}
            </button>
          </div>

          ${(pri && sec) ? `
            <div class="route-card primary">
              <div class="route-card-top">
                <span style="color:var(--route-blue);">● Mavi Yol (En Kısa Güvenli)</span>
                <span class="route-duration-pill">${pri.formattedDuration}</span>
              </div>
              <div class="route-metrics-line">${pri.totalKm.toFixed(1)} km · ${pri.o2Liters} L O₂ · ${pri.waterLiters} L Su</div>
              <div class="route-comment-line">${pri.comment}</div>
            </div>

            <div class="route-card secondary">
              <div class="route-card-top">
                <span style="color:#1d4ed8;">○ Soluk Mavi (Güvenli Uzun)</span>
                <span class="route-duration-pill">${sec.formattedDuration}</span>
              </div>
              <div class="route-metrics-line">${sec.totalKm.toFixed(1)} km · ${sec.o2Liters} L O₂ · ${sec.waterLiters} L Su</div>
              <div class="route-comment-line">${sec.comment}</div>
            </div>
          ` : ""}

          ${stepRowsHtml ? `
            <div class="step-panel">
              <div style="font-size:10.5px;font-weight:900;color:var(--ink-black);">ADIM ADIM ROTA (STEP-BY-STEP)</div>
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
   - Satir 1-5: JSDoc sadelestirilmis sag ust rota (Bulundugumuz Konum -> Hedef) ve step-by-step paneli tanimi.
   - Satir 7-15: constructor; baglanti elemani ve geri cagirilari saklar.
   - Satir 17-152: render; Bulundugumuz Konum gostergesini, tekli Hedef secimini, Mavi/Soluk Mavi rotayi ve Adim Adim listeyi cizer.
   - Satir 154-188: bindEvents; hedef secimi, haritadan hedef tiklama ve adim odaklama dugmelerini baglar.
   ========================================================================== */
