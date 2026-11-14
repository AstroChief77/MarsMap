/**
 * @file CraterDrawers.js
 * @description Google Maps stili Sol Kenar Çubuğu (Sidebar): Krater seçimi, Mavi/Soluk Mavi
 * rota süre-mesafe-litre analizi, Alfa/Beta/Gama foton radyasyon verisi ve seçili istasyon kartı.
 */

import { CRATERS_DATA } from "../../data/craterLocations.js";

export class CraterDrawers {
  /**
   * CraterDrawers yapıcı metodu
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.sidebarOpen = true;
    this.searchQuery = "";
  }

  /**
   * Google Maps stili Sol Kenar Çubuğu HTML çıktısını üretir
   */
  renderSidebar(state, waypoints, computedRoutes, radiationZones, lodTier) {
    const query = this.searchQuery.trim().toLowerCase();

    const craterButtons = CRATERS_DATA
      .filter((c) => !query || c.name.toLowerCase().includes(query) || c.tag.toLowerCase().includes(query))
      .map((c) => {
        const idx = CRATERS_DATA.findIndex((x) => x.id === c.id);
        const isActive = state.mapScope === "crater" && state.activeCraterIndex === idx;
        return `
          <button class="sidebar-crater-btn ${isActive ? "active" : ""}" data-select-crater="${idx}">
            <div class="scb-head">
              <span class="scb-title">${c.name}</span>
              ${c.id === "gale-crater" ? '<span class="scb-badge">ÖNERİLEN</span>' : ""}
            </div>
            <div class="scb-sub">Çap ${c.diameter_km} km • İrtifa ${c.elevation_datum_m} m</div>
          </button>
        `;
      }).join("");

    const filteredWaypoints = waypoints.filter(
      (wp) => !query || wp.name.toLowerCase().includes(query) || wp.geology.toLowerCase().includes(query)
    );

    const wpListHtml = filteredWaypoints.map((wp) => `
      <button class="sidebar-wp-btn ${state.selectedWaypoint?.id === wp.id ? "active" : ""}" data-select-wp="${wp.id}">
        <span class="swp-name">${wp.name}</span>
        <span class="swp-meta">${wp.elev}m • ${wp.slopeText}</span>
      </button>
    `).join("");

    const pri = computedRoutes?.primaryBlue;
    const sec = computedRoutes?.secondaryPaleBlue;
    const routeSummaryHtml = (pri && sec) ? `
      <div class="sidebar-route-box">
        <div class="route-row route-blue">
          <span class="route-swatch swatch-blue"></span>
          <div class="route-info">
            <div class="route-title">Mavi Yol (En Güvenli Kısa)</div>
            <div class="route-metrics">${pri.totalKm.toFixed(2)} km (${pri.totalMeters} m) • <strong>${pri.formattedDuration}</strong></div>
            <div class="route-consumables">Tüketim: ${pri.o2Liters} L O2 • ${pri.waterLiters} L Su</div>
          </div>
        </div>
        <div class="route-row route-pale">
          <span class="route-swatch swatch-pale"></span>
          <div class="route-info">
            <div class="route-title">Soluk Mavi (Güvenli Uzun Alternatif)</div>
            <div class="route-metrics">${sec.totalKm.toFixed(2)} km (${sec.totalMeters} m) • <strong>${sec.formattedDuration}</strong></div>
            <div class="route-consumables">Tüketim: ${sec.o2Liters} L O2 • ${sec.waterLiters} L Su</div>
          </div>
        </div>
      </div>
    ` : "";

    const radZone = radiationZones && radiationZones[0];
    const radiationBoxHtml = radZone ? `
      <div class="sidebar-rad-box">
        <div class="rad-head">☢ ${radZone.name}</div>
        <div class="rad-grid">
          <div><span>Alfa (α):</span><strong>${radZone.alphaLevel}</strong></div>
          <div><span>Beta (β):</span><strong>${radZone.betaLevel}</strong></div>
          <div><span>Gama (γ):</span><strong>${radZone.gammaLevel}</strong></div>
          <div><span>Foton Akısı:</span><strong>${radZone.photonFlux}</strong></div>
        </div>
        <div class="rad-lod-note">Render Ölçeği: LOD ${lodTier}/3 (${state.progressiveLodRender ? "Yalnızca Görünür Alan" : "Tam Render"})</div>
      </div>
    ` : "";

    const activeWp = state.selectedWaypoint;
    const wpDetailHtml = activeWp ? `
      <div class="sidebar-detail-card">
        <div class="sdc-header">
          <span class="sdc-status">${activeWp.status}</span>
          <span class="sdc-sol">Sol ${activeWp.sol}</span>
        </div>
        <h4 class="sdc-title">${activeWp.name}</h4>
        ${activeWp.imageUrl ? `<img src="${activeWp.imageUrl}" alt="${activeWp.name}" class="sdc-photo" />` : ""}
        <div class="sdc-stats">
          <div><span>İrtifa</span><strong>${activeWp.elev} m</strong></div>
          <div><span>Eğim</span><strong>${activeWp.slopeText}</strong></div>
          <div><span>Risk</span><strong>${(activeWp.acidRisk || activeWp.stormRisk) ? "Dikkat" : "Güvenli"}</strong></div>
        </div>
        <p class="sdc-text"><strong>Jeoloji:</strong> ${activeWp.geology}</p>
        <p class="sdc-text"><strong>Güvenlik:</strong> ${activeWp.hazardNote}</p>
      </div>
    ` : `
      <div class="sidebar-empty-note">Harita üzerinden bir krater veya durak seçin.</div>
    `;

    return `
      <aside class="maps-sidebar ${this.sidebarOpen ? "open" : "collapsed"}" id="maps-sidebar" aria-label="Harita Kenar Çubuğu">
        <div class="sidebar-block">
          <div class="sidebar-block-title">BÖLGE VE KRATER SEÇİMİ</div>
          <button class="sidebar-orbit-btn ${state.mapScope !== "crater" ? "active" : ""}" id="btn-fly-global-orbit">
            🌐 Mars Küresel Görünüm (Trek)
          </button>
          <div class="sidebar-crater-list">${craterButtons || '<div class="sidebar-empty-note">Sonuç bulunamadı.</div>'}</div>
        </div>

        <div class="sidebar-block">
          <div class="sidebar-block-title">ROTA ANALİZİ (KM / SAAT / LİTRE)</div>
          ${routeSummaryHtml}
        </div>

        <div class="sidebar-block">
          <div class="sidebar-block-title">RADYASYON &amp; FOTON BOMBARDIMANI</div>
          ${radiationBoxHtml}
        </div>

        <div class="sidebar-block">
          <div class="sidebar-block-title">HARİTA KATMANLARI</div>
          <div class="sidebar-layers">
            ${this.renderLayerCheck("optical", "Optik Yüzey (Viking / HiRISE)", state.layers.optical)}
            ${this.renderLayerCheck("topography", "Topografi Konturları (MOLA)", state.layers.topography)}
            ${this.renderLayerCheck("geology", "Jeoloji & Boxwork Sırtları", state.layers.geology)}
            ${this.renderLayerCheck("thermal", "Termal Yoğunluk (THEMIS)", state.layers.thermal)}
            ${this.renderLayerCheck("evaRoute", "Güvenli Rotalar (Mavi / Soluk Mavi)", state.layers.evaRoute)}
          </div>
        </div>

        <div class="sidebar-block">
          <div class="sidebar-block-title">ROTA İSTASYONLARI (${filteredWaypoints.length})</div>
          <div class="sidebar-wp-list">${wpListHtml}</div>
          ${wpDetailHtml}
        </div>
      </aside>
    `;
  }

