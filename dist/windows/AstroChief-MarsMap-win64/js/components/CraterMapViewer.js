/**
 * @file CraterMapViewer.js
 * @description Kurumsal Google Maps & NASA Mars Trek düzeninde basitleştirilmiş,
 * sade ve yüksek kontrastlı etkileşimli Mars Krater Harita Denetleyicisi.
 */

import { CRATERS_DATA } from "../../data/craterLocations.js";
import { CRATER_WAYPOINTS_DATA } from "../../data/craterWaypointsData.js";
import { CraterCanvasRenderer } from "../renderers/CraterCanvasRenderer.js";
import { MarsGlobeRenderer } from "../renderers/MarsGlobeRenderer.js";
import { StateStorageService } from "../services/StateStorageService.js";
import { CraterDrawers } from "./CraterDrawers.js";

export class CraterMapViewer {
  /**
   * CraterMapViewer yapıcı metodu
   * @param {string} containerId - Harita çalışma alanının yerleştirileceği kapsayıcı ID
   * @param {Object} starfieldRef - Arka plan yıldız simülasyonu nesnesi
   */
  constructor(containerId = "crater-viewer-container", starfieldRef = null) {
    this.container = document.getElementById(containerId);
    this.starfieldRef = starfieldRef;
    this.storage = new StateStorageService();
    this.craterRenderer = new CraterCanvasRenderer();
    this.globeRenderer = new MarsGlobeRenderer();

    this.applyStateSnapshot(this.storage.loadState());
    this.rotLat = -4.0;
    this.rotLon = 105.0;
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    this.isDragging = false;
    this.hasMovedDuringDrag = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.selectedWaypoint = null;
    this.globeHitTargets = [];

    this.sidebarCtrl = new CraterDrawers({
      onFlyOrbit: () => this.flyToOrbit(),
      onSelectCrater: (idx) => this.flyToCrater(idx),
      onSelectWaypoint: (wpId) => this.focusWaypointById(wpId),
      onToggleLayer: (key, checked) => {
        this.layers[key] = checked;
        this.persistState();
        this.drawMap();
      }
    });
  }

  /**
   * Kayıtlı ayarları bileşene uygular
   */
  applyStateSnapshot(snap) {
    this.activeCraterIndex = snap.activeCraterIndex ?? 0;
    this.activeCrater = CRATERS_DATA[this.activeCraterIndex] || CRATERS_DATA[0];
    this.mapScope = snap.mapScope || "globe";
    this.viewMode = snap.viewMode || "3d";
    this.filterAcidRain = snap.filterAcidRain !== undefined ? snap.filterAcidRain : true;
    this.filterDustStorm = snap.filterDustStorm !== undefined ? snap.filterDustStorm : true;
    this.terrainExaggeration = snap.terrainExaggeration || 1.0;
    this.basemapOpacity = snap.basemapOpacity || 1.0;
    this.showNomenclature = snap.showNomenclature !== undefined ? snap.showNomenclature : true;
    this.showGraticule = !!snap.showGraticule;
    this.showStarfield = snap.showStarfield !== undefined ? snap.showStarfield : true;
    this.layers = { ...snap.layers };
  }

  /**
   * Bileşeni başlatır
   */
  init() {
    if (!this.container) return;
    this.render();
    this.bindCanvas();
    this.bindGlobalListeners();
    this.drawMap();
  }

  /**
   * Header arama çubuğu veya Sidebar düğmesinden gelen eylemler
   */
  toggleSidebar() {
    this.sidebarCtrl.sidebarOpen = !this.sidebarCtrl.sidebarOpen;
    this.refreshUIAndMap();
  }

  setSearchQuery(query) {
    this.sidebarCtrl.searchQuery = query || "";
    this.sidebarCtrl.sidebarOpen = true;
    this.refreshUIAndMap();
  }

  /**
   * Aktif krater duraklarını getirir
   */
  getWaypoints() {
    return CRATER_WAYPOINTS_DATA[this.activeCrater.id] || [];
  }

  /**
   * Güncel durumu kaydeder
   */
  persistState() {
    this.storage.saveState({
      activeCraterIndex: this.activeCraterIndex,
      mapScope: this.mapScope,
      viewMode: this.viewMode,
      filterAcidRain: this.filterAcidRain,
      filterDustStorm: this.filterDustStorm,
      terrainExaggeration: this.terrainExaggeration,
      basemapOpacity: this.basemapOpacity,
      showNomenclature: this.showNomenclature,
      showGraticule: this.showGraticule,
      showStarfield: this.showStarfield,
      layers: this.layers
    });
  }

