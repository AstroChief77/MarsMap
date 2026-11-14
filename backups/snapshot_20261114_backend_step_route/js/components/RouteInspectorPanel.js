/**
 * @file RouteInspectorPanel.js
 * @description Sag ustte yer alan acilir/kapanir Rota, Sure (Saat), Mesafe (km/m), Tuketim (Litre)
 * ve Alfa/Beta/Gama Radyasyon & Foton Bombardimani inceleme paneli.
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
     * Mavi ve Soluk Mavi rota karsilastirma kartini DOM'a cizer
     */
    render(state, activeCrater, landingSites, waypoints, selectedWp, computedRoutes, radZones) {
      if (!this.mountEl) return;

      const pri = computedRoutes?.primaryBlue;
      const sec = computedRoutes?.secondaryPaleBlue;
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

      this.mountEl.innerHTML = `
        <button class="inspector-toggle-btn" id="btn-toggle-inspector">
          <span>Rota &amp; Radyasyon</span>
          <span style="color:var(--mars-red);">${routeBadge}</span>
          <span>${state.inspectorOpen ? "▴" : "▾"}</span>
        </button>

        <aside class="inspector-card ${state.inspectorOpen ? "open" : ""}" aria-label="Güvenli Rota ve Radyasyon Paneli">
          <div class="insp-head">
            <div>
              <span class="insp-badge">${state.routeScope === "global" ? "KÜRESEL ROTA" : "KRATER EVA"}</span>
              <div class="insp-title">${state.routeScope === "global" ? "Mars İniş Sahaları Arası" : (activeCrater?.name || "Gale Krateri")}</div>
              <div class="insp-sub">
                Asit: <strong>${state.filterAcidRain ? state.acidIntensity : "Kapalı"}</strong> ·
                Fırtına: <strong>${state.filterDustStorm ? state.stormIntensity : "Kapalı"}</strong>
              </div>
            </div>
          </div>

          ${state.routeScope === "global" ? `
            <div class="insp-route-selectors">
              <div class="insp-select-wrap">
                <label for="sel-origin">Başlangıç</label>
                <select class="insp-select" id="sel-origin">${siteOptions(state.globalOriginId)}</select>
              </div>
              <div class="insp-select-wrap">
                <label for="sel-target">Hedef</label>
                <select class="insp-select" id="sel-target">${siteOptions(state.globalTargetId)}</select>
              </div>
            </div>
          ` : ""}

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
   - Satir 1-5: JSDoc sag ust rota ve radyasyon inceleme paneli tanimi.
   - Satir 7-15: constructor; baglanti elemani ve geri cagirilari saklar.
   - Satir 17-122: render; Mavi/Soluk Mavi rota mesafesi (km/m), varis suresi (Saat), Litre tuketimi, yol yorumlari, Alfa/Beta/Gama foton verileri ve durak gorselini cizer.
   - Satir 124-141: bindEvents; panel acma/kapama, kuresel rota ucu ve krater duragi secimlerini baglar.
   ========================================================================== */