  /**
   * Sade onay kutusu satırı
   */
  renderLayerCheck(key, label, checked) {
    return `
      <label class="sidebar-check-row">
        <input type="checkbox" class="layer-checkbox" data-layer-key="${key}" ${checked ? "checked" : ""} />
        <span>${label}</span>
      </label>
    `;
  }

  /**
   * Kenar çubuğu olay dinleyicileri
   */
  bindEvents(root) {
    root.querySelector("#btn-fly-global-orbit")?.addEventListener("click", () => {
      this.callbacks.onFlyOrbit?.();
    });
    root.querySelectorAll("[data-select-crater]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.callbacks.onSelectCrater?.(parseInt(btn.getAttribute("data-select-crater"), 10));
      });
    });
    root.querySelectorAll("[data-select-wp]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.callbacks.onSelectWaypoint?.(btn.getAttribute("data-select-wp"));
      });
    });
    root.querySelectorAll(".layer-checkbox").forEach((cb) => {
      cb.addEventListener("change", (e) => {
        this.callbacks.onToggleLayer?.(cb.getAttribute("data-layer-key"), e.target.checked);
      });
    });
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-7: JSDoc Google Maps stili kenar çubuğu bileşeni tanımı.
   - Satır 9-16: constructor; sidebar açıklık ve arama metnini başlatır.
   - Satır 18-137: renderSidebar; krater seçimi, Mavi/Soluk Mavi rota karşılaştırması (km, saat, litre), Alfa/Beta/Gama + Foton Bombardımanı telemetrisi ve istasyon kartını üretir.
   - Satır 139-172: renderLayerCheck ve bindEvents olay yöneticileri.
   ========================================================================== */
