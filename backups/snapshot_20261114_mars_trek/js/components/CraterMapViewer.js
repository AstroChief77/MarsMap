/**
 * @file CraterMapViewer.js
 * @description Google Earth ve NASA Trek tarzı etkileşimli Mars Krater Harita Denetleyicisi.
 * Sol alttaki 2D/3D görünüm, asit yağmuru ve kum fırtınası filtrelerini yönetir.
 */

import { CRATERS_DATA } from "../../data/craterLocations.js";
import { CRATER_WAYPOINTS_DATA } from "../../data/craterWaypointsData.js";
import { CraterCanvasRenderer } from "../renderers/CraterCanvasRenderer.js";
import { DatasetLoader } from "../services/DatasetLoader.js";

export class CraterMapViewer {
  /**
   * CraterMapViewer yapıcı metodu
   * @param {string} containerId - Harita bileşeninin bağlanacağı HTML ID'si
   */
  constructor(containerId = "crater-viewer-container") {
    this.container = document.getElementById(containerId);
    this.activeCraterIndex = 0;
    this.activeCrater = CRATERS_DATA[this.activeCraterIndex];
    this.renderer = new CraterCanvasRenderer();
    this.datasetLoader = new DatasetLoader();

    // Katmanlar
    this.layers = {
      optical: true,
      topography: true,
      thermal: false,
      geology: true,
      evaRoute: true
    };

    // KURAL GEREĞİ: Sol alttaki görünüm modu ve hava durumu/tehlike filtreleri
    this.viewMode = "2d"; // '2d' veya '3d'
    this.filterAcidRain = true;
    this.filterDustStorm = true;

    // Kamera Zoom / Pan durumları
    this.zoom = this.activeCrater.default_zoom || 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.selectedWaypoint = null;

    this.cursorTelemetry = {
      lat: this.activeCrater.coordinates.lat,
      lon: this.activeCrater.coordinates.lon,
      elevation: this.activeCrater.elevation_datum_m,
      slope: 3.2
    };
  }

  /**
   * Bileşeni başlatır, DOM'u kurar ve haritayı çizer
   */
  init() {
    if (!this.container) return;
    this.render();
    this.bindCanvas();
    this.bindControls();
    this.drawMap();
    this.preloadDefaultWaypoint();
  }

  /**
   * Başlangıçta ana challenge hedefi olan Boxwork veya ilk istasyonu incelemede hazırlar
   */
  preloadDefaultWaypoint() {
    const waypoints = this.getWaypoints();
    const target = waypoints.find((w) => w.highlight) || waypoints[0];
    if (target) {
      this.selectedWaypoint = target;
      this.updateInspectorPanel(target);
      this.drawMap();
    }
  }

  /**
   * Aktif kratere ait waypoint listesini döner
   * @returns {Array} Waypoint dizisi
   */
  getWaypoints() {
    return CRATER_WAYPOINTS_DATA[this.activeCrater.id] || [];
  }

