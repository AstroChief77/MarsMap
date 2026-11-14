/**
 * @file MarsGlobeViewer.js
 * @description Navbar olmadan tam ekran gezinebilen 3D/2D Mars Kuresi denetleyicisi.
 * Tum yuzey karolarini data/datasets/jpl_mars_trek_layers.json + data/tiles/ dizininden
 * ceker; surukleme, ataletli donus, tekerlek yakinlastirma ve krater ucusunu yonetir.
 */

import { CRATERS_DATA } from "../../data/craterLocations.js";
import { DatasetLoader } from "../services/DatasetLoader.js";
import { MarsTileLoader } from "../services/MarsTileLoader.js";
import { StateStorageService } from "../services/StateStorageService.js";
import { MarsGlobeRenderer } from "../renderers/MarsGlobeRenderer.js";
import { SettingsMenu } from "./SettingsMenu.js";

export class MarsGlobeViewer {
  /**
   * MarsGlobeViewer yapici metodu
   */
  constructor(containerId = "mars-globe-container", starfieldRef = null) {
    this.container = document.getElementById(containerId);
    this.starfieldRef = starfieldRef;
    this.storage = new StateStorageService();
    this.datasetLoader = new DatasetLoader();
    this.tileLoader = new MarsTileLoader(() => {
      this.updateTelemetryBar();
      this.drawGlobe();
    });
    this.renderer = new MarsGlobeRenderer(this.tileLoader);
    this.settingsMenu = new SettingsMenu({
      onFactoryReset: () => this.performFactoryReset(),
      onChangeSetting: (key, val) => this.updateSetting(key, val)
    });

    this.applyState(this.storage.loadState());
    this.landingSites = [];
    this.hazardsData = null;
    this.hitTargets = [];
    this.selectedCraterCard = null;

    this.isDragging = false;
    this.hasMoved = false;
    this.dragX = 0;
    this.dragY = 0;
    this.velLon = 0;
    this.velLat = 0;
    this.animFrame = null;
    this.hoverCoords = { lat: this.rotLat, lon: this.rotLon };
  }

  applyState(snap) {
    this.activeLayerId = snap.activeLayerId || "mars-viking-mdim21";
    this.activeCraterIndex = snap.activeCraterIndex ?? 0;
    this.viewMode = snap.viewMode || "3d";
    this.filterAcidRain = snap.filterAcidRain !== undefined ? snap.filterAcidRain : true;
    this.filterDustStorm = snap.filterDustStorm !== undefined ? snap.filterDustStorm : true;
    this.progressiveLodRender = snap.progressiveLodRender !== undefined ? snap.progressiveLodRender : true;
    this.showRadiationZones = snap.showRadiationZones !== undefined ? snap.showRadiationZones : true;
    this.showNomenclature = snap.showNomenclature !== undefined ? snap.showNomenclature : true;
    this.showGraticule = !!snap.showGraticule;
    this.showStarfield = snap.showStarfield !== undefined ? snap.showStarfield : true;
    this.basemapOpacity = snap.basemapOpacity || 1.0;
    this.oxygenReserveLiters = snap.oxygenReserveLiters || 420;
    this.waterReserveLiters = snap.waterReserveLiters || 24.0;
    this.rotLat = snap.rotLat ?? -4.59;
    this.rotLon = snap.rotLon ?? 137.44;
    this.zoom = snap.zoom ?? 1.08;
  }

  /**
   * Katalogdaki karo yollarini, inis sahalarini ve tehlike katmanlarini yukleyip kureyi baslatir
   */
  async init() {
    if (!this.container) return;

    const [, landingJson, hazardJson] = await Promise.all([
      this.tileLoader.initCatalog(),
      this.datasetLoader.getLandingSites(),
      this.datasetLoader.getEnvironmentalHazards()
    ]);

    this.landingSites = landingJson?.landing_sites || [];
    this.hazardsData = hazardJson;

    this.renderUI();
    this.bindCanvas();
    this.bindGlobalListeners();
    this.requestTilesForView();
    this.drawGlobe();
  }

