/**
 * @file CraterDrawers.js
 * @description Google Maps tarzı sade, yormayan Sol Kenar Çubuğu (Sidebar) bileşeni.
 * Krater seçimi, veri katmanları ve seçili bölge/durak özetini tek temiz panelde sunar.
 */

import { CRATERS_DATA } from "../../data/craterLocations.js";

export class CraterDrawers {
  /**
   * CraterDrawers yapıcı metodu
   * @param {Object} callbacks - Krater seçimi, katman ve durak geri çağrıları
   */
  constructor(callbacks) {
    this.callbacks = callbacks;
    this.sidebarOpen = true;
    this.searchQuery = "";
  }

  /**
   * Google Maps stili temiz beyaz Sol Kenar Çubuğu HTML çıktısını üretir
   */
  renderSidebar(state, waypoints) {
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
            <div class="scb-sub">Çap ${c.diameter_km} km • Derinlik ${c.depth_m} m</div>
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
          <div><span>Durum</span><strong>${(activeWp.acidRisk || activeWp.stormRisk) ? "Dikkat" : "Güvenli"}</strong></div>
        </div>
        <p class="sdc-text"><strong>Jeoloji:</strong> ${activeWp.geology}</p>
        <p class="sdc-text"><strong>Güvenlik:</strong> ${activeWp.hazardNote}</p>
      </div>
    ` : `
      <div class="sidebar-empty-note">
        Harita üzerinden bir krater veya rota durağı seçerek teknik detayları görüntüleyin.
      </div>
    `;

    return `
      <aside class="maps-sidebar ${this.sidebarOpen ? "open" : "collapsed"}" id="maps-sidebar" aria-label="Harita Kenar Çubuğu">
        <!-- 1. Bölüm: Bölge / Küre Seçimi -->
        <div class="sidebar-block">
          <div class="sidebar-block-title">BÖLGE VE KRATER SEÇİMİ</div>
          <button class="sidebar-orbit-btn ${state.mapScope !== "crater" ? "active" : ""}" id="btn-fly-global-orbit">
            🌐 Mars Küresel Görünüm (Trek)
          </button>
          <div class="sidebar-crater-list">${craterButtons || '<div class="sidebar-empty-note">Eşleşen krater bulunamadı.</div>'}</div>
        </div>

        <!-- 2. Bölüm: Bilimsel Katmanlar -->
        <div class="sidebar-block">
          <div class="sidebar-block-title">HARİTA KATMANLARI</div>
          <div class="sidebar-layers">
            ${this.renderLayerCheck("optical", "Optik Yüzey (Viking / HiRISE)", state.layers.optical)}
            ${this.renderLayerCheck("topography", "Topografi Konturları (MOLA)", state.layers.topography)}
            ${this.renderLayerCheck("geology", "Jeoloji & Boxwork Sırtları", state.layers.geology)}
            ${this.renderLayerCheck("thermal", "Termal Yoğunluk (THEMIS)", state.layers.thermal)}
            ${this.renderLayerCheck("evaRoute", "Güvenli EVA Yürüyüş Rotası", state.layers.evaRoute)}
          </div>
        </div>

        <!-- 3. Bölüm: EVA İstasyonları ve Seçili Nokta Özeti -->
        <div class="sidebar-block">
          <div class="sidebar-block-title">ROTA İSTASYONLARI (${filteredWaypoints.length})</div>
          <div class="sidebar-wp-list">${wpListHtml}</div>
          ${wpDetailHtml}
        </div>
      </aside>
    `;
  }

  /**
   * Sade onay kutusu satırı oluşturur
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
   * Kenar çubuğu içindeki tıklama olaylarını bağlar
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
   - Satır 1-5: JSDoc Google Maps stili temiz kenar çubuğu bileşeni tanımı.
   - Satır 7: CRATERS_DATA verisinin içe aktarılması.
   - Satır 9-16: constructor; kenar çubuğu açıklık durumu ve arama metnini başlatır.
   - Satır 18-88: renderSidebar; krater listesi, katman onay kutuları, duraklar ve seçili nokta detay kartını tek düzenli sütunda üretir.
   - Satır 90-98: renderLayerCheck; sade onay kutusu satırı döner.
   - Satır 100-124: bindEvents; yörüngeye dönüş, krater/durak seçimi ve katman değişimlerini bağlar.
   ========================================================================== */