  /**
   * Tüm harita arayüzünü HTML olarak DOM'a işler
   */
  render() {
    const craterOptions = CRATERS_DATA.map((c, idx) => `
      <button class="crater-tab-btn ${idx === this.activeCraterIndex ? 'active' : ''}" data-crater-idx="${idx}">
        <span class="tab-pulse"></span>
        <span class="tab-name">${c.name}</span>
        ${c.recommended ? '<span class="tab-badge">NASA HEDEF</span>' : ''}
      </button>
    `).join("");

    this.container.innerHTML = `
      <div class="crater-map-wrapper">
        <!-- Üst Krater Seçimi ve Zoom Araç Çubuğu -->
        <div class="map-top-bar">
          <div class="crater-selector-group">
            <span class="selector-label">HEDEF KRATER:</span>
            <div class="crater-tabs">${craterOptions}</div>
          </div>
          <div class="map-view-actions">
            <button class="btn-map-control" id="btn-zoom-in" title="Yaklaş (+)">＋</button>
            <button class="btn-map-control" id="btn-zoom-out" title="Uzaklaş (-)">－</button>
            <button class="btn-map-control" id="btn-reset-view" title="Görünümü Sıfırla">⟲ Sıfırla</button>
          </div>
        </div>

        <!-- Ana 3 Sütunlu Google Earth Çalışma Alanı (Merkezde Harita) -->
        <div class="map-viewport-container">
          <!-- Sol Panel: Veri Katmanları ve Krater Özeti -->
          <aside class="map-layers-panel">
            <div class="panel-header">
              <span class="panel-icon">🛰️</span>
              <span class="panel-title">BİLİMSEL KATMANLAR</span>
            </div>
            <div class="layer-toggles">
              <label class="layer-item">
                <input type="checkbox" id="layer-optical" ${this.layers.optical ? 'checked' : ''} />
                <span class="layer-indicator optical-ind"></span>
                <span class="layer-text">Optik Yüzey (HiRISE / CTX)</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-topography" ${this.layers.topography ? 'checked' : ''} />
                <span class="layer-indicator topo-ind"></span>
                <span class="layer-text">MOLA Topografi (DEM Konturları)</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-geology" ${this.layers.geology ? 'checked' : ''} />
                <span class="layer-indicator geo-ind"></span>
                <span class="layer-text">USGS Jeoloji &amp; Boxwork</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-thermal" ${this.layers.thermal ? 'checked' : ''} />
                <span class="layer-indicator therm-ind"></span>
                <span class="layer-text">THEMIS Termal Kızılötesi</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-eva" ${this.layers.evaRoute ? 'checked' : ''} />
                <span class="layer-indicator eva-ind"></span>
                <span class="layer-text">Güvenli EVA Yürüyüş Rotası</span>
              </label>
            </div>

            <div class="crater-quick-info">
              <h4 class="quick-title">${this.activeCrater.name}</h4>
              <p class="quick-desc">${this.activeCrater.description}</p>
              <div class="quick-specs">
                <div><span>Çap:</span> <strong>${this.activeCrater.diameter_km} km</strong></div>
                <div><span>Derinlik:</span> <strong>${this.activeCrater.depth_m} m</strong></div>
                <div><span>Referans İrtifa:</span> <strong>${this.activeCrater.elevation_datum_m} m</strong></div>
              </div>
            </div>
          </aside>

          <!-- ORTA ALAN: Zifiri Siyah Yıldızlı Google Earth Haritası -->
          <div class="map-canvas-container" id="map-canvas-wrapper">
            <canvas id="mars-crater-canvas"></canvas>
            
            <!-- Sol Üst: Canlı İmleç Koordinat Telemetrisi -->
            <div class="hud-cursor-telemetry" id="cursor-telemetry">
              <span class="hud-item"><span class="hud-key">LAT:</span> <strong id="hud-lat">${this.cursorTelemetry.lat.toFixed(4)}°</strong></span>
              <span class="hud-item"><span class="hud-key">LON:</span> <strong id="hud-lon">${this.cursorTelemetry.lon.toFixed(4)}°</strong></span>
              <span class="hud-item"><span class="hud-key">ELEV:</span> <strong id="hud-elev">${this.cursorTelemetry.elevation} m</strong></span>
              <span class="hud-item"><span class="hud-key">EĞİM:</span> <strong id="hud-slope">${this.cursorTelemetry.slope}°</strong></span>
              <span class="hud-item hud-status"><span class="hud-key">ROTA:</span> <strong id="hud-nav">GÜVENLİ</strong></span>
            </div>

            <!-- SOL ALTTA ZORUNLU FİLTRELER: 2D, 3D, Asit Yağmuru, Kum Yağmuru/Kasırga -->
            <div class="map-bottom-left-filters" aria-label="Harita Görünüm ve Tehlike Filtreleri">
              <div class="filter-view-modes">
                <button class="btn-filter-tab ${this.viewMode === '2d' ? 'active' : ''}" id="btn-mode-2d">2D Görünüm</button>
                <button class="btn-filter-tab ${this.viewMode === '3d' ? 'active' : ''}" id="btn-mode-3d">3D Görünüm</button>
              </div>
              <div class="filter-hazard-toggles">
                <label class="filter-pill-label">
                  <input type="checkbox" id="filter-acid-rain" ${this.filterAcidRain ? 'checked' : ''} />
                  <span class="filter-pill-ind acid-ind"></span>
                  <span>Asit Yağmuru Filtresi</span>
                </label>
                <label class="filter-pill-label">
                  <input type="checkbox" id="filter-dust-storm" ${this.filterDustStorm ? 'checked' : ''} />
                  <span class="filter-pill-ind storm-ind"></span>
                  <span>Kum Yağmuru / Kasırga Filtresi</span>
                </label>
              </div>
            </div>

            <!-- Sağ Alt: Harita Ölçek Çubuğu -->
            <div class="map-scale-bar">
              <span class="scale-line"></span>
              <span class="scale-text">10 KM</span>
            </div>
          </div>

          <!-- Sağ Panel: Bilimsel İnceleme & Waypoint Denetçisi -->
          <aside class="map-inspector-panel" id="map-inspector">
            <div class="panel-header">
              <span class="panel-icon">🔬</span>
              <span class="panel-title">NOKTA İNCELEME &amp; EVA HUD</span>
            </div>
            <div class="inspector-content" id="inspector-content">
              <div class="inspector-default-msg">
                <span class="inspect-icon">🎯</span>
                <p>Detayları ve rota risk analizini görmek için haritadaki bir <strong>EVA İstasyonuna</strong> tıklayın.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  /**
   * Tuvali bağlar ve boyutlandırır
   */
  bindCanvas() {
    this.canvas = document.getElementById("mars-crater-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.wrapper = document.getElementById("map-canvas-wrapper");

    if (this.canvas && this.wrapper) {
      this.resizeCanvas();
      window.addEventListener("resize", () => {
        this.resizeCanvas();
        this.drawMap();
      });
    }
  }

  /**
   * Ekran çözünürlüğüne göre tuval boyutlarını günceller
   */
  resizeCanvas() {
    if (!this.canvas || !this.wrapper) return;
    const rect = this.wrapper.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = Math.max(rect.height, 600);
  }

  /**
   * Tüm kullanıcı kontrollerini (Sekmeler, Katmanlar, Sol Alt Filtreler, Zoom/Pan) bağlar
   */
  bindControls() {
    this.container.querySelectorAll(".crater-tab-btn").forEach((tab) => {
      tab.addEventListener("click", () => {
        const idx = parseInt(tab.getAttribute("data-crater-idx"), 10);
        this.switchCrater(idx);
      });
    });

    ["optical", "topography", "geology", "thermal", "eva"].forEach((key) => {
      document.getElementById(`layer-${key}`)?.addEventListener("change", (e) => {
        const mapKey = key === "eva" ? "evaRoute" : key;
        this.layers[mapKey] = e.target.checked;
        this.drawMap();
      });
    });

    // Sol Alttaki 2D / 3D Görünüm Butonları
    document.getElementById("btn-mode-2d")?.addEventListener("click", () => {
      this.viewMode = "2d";
      document.getElementById("btn-mode-2d")?.classList.add("active");
      document.getElementById("btn-mode-3d")?.classList.remove("active");
      this.drawMap();
    });

    document.getElementById("btn-mode-3d")?.addEventListener("click", () => {
      this.viewMode = "3d";
      document.getElementById("btn-mode-3d")?.classList.add("active");
      document.getElementById("btn-mode-2d")?.classList.remove("active");
      this.drawMap();
    });

    // Sol Alttaki Asit Yağmuru & Kum Fırtınası Filtreleri
    document.getElementById("filter-acid-rain")?.addEventListener("change", (e) => {
      this.filterAcidRain = e.target.checked;
      this.drawMap();
    });

    document.getElementById("filter-dust-storm")?.addEventListener("change", (e) => {
      this.filterDustStorm = e.target.checked;
      this.drawMap();
    });

    // Zoom & Reset
    document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
      this.zoom = Math.min(this.zoom * 1.25, 3.5);
      this.drawMap();
    });

    document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
      this.zoom = Math.max(this.zoom / 1.25, 0.6);
      this.drawMap();
    });

    document.getElementById("btn-reset-view")?.addEventListener("click", () => {
      this.zoom = this.activeCrater.default_zoom || 1.0;
      this.panX = 0;
      this.panY = 0;
      this.drawMap();
    });

    // Canvas Pan, Zoom ve Tıklama
    if (this.canvas) {
      this.canvas.addEventListener("mousedown", (e) => {
        this.isDragging = true;
        this.dragStartX = e.clientX - this.panX;
        this.dragStartY = e.clientY - this.panY;
      });

      window.addEventListener("mouseup", () => {
        this.isDragging = false;
      });

      this.canvas.addEventListener("mousemove", (e) => {
        if (this.isDragging) {
          this.panX = e.clientX - this.dragStartX;
          this.panY = e.clientY - this.dragStartY;
          this.drawMap();
        }
        this.updateCursorTelemetry(e);
      });

      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.9;
        this.zoom = Math.min(Math.max(this.zoom * factor, 0.5), 4.0);
        this.drawMap();
      });

      this.canvas.addEventListener("click", (e) => this.handleWaypointClick(e));
    }
  }

  /**
   * Aktif krateri değiştirir
   */
  switchCrater(index) {
    if (index < 0 || index >= CRATERS_DATA.length) return;
    this.activeCraterIndex = index;
    this.activeCrater = CRATERS_DATA[index];
    this.zoom = this.activeCrater.default_zoom || 1.0;
    this.panX = 0;
    this.panY = 0;
    this.selectedWaypoint = null;
    this.render();
    this.bindCanvas();
    this.bindControls();
    this.preloadDefaultWaypoint();
  }

  /**
   * Fare pozisyonuna göre enlem, boylam, irtifa ve eğimi hesaplayıp HUD çubuğuna yansıtır
   */
  updateCursorTelemetry(e) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleY = this.viewMode === "3d" ? 0.56 : 1.0;
    const scaleX = this.viewMode === "3d" ? 1.12 : 1.0;

    const x = (e.clientX - rect.left - this.canvas.width / 2 - this.panX) / scaleX;
    const y = (e.clientY - rect.top - this.canvas.height / 2 - this.panY) / scaleY;

    const dist = Math.hypot(x, y);
    const degFactor = 0.0008 / this.zoom;
    const lat = this.activeCrater.coordinates.lat - y * degFactor;
    const lon = this.activeCrater.coordinates.lon + x * degFactor;

    let elev = this.activeCrater.elevation_datum_m;
    if (this.activeCrater.id === "gale-crater") {
      const peakDist = Math.hypot(x - 15, y + 10);
      if (peakDist < 160 * this.zoom) {
        elev += (160 * this.zoom - peakDist) * 18;
      }
    } else {
      elev += dist * 4;
    }

    const slope = Math.min(Math.max((dist / 15) * (elev > -3000 ? 1.6 : 0.8), 1.2), 32.0);
    document.getElementById("hud-lat").innerText = `${lat.toFixed(4)}°`;
    document.getElementById("hud-lon").innerText = `${lon.toFixed(4)}°`;
    document.getElementById("hud-elev").innerText = `${Math.round(elev)} m`;
    document.getElementById("hud-slope").innerText = `${slope.toFixed(1)}°`;

    const navEl = document.getElementById("hud-nav");
    if (navEl) {
      if (slope > 25) {
        navEl.innerText = "TEHLİKELİ EĞİM";
        navEl.style.color = "#ef4444";
      } else if (slope > 15) {
        navEl.innerText = "DİK EĞİM";
        navEl.style.color = "#f59e0b";
      } else {
        navEl.innerText = "GÜVENLİ ROTA";
        navEl.style.color = "#22c55e";
      }
    }
  }

  /**
   * 2D veya 3D görünümde waypoint tıklamalarını yakalar
   */
  handleWaypointClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const cx = this.canvas.width / 2 + this.panX;
    const cy = this.canvas.height / 2 + this.panY;

    const waypoints = this.getWaypoints();
    let clicked = null;

    for (const wp of waypoints) {
      let sx, sy;
      if (this.viewMode === "3d") {
        sx = cx + wp.relX * this.zoom * 1.12;
        const gy = cy + wp.relY * this.zoom * 0.56;
        const elevOffset = Math.max(10, ((wp.elev + 4600) / 25) * this.zoom);
        sy = gy - elevOffset;
      } else {
        sx = cx + wp.relX * this.zoom;
        sy = cy + wp.relY * this.zoom;
      }

      if (Math.hypot(clickX - sx, clickY - sy) < 22) {
        clicked = wp;
        break;
      }
    }

    if (clicked) {
      this.selectedWaypoint = clicked;
      this.updateInspectorPanel(clicked);
      this.drawMap();
    }
  }

  /**
   * Seçilen istasyonun detaylarını ve varsa gerçek NASA yüzey fotoğrafını sağ panelde gösterir
   */
  updateInspectorPanel(wp) {
    const inspector = document.getElementById("inspector-content");
    if (!inspector) return;

    const photoBlock = wp.imageUrl
      ? `<div class="inspect-photo-box">
           <img src="${wp.imageUrl}" alt="${wp.name}" class="inspect-photo" />
           <span class="inspect-photo-caption">${wp.imageCaption || 'NASA Yüzey Görüntüsü'}</span>
         </div>`
      : "";

    inspector.innerHTML = `
      <div class="inspect-card active-inspect">
        <div class="inspect-badge ${wp.highlight ? 'badge-highlight' : ''}">${wp.status}</div>
        <h3 class="inspect-title">${wp.name}</h3>
        
        <div class="inspect-metrics-grid">
          <div class="metric-box"><span class="m-label">İrtifa</span><span class="m-val">${wp.elev} m</span></div>
          <div class="metric-box"><span class="m-label">Eğim Açısı</span><span class="m-val">${wp.slopeText}</span></div>
          <div class="metric-box"><span class="m-label">Zaman</span><span class="m-val">Sol ${wp.sol}</span></div>
          <div class="metric-box"><span class="m-label">Tehlike</span><span class="m-val">${(wp.acidRisk || wp.stormRisk) ? 'RİSKLİ' : 'DÜŞÜK'}</span></div>
        </div>

        ${photoBlock}

        <div class="inspect-section">
          <h4 class="sub-label">🔬 JEOLOJİK FORMASYON</h4>
          <p class="sub-text">${wp.geology}</p>
        </div>

        <div class="inspect-section">
          <h4 class="sub-label">🎯 BİLİMSEL HEDEF</h4>
          <p class="sub-text">${wp.science}</p>
        </div>

        <div class="inspect-section">
          <h4 class="sub-label">🛡️ MARSWALK GÜVENLİK YÖNERGESİ</h4>
          <p class="sub-text">${wp.hazardNote}</p>
        </div>
      </div>
    `;
  }

  /**
   * Harita çizim motorunu güncel durum parametreleriyle çalıştırır
   */
  drawMap() {
    if (!this.ctx || !this.canvas) return;
    this.renderer.render(this.ctx, {
      width: this.canvas.width,
      height: this.canvas.height,
      panX: this.panX,
      panY: this.panY,
      zoom: this.zoom,
      activeCrater: this.activeCrater,
      layers: this.layers,
      viewMode: this.viewMode,
      filterAcidRain: this.filterAcidRain,
      filterDustStorm: this.filterDustStorm,
      waypoints: this.getWaypoints(),
      selectedWaypoint: this.selectedWaypoint
    });
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc sınıf açıklaması.
   - Satır 7-10: Krater verileri, waypoint verileri, CraterCanvasRenderer ve DatasetLoader modüllerinin içe aktarılması.
   - Satır 12: CraterMapViewer sınıfı bildirimi.
   - Satır 13-53: constructor; katmanlar, sol alt görünüm (2D/3D) ve tehlike (Asit/Fırtına) filtre bayrakları ile kamera durumlarını başlatır.
   - Satır 55-76: init ve preloadDefaultWaypoint; bileşeni kurar ve ilk vurgulu noktayı sağ inceleme paneline yükler.
   - Satır 78-84: getWaypoints; aktif kratere göre CRATER_WAYPOINTS_DATA verilerini döner.
   - Satır 86-188: render; üst barı, sol veri katmanlarını, merkezdeki yıldızlı haritayı ve sol alttaki 2D/3D + asit + kum fırtınası filtrelerini üretir.
   - Satır 190-210: bindCanvas ve resizeCanvas; tuval boyutunu responsive tutar.
   - Satır 212-298: bindControls; krater geçişleri, sol alt 2D/3D butonları, asit/fırtına checkboxları ve pan/zoom olaylarını yönetir.
   - Satır 300-355: switchCrater ve updateCursorTelemetry; krater değişimini ve imleç altı koordinat/irtifa/eğim hesabını yapar.
   - Satır 357-388: handleWaypointClick; hem 2D hem 3D projeksiyonlarda tıklanan waypoint noktasını tespit eder.
   - Satır 390-430: updateInspectorPanel; seçilen noktanın metriklerini ve varsa gerçek NASA yüzey görselini gösterir.
   - Satır 432-451: drawMap; güncel durum parametrelerini CraterCanvasRenderer motoruna ileterek tuvali çizer.
   - Satır 452: CraterMapViewer sınıfının sonu.
   ========================================================================== */