  /**
   * Sol Üst Ayarlar -> 1. Seçenek "Factory Reset" sıfırlama işlevi
   */
  performFactoryReset() {
    this.selectedWaypoint = null;
    this.sidebarCtrl.sidebarOpen = true;
    this.sidebarCtrl.searchQuery = "";

    const defaults = this.storage.factoryReset();
    this.applyStateSnapshot(defaults);
    this.rotLat = -4.0;
    this.rotLon = 105.0;
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;

    if (this.starfieldRef?.canvas) {
      this.starfieldRef.canvas.style.opacity = "1";
    }
    this.refreshUIAndMap();
    this.showToast("Varsayılan fabrika ayarlarına dönüldü (Factory Reset)");
  }

  /**
   * Ayar değişimini uygular
   */
  updateSetting(key, val) {
    this[key] = val;
    if (key === "showStarfield" && this.starfieldRef?.canvas) {
      this.starfieldRef.canvas.style.opacity = val ? "1" : "0.08";
    }
    this.persistState();
    this.drawMap();
  }

  /**
   * Kurumsal Google Maps iki parçalı düzeni (Sidebar + Harita + Sol Alt Filtreler) çizer
   */
  render() {
    const waypoints = this.getWaypoints();

    this.container.innerHTML = `
      <div class="corp-maps-workspace" id="corp-maps-workspace">
        ${this.sidebarCtrl.renderSidebar(this, waypoints)}

        <!-- MERKEZ ALAN: Yıldızlı Siyah Zeminli Google Earth / Mars Trek Haritası -->
        <div class="corp-map-pane" id="corp-map-pane">
          <canvas id="mars-crater-canvas"></canvas>

          <!-- SOL ALT ZORUNLU FİLTRELER: 2D Görünüm, 3D Görünüm, Asit Yağmuru, Kum / Kasırga -->
          <div class="maps-bottom-left-filters" aria-label="Harita Görünüm ve Hava Filtreleri">
            <div class="maps-mode-group">
              <button class="maps-mode-btn ${this.viewMode === "2d" ? "active" : ""}" id="btn-mode-2d">2D Görünüm</button>
              <button class="maps-mode-btn ${this.viewMode === "3d" ? "active" : ""}" id="btn-mode-3d">3D Görünüm</button>
            </div>
            <label class="maps-filter-chip ${this.filterAcidRain ? "active-acid" : ""}">
              <input type="checkbox" id="filter-acid-rain" ${this.filterAcidRain ? "checked" : ""} />
              <span class="chip-dot dot-acid"></span>
              <span>Asit Yağmuru Filtresi</span>
            </label>
            <label class="maps-filter-chip ${this.filterDustStorm ? "active-storm" : ""}">
              <input type="checkbox" id="filter-dust-storm" ${this.filterDustStorm ? "checked" : ""} />
              <span class="chip-dot dot-storm"></span>
              <span>Kum Yağmuru / Kasırga Filtresi</span>
            </label>
          </div>

          <!-- SAĞ ALT: Sade Google Maps Zoom & Koordinat Kontrolü -->
          <div class="maps-bottom-right-controls">
            <div class="maps-zoom-stack">
              <button class="maps-zoom-btn" id="btn-zoom-in" title="Yaklaş">＋</button>
              <button class="maps-zoom-btn" id="btn-zoom-out" title="Uzaklaş">－</button>
              <button class="maps-zoom-btn" id="btn-reset-camera" title="Sıfırla">⌂</button>
            </div>
            <div class="maps-coord-bar" id="trek-hud-coords">
              ${this.activeCrater.name} • ${this.activeCrater.coordinates.lat.toFixed(2)}°, ${this.activeCrater.coordinates.lon.toFixed(2)}° • ${this.activeCrater.elevation_datum_m}m
            </div>
          </div>

          <div class="corp-toast" id="trek-toast"></div>
        </div>
      </div>
    `;

    this.sidebarCtrl.bindEvents(this.container);
    this.bindMapControls();
  }