  persistState() {
    this.storage.saveState({
      activeLayerId: this.activeLayerId,
      activeCraterIndex: this.activeCraterIndex,
      viewMode: this.viewMode,
      filterAcidRain: this.filterAcidRain,
      filterDustStorm: this.filterDustStorm,
      progressiveLodRender: this.progressiveLodRender,
      showRadiationZones: this.showRadiationZones,
      showNomenclature: this.showNomenclature,
      showGraticule: this.showGraticule,
      showStarfield: this.showStarfield,
      basemapOpacity: this.basemapOpacity,
      rotLat: Number(this.rotLat.toFixed(3)),
      rotLon: Number(this.rotLon.toFixed(3)),
      zoom: Number(this.zoom.toFixed(3))
    });
  }

  performFactoryReset() {
    this.selectedCraterCard = null;
    const defaults = this.storage.factoryReset();
    this.applyState(defaults);
    if (this.starfieldRef?.canvas) {
      this.starfieldRef.canvas.style.opacity = "1";
    }
    this.refreshAll();
    this.showToast("Factory Reset: Ölçekli data/tiles LOD, Litre/km/Saat/Alfa-Beta-Gama sıfırlandı");
  }

  updateSetting(key, val) {
    this[key] = val;
    if (key === "showStarfield" && this.starfieldRef?.canvas) {
      this.starfieldRef.canvas.style.opacity = val ? "1" : "0.08";
    }
    this.persistState();
    this.refreshAll();
  }

  /**
   * Gorunur kamera bolgesi icin data/tiles icindeki karolari talep eder
   */
  requestTilesForView() {
    this.tileLoader.requestVisibleTiles(this.activeLayerId, {
      rotLat: this.rotLat,
      rotLon: this.rotLon,
      zoom: this.zoom,
      viewMode: this.viewMode,
      progressiveLodRender: this.progressiveLodRender
    });
  }