  /**
   * Harita tuvalini ve sürükle-yakınlaştır olaylarını bağlar
   */
  bindCanvas() {
    this.canvas = document.getElementById("mars-crater-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.paneEl = document.getElementById("corp-map-pane");
    if (!this.canvas || !this.paneEl) return;

    this.resizeCanvas();
    this.canvas.addEventListener("mousedown", (e) => {
      this.isDragging = true;
      this.hasMovedDuringDrag = false;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
    });

    this.canvas.addEventListener("mousemove", (e) => {
      this.updateCursorTelemetry(e);
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      if (Math.hypot(dx, dy) > 3) this.hasMovedDuringDrag = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;

      if (this.mapScope === "globe") {
        this.rotLon -= dx * (0.28 / this.zoom);
        this.rotLat = Math.max(-78, Math.min(78, this.rotLat + dy * (0.28 / this.zoom)));
      } else {
        this.panX += dx;
        this.panY += dy;
      }
      this.drawMap();
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.applyZoom(this.zoom * (e.deltaY < 0 ? 1.12 : 0.89));
    }, { passive: false });

    this.canvas.addEventListener("click", (e) => {
      if (!this.hasMovedDuringDrag) this.handleCanvasClick(e);
    });
  }

  /**
   * Global fare bırakma ve yeniden boyutlandırma dinleyicileri
   */
  bindGlobalListeners() {
    window.addEventListener("mouseup", () => { this.isDragging = false; });
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this.drawMap();
    });
  }

  /**
   * Canvas ölçüsünü orta harita alanına uyarlar
   */
  resizeCanvas() {
    if (!this.canvas || !this.paneEl) return;
    const rect = this.paneEl.getBoundingClientRect();
    this.canvas.width = Math.max(rect.width, 300);
    this.canvas.height = Math.max(rect.height, 520);
  }

  /**
   * Sol alt ve sağ alt harita kontrollerini bağlar
   */
  bindMapControls() {
    document.getElementById("btn-mode-2d")?.addEventListener("click", () => {
      this.viewMode = "2d";
      if (this.mapScope === "globe") this.mapScope = "global2d";
      this.persistState();
      this.refreshUIAndMap();
    });

    document.getElementById("btn-mode-3d")?.addEventListener("click", () => {
      this.viewMode = "3d";
      if (this.mapScope === "global2d") this.mapScope = "globe";
      this.persistState();
      this.refreshUIAndMap();
    });

    document.getElementById("filter-acid-rain")?.addEventListener("change", (e) => {
      this.filterAcidRain = e.target.checked;
      this.persistState();
      this.refreshUIAndMap();
    });

    document.getElementById("filter-dust-storm")?.addEventListener("change", (e) => {
      this.filterDustStorm = e.target.checked;
      this.persistState();
      this.refreshUIAndMap();
    });

    document.getElementById("btn-zoom-in")?.addEventListener("click", () => this.applyZoom(this.zoom * 1.28));
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => this.applyZoom(this.zoom * 0.78));
    document.getElementById("btn-reset-camera")?.addEventListener("click", () => this.flyToOrbit());
  }

  /**
   * Yakınlaştırmayı ve küreden kratere otomatik geçişi yönetir
   */
  applyZoom(nextZoom) {
    this.zoom = Math.min(Math.max(nextZoom, 0.6), 3.6);
    if (this.mapScope !== "crater" && this.zoom >= 1.95) {
      this.flyToCrater(this.activeCraterIndex);
      return;
    }
    if (this.mapScope === "crater" && this.zoom < 0.72) {
      this.flyToOrbit();
      return;
    }
    this.drawMap();
  }

  /**
   * Küresel Mars yörünge görünümüne döner
   */
  flyToOrbit() {
    this.mapScope = this.viewMode === "2d" ? "global2d" : "globe";
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.selectedWaypoint = null;
    this.persistState();
    this.refreshUIAndMap();
  }

  /**
   * Seçilen kratere yakınlaştırarak yerel harita moduna geçer
   */
  flyToCrater(index) {
    if (index < 0 || index >= CRATERS_DATA.length) return;
    this.activeCraterIndex = index;
    this.activeCrater = CRATERS_DATA[index];
    this.rotLat = this.activeCrater.coordinates.lat;
    this.rotLon = this.activeCrater.coordinates.lon;
    this.mapScope = "crater";
    this.zoom = this.activeCrater.default_zoom || 1.15;
    this.panX = 0;
    this.panY = 0;
    const wps = this.getWaypoints();
    this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
    this.persistState();
    this.refreshUIAndMap();
  }

  /**
   * Sol paneldeki istasyon seçimiyle haritayı durağa odaklar
   */
  focusWaypointById(wpId) {
    const wp = this.getWaypoints().find((w) => w.id === wpId);
    if (!wp) return;
    this.mapScope = "crater";
    this.selectedWaypoint = wp;
    this.panX = -wp.relX * 0.45;
    this.panY = -wp.relY * 0.45;
    this.refreshUIAndMap();
  }

  /**
   * Harita üzerinde krater pini veya EVA durağı tıklamalarını işler
   */
  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (this.mapScope !== "crater") {
      const hit = this.globeHitTargets.find((t) => Math.hypot(clickX - t.x, clickY - t.y) <= t.r);
      if (hit) {
        const idx = CRATERS_DATA.findIndex((c) => c.id === hit.crater.id);
        if (idx >= 0) this.flyToCrater(idx);
      }
      return;
    }

    const localZoom = Math.max(0.7, this.zoom * 0.85);
    const cx = this.canvas.width / 2 + this.panX;
    const cy = this.canvas.height / 2 + this.panY;
    const exag = this.terrainExaggeration || 1.0;

    const clicked = this.getWaypoints().find((wp) => {
      const sx = cx + wp.relX * localZoom * (this.viewMode === "3d" ? 1.12 : 1.0);
      let sy = cy + wp.relY * localZoom * (this.viewMode === "3d" ? 0.56 : 1.0);
      if (this.viewMode === "3d") sy -= Math.max(10, ((wp.elev + 4600) / 26) * localZoom * exag);
      return Math.hypot(clickX - sx, clickY - sy) < 24;
    });

    if (clicked) {
      this.selectedWaypoint = clicked;
      this.refreshUIAndMap();
    }
  }

  /**
   * İmleç koordinatını sağ alt bilgi satırına yansıtır
   */
  updateCursorTelemetry(e) {
    const rect = this.canvas.getBoundingClientRect();
    const dx = e.clientX - rect.left - this.canvas.width / 2 - this.panX;
    const dy = e.clientY - rect.top - this.canvas.height / 2 - this.panY;
    const deg = 0.0008 / Math.max(this.zoom, 0.5);
    const lat = this.mapScope === "crater" ? this.activeCrater.coordinates.lat - dy * deg : this.rotLat - dy * 0.14;
    const lon = this.mapScope === "crater" ? this.activeCrater.coordinates.lon + dx * deg : this.rotLon + dx * 0.14;
    const elev = this.activeCrater.elevation_datum_m + Math.round(Math.hypot(dx, dy) * 3.5);

    const coordsEl = document.getElementById("trek-hud-coords");
    if (coordsEl) {
      coordsEl.innerText = `${this.activeCrater.name} • ${lat.toFixed(2)}°, ${lon.toFixed(2)}° • ${elev}m`;
    }
  }

  /**
   * Kısa sistem bildirimini gösterir
   */
  showToast(msg) {
    const toast = document.getElementById("trek-toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
  }

  /**
   * Görünümü ve tuval çizimini yeniler
   */
  refreshUIAndMap() {
    this.render();
    this.canvas = document.getElementById("mars-crater-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.paneEl = document.getElementById("corp-map-pane");
    this.bindCanvas();
    this.drawMap();
  }

  /**
   * Aktif görünüme göre küre veya yerel krater haritasını çizer
   */
  drawMap() {
    if (!this.ctx || !this.canvas) return;
    if (this.mapScope === "globe") {
      this.globeHitTargets = this.globeRenderer.renderGlobe(this.ctx, {
        width: this.canvas.width, height: this.canvas.height,
        rotLat: this.rotLat, rotLon: this.rotLon, zoom: this.zoom,
        craters: CRATERS_DATA, activeCrater: this.activeCrater,
        basemapOpacity: this.basemapOpacity, filterAcidRain: this.filterAcidRain,
        filterDustStorm: this.filterDustStorm, showGraticule: this.showGraticule,
        showNomenclature: this.showNomenclature
      });
    } else if (this.mapScope === "global2d") {
      this.globeHitTargets = this.globeRenderer.renderEquirectangular2D(this.ctx, {
        width: this.canvas.width, height: this.canvas.height,
        craters: CRATERS_DATA, activeCrater: this.activeCrater,
        basemapOpacity: this.basemapOpacity, showGraticule: this.showGraticule
      });
    } else {
      this.craterRenderer.render(this.ctx, {
        width: this.canvas.width, height: this.canvas.height,
        panX: this.panX, panY: this.panY, zoom: this.zoom,
        activeCrater: this.activeCrater, layers: this.layers,
        viewMode: this.viewMode, filterAcidRain: this.filterAcidRain,
        filterDustStorm: this.filterDustStorm, waypoints: this.getWaypoints(),
        selectedWaypoint: this.selectedWaypoint, terrainExaggeration: this.terrainExaggeration,
        basemapOpacity: this.basemapOpacity, showGraticule: this.showGraticule,
        showNomenclature: this.showNomenclature, measurePoints: []
      });
    }
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc sadeleştirilmiş kurumsal Google Maps & Mars Trek harita denetleyicisi tanımı.
   - Satır 7-51: constructor; alt render/depolama servislerini ve sol Google Maps kenar çubuğunu başlatır.
   - Satır 53-98: applyStateSnapshot, init, toggleSidebar, setSearchQuery, getWaypoints, persistState.
   - Satır 100-131: performFactoryReset ve updateSetting fabrika sıfırlama ile ayar değişim metotları.
   - Satır 133-175: render; solda temiz kenar çubuğu, merkezde yıldızlı harita, sol altta 2D/3D/Asit/Fırtına filtreleri ve sağ altta zoom kontrolünü üretir.
   - Satır 177-273: bindCanvas, bindGlobalListeners, resizeCanvas, bindMapControls olay dinleyicileri.
   - Satır 275-372: applyZoom, flyToOrbit, flyToCrater, focusWaypointById, handleCanvasClick, updateCursorTelemetry ve drawMap çizim yönlendiricisi.
   ========================================================================== */