  /**
   * Navbar'siz temiz tam ekran kure arayuzunu DOM'a yazar
   */
  renderUI() {
    const layers = this.tileLoader.getLayers();
    const activeCrater = CRATERS_DATA[this.activeCraterIndex] || CRATERS_DATA[0];
    const layerChips = layers.map((l) => `
      <button class="globe-layer-btn ${l.id === this.activeLayerId ? "active" : ""}" data-layer-id="${l.id}" title="${l.description}">
        ${l.name}
      </button>
    `).join("");

    const craterChips = CRATERS_DATA.map((c, idx) => `
      <button class="globe-crater-chip ${this.selectedCraterCard?.id === c.id ? "active" : ""}" data-crater-idx="${idx}">
        ${c.id === "gale-crater" ? "★ Gale" : c.id === "jezero-crater" ? "Jezero" : "Korolev"}
      </button>
    `).join("");

    const infoCardHtml = this.selectedCraterCard ? `
      <div class="globe-crater-card" id="globe-crater-card">
        <div class="gcc-top">
          <span class="gcc-badge">${this.selectedCraterCard.tag}</span>
          <button class="gcc-close" id="btn-close-crater-card" title="Kapat">✕</button>
        </div>
        <h3 class="gcc-title">${this.selectedCraterCard.name}</h3>
        <div class="gcc-metrics">
          <span>Çap: <strong>${this.selectedCraterCard.diameter_km} km</strong></span>
          <span>Derinlik: <strong>${this.selectedCraterCard.depth_m} m</strong></span>
          <span>Konum: <strong>${this.selectedCraterCard.coordinates.lat.toFixed(2)}°, ${this.selectedCraterCard.coordinates.lon.toFixed(2)}°</strong></span>
        </div>
        <p class="gcc-desc">${this.selectedCraterCard.description}</p>
        <div class="gcc-backend-note">Rota / Pathfind hesaplaması backend servisinden çekilmek üzere hazır bekliyor.</div>
      </div>
    ` : "";

    this.container.innerHTML = `
      <div class="globe-stage" id="globe-stage">
        <canvas id="mars-globe-canvas"></canvas>

        <!-- SOL UST: Sadece Yuzer Ayarlar Simgesi (1. Secenek: Factory Reset) + Hizli Katman & Hedef -->
        <div class="globe-top-left">
          ${this.settingsMenu.renderMarkup(this)}
          <div class="globe-layer-strip" aria-label="data/tiles Katmanları">
            ${layerChips}
          </div>
          <div class="globe-crater-strip" aria-label="Hedef Kraterler">
            ${craterChips}
          </div>
        </div>

        ${infoCardHtml}

        <!-- SOL ALT: Zorunlu 2D / 3D / Asit Yagmuru / Kum Firtinasi Filtreleri -->
        <div class="globe-bottom-left" aria-label="Görünüm ve Tehlike Filtreleri">
          <div class="globe-mode-switch">
            <button class="globe-mode-btn ${this.viewMode === "2d" ? "active" : ""}" id="btn-mode-2d">2D Görünüm</button>
            <button class="globe-mode-btn ${this.viewMode === "3d" ? "active" : ""}" id="btn-mode-3d">3D Görünüm</button>
          </div>
          <label class="globe-filter-chip ${this.filterAcidRain ? "active-acid" : ""}">
            <input type="checkbox" id="filter-acid-rain" ${this.filterAcidRain ? "checked" : ""} />
            <span class="chip-dot dot-acid"></span>
            <span>Asit Yağmuru Filtresi</span>
          </label>
          <label class="globe-filter-chip ${this.filterDustStorm ? "active-storm" : ""}">
            <input type="checkbox" id="filter-dust-storm" ${this.filterDustStorm ? "checked" : ""} />
            <span class="chip-dot dot-storm"></span>
            <span>Kum Yağmuru / Kasırga Filtresi</span>
          </label>
        </div>

        <!-- SAG ALT: Zoom Kontrolu ve Yerel data/tiles Telemetri Cubugu -->
        <div class="globe-bottom-right">
          <div class="globe-zoom-stack">
            <button class="globe-zoom-btn" id="btn-zoom-in" title="Yaklaş">＋</button>
            <button class="globe-zoom-btn" id="btn-zoom-out" title="Uzaklaş">－</button>
            <button class="globe-zoom-btn" id="btn-reset-orbit" title="Küre Görünümünü Sıfırla">⌂</button>
          </div>
          <div class="globe-telemetry-bar" id="globe-telemetry-bar"></div>
        </div>

        <div class="globe-toast" id="globe-toast"></div>
      </div>
    `;

    this.settingsMenu.bindEvents();
    this.bindOverlayControls();
    this.updateTelemetryBar();
  }

  bindOverlayControls() {
    document.querySelectorAll("[data-layer-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        this.activeLayerId = btn.getAttribute("data-layer-id");
        this.persistState();
        this.refreshAll();
      });
    });

    document.querySelectorAll("[data-crater-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-crater-idx"), 10);
        this.flyToCrater(idx);
      });
    });

    document.getElementById("btn-close-crater-card")?.addEventListener("click", () => {
      this.selectedCraterCard = null;
      this.refreshAll();
    });

    document.getElementById("btn-mode-2d")?.addEventListener("click", () => {
      this.viewMode = "2d";
      this.persistState();
      this.refreshAll();
    });
    document.getElementById("btn-mode-3d")?.addEventListener("click", () => {
      this.viewMode = "3d";
      this.persistState();
      this.refreshAll();
    });
    document.getElementById("filter-acid-rain")?.addEventListener("change", (e) => {
      this.filterAcidRain = e.target.checked;
      this.persistState();
      this.refreshAll();
    });
    document.getElementById("filter-dust-storm")?.addEventListener("change", (e) => {
      this.filterDustStorm = e.target.checked;
      this.persistState();
      this.refreshAll();
    });

    document.getElementById("btn-zoom-in")?.addEventListener("click", () => this.applyZoom(this.zoom * 1.25));
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => this.applyZoom(this.zoom * 0.8));
    document.getElementById("btn-reset-orbit")?.addEventListener("click", () => {
      this.selectedCraterCard = null;
      this.animateToTarget(-4.59, 137.44, 1.08);
    });
  }

  bindCanvas() {
    this.canvas = document.getElementById("mars-globe-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    if (!this.canvas) return;
    this.resizeCanvas();

    this.canvas.addEventListener("mousedown", (e) => {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      this.isDragging = true;
      this.hasMoved = false;
      this.dragX = e.clientX;
      this.dragY = e.clientY;
      this.velLon = 0;
      this.velLat = 0;
    });

    this.canvas.addEventListener("mousemove", (e) => {
      this.updateHoverCoords(e);
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragX;
      const dy = e.clientY - this.dragY;
      if (Math.hypot(dx, dy) > 2) this.hasMoved = true;
      this.dragX = e.clientX;
      this.dragY = e.clientY;

      const stepLon = -dx * (0.28 / this.zoom);
      const stepLat = dy * (0.28 / this.zoom);
      this.velLon = stepLon * 0.7;
      this.velLat = stepLat * 0.7;

      this.rotLon = this.normalizeLon(this.rotLon + stepLon);
      this.rotLat = Math.max(-84, Math.min(84, this.rotLat + stepLat));
      this.requestTilesForView();
      this.drawGlobe();
      this.updateTelemetryBar();
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.applyZoom(this.zoom * (e.deltaY < 0 ? 1.14 : 0.88));
    }, { passive: false });

    this.canvas.addEventListener("click", (e) => {
      if (!this.hasMoved) this.handleCanvasClick(e);
    });
  }

  bindGlobalListeners() {
    if (this.globalBound) return;
    this.globalBound = true;

    window.addEventListener("mouseup", () => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.startInertiaLoop();
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest("#trek-settings-anchor")) {
        this.settingsMenu.close();
      }
    });
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this.drawGlobe();
    });
  }

  startInertiaLoop() {
    const step = () => {
      if (Math.abs(this.velLon) < 0.04 && Math.abs(this.velLat) < 0.04) {
        this.drawGlobe();
        this.persistState();
        return;
      }
      this.rotLon = this.normalizeLon(this.rotLon + this.velLon);
      this.rotLat = Math.max(-84, Math.min(84, this.rotLat + this.velLat));
      this.velLon *= 0.88;
      this.velLat *= 0.88;
      this.requestTilesForView();
      this.drawGlobe();
      this.updateTelemetryBar();
      this.animFrame = requestAnimationFrame(step);
    };
    this.animFrame = requestAnimationFrame(step);
  }

  animateToTarget(targetLat, targetLon, targetZoom) {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    let dLon = targetLon - this.rotLon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;

    const startLat = this.rotLat;
    const startLon = this.rotLon;
    const startZoom = this.zoom;
    const startTime = performance.now();
    const duration = 520;

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      this.rotLat = startLat + (targetLat - startLat) * ease;
      this.rotLon = this.normalizeLon(startLon + dLon * ease);
      this.zoom = startZoom + (targetZoom - startZoom) * ease;
      this.requestTilesForView();
      this.drawGlobe();
      this.updateTelemetryBar();
      if (t < 1) {
        this.animFrame = requestAnimationFrame(tick);
      } else {
        this.persistState();
      }
    };
    this.animFrame = requestAnimationFrame(tick);
  }

  flyToCrater(index) {
    if (index < 0 || index >= CRATERS_DATA.length) return;
    this.activeCraterIndex = index;
    const crater = CRATERS_DATA[index];
    this.selectedCraterCard = crater;
    this.renderUI();
    this.bindCanvas();
    this.animateToTarget(crater.coordinates.lat, crater.coordinates.lon, Math.max(this.zoom, 1.45));
  }

  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const hit = this.hitTargets.find((t) => Math.hypot(cx - t.x, cy - t.y) <= t.r);
    if (hit) {
      const idx = CRATERS_DATA.findIndex((c) => c.id === hit.crater.id);
      if (idx >= 0) this.flyToCrater(idx);
    }
  }

  applyZoom(nextZoom) {
    this.zoom = Math.min(Math.max(nextZoom, 0.65), 3.6);
    this.requestTilesForView();
    this.drawGlobe();
    this.updateTelemetryBar();
    this.persistState();
  }

  normalizeLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
  }

  resizeCanvas() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  updateHoverCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const dx = e.clientX - rect.left - this.canvas.width / 2;
    const dy = e.clientY - rect.top - this.canvas.height / 2;
    this.hoverCoords = {
      lat: Math.max(-90, Math.min(90, this.rotLat - dy * (0.14 / this.zoom))),
      lon: this.normalizeLon(this.rotLon + dx * (0.14 / this.zoom))
    };
    this.updateTelemetryBar();
  }

  updateTelemetryBar() {
    const bar = document.getElementById("globe-telemetry-bar");
    if (!bar) return;
    const stats = this.tileLoader.getLayerStats(this.activeLayerId);
    bar.innerText = `${this.hoverCoords.lat.toFixed(2)}°, ${this.hoverCoords.lon.toFixed(2)}° • ${stats.name} • z=${stats.zoom} (${stats.loaded} karo: ${stats.sourceDir})`;
  }

  showToast(msg) {
    const toast = document.getElementById("globe-toast");
    if (!toast) return;
    toast.innerText = msg;
    toast.classList.add("show");
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }

  refreshAll() {
    this.renderUI();
    this.bindCanvas();
    this.requestTilesForView();
    this.drawGlobe();
  }

  drawGlobe() {
    if (!this.ctx || !this.canvas) return;
    const payload = {
      width: this.canvas.width,
      height: this.canvas.height,
      rotLat: this.rotLat,
      rotLon: this.rotLon,
      zoom: this.zoom,
      activeLayerId: this.activeLayerId,
      isDragging: this.isDragging,
      craters: CRATERS_DATA,
      landingSites: this.landingSites,
      hazardsData: this.hazardsData,
      activeCrater: CRATERS_DATA[this.activeCraterIndex],
      basemapOpacity: this.basemapOpacity,
      filterAcidRain: this.filterAcidRain,
      filterDustStorm: this.filterDustStorm,
      showGraticule: this.showGraticule,
      showNomenclature: this.showNomenclature,
      showRadiationZones: this.showRadiationZones,
      progressiveLodRender: this.progressiveLodRender
    };

    if (this.viewMode === "2d") {
      this.hitTargets = this.renderer.render2DTiled(this.ctx, payload);
    } else {
      this.hitTargets = this.renderer.renderGlobe(this.ctx, payload);
    }
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc Navbar'siz tam ekran Mars Kuresi denetleyicisi tanıtımı.
   - Satir 15-64: constructor & applyState; MarsTileLoader, MarsGlobeRenderer ve Factory SettingsMenu baglantilarini kurar.
   - Satir 66-127: init, persistState, performFactoryReset, updateSetting, requestTilesForView; data/ altindaki karolari yukler.
   - Satir 129-247: renderUI & bindOverlayControls; katman secici, 2D/3D/Asit/Firtina filtreleri ve sol ust Factory Reset menusunu baglar.
   - Satir 249-388: bindCanvas, ataletli donus animasyonu (startInertiaLoop), yumusak krater ucusu (animateToTarget) ve telemetri cubugu.
   ========================================================================== */
