/**
 * @file MarsGlobeViewer.js
 * @description Navbar olmadan tam ekran HiDPI Mars Kuresi + Backend API Kanca Denetleyicisi.
 * Yakinlastikca data/tiles ve NASA WMTS uzerinden 1:1 netlikte cizim yapar; Backend icin A/B
 * koordinat secimi, canli parametre gonderimi (/api/v1/*) ve rota cizim yuvalarini acik tutar.
 */

import { CRATERS_DATA } from "../../data/craterLocations.js";
import { DatasetLoader } from "../services/DatasetLoader.js";
import { BackendApiService } from "../services/BackendApiService.js";
import { MarsTileLoader } from "../services/MarsTileLoader.js";
import { StateStorageService } from "../services/StateStorageService.js";
import { MarsGlobeRenderer } from "../renderers/MarsGlobeRenderer.js";
import { SettingsMenu } from "./SettingsMenu.js";
import { SatelliteDockMenu } from "./SatelliteDockMenu.js";

export class MarsGlobeViewer {
  constructor(containerId = "mars-globe-container", starfieldRef = null) {
    this.container = document.getElementById(containerId);
    this.starfieldRef = starfieldRef;
    this.storage = new StateStorageService();
    this.datasetLoader = new DatasetLoader();
    this.applyState(this.storage.loadState());

    this.backendApi = new BackendApiService(this.backendApiUrl);
    if (this.backendApi.hasBackend() && !this.backendApiUrl) {
      this.backendApiUrl = this.backendApi.baseUrl;
    }

    this.tileLoader = new MarsTileLoader(() => {
      this.updateTelemetryBar();
      this.drawGlobe();
    }, this.backendApi);

    this.renderer = new MarsGlobeRenderer(this.tileLoader);
    this.settingsMenu = new SettingsMenu({
      onFactoryReset: () => this.performFactoryReset(),
      onChangeSetting: (key, val) => this.updateSetting(key, val),
      onUpdateBackendUrl: (url) => this.connectBackend(url)
    });
    this.satelliteDock = new SatelliteDockMenu({
      onChangeViewMode: (mode) => this.updateSetting("viewMode", mode),
      onChangeSetting: (key, val) => this.updateSetting(key, val),
      onToggleFilter: (key) => this.updateSetting(key, !this[key]),
      onSetSeverity: (sevKey, toggleKey, level) => {
        this[sevKey] = level;
        this[toggleKey] = true;
        this.persistState();
        this.refreshAll();
      }
    });

    this.landingSites = [];
    this.hazardsData = null;
    this.hitTargets = [];
    this.selectedCraterCard = null;
    this.pickMode = null; // 'start' | 'goal' | null
    this.startPoint = { lat: -4.5895, lon: 137.4417 };
    this.goalPoint = { lat: -4.712, lon: 137.584 };
    this.backendRoutes = null;
    this.backendNote = this.backendApi.hasBackend() ? "Bağlantı test ediliyor..." : "Backend URL bekleniyor";
    this.showBackendPanel = true;

    this.logicalWidth = window.innerWidth;
    this.logicalHeight = window.innerHeight;
    this.isDragging = false;
    this.hasMoved = false;
    this.dragX = 0;
    this.dragY = 0;
    this.velLon = 0;
    this.velLat = 0;
    this.animFrame = null;
    this.wheelSettleTimer = null;
    this.hoverCoords = { lat: this.rotLat, lon: this.rotLon };
  }

  applyState(snap) {
    this.activeLayerId = snap.activeLayerId || "mars-viking-mdim21";
    this.activeCraterIndex = snap.activeCraterIndex ?? 0;
    this.viewMode = snap.viewMode || "3d";
    this.filterAcidRain = snap.filterAcidRain !== undefined ? snap.filterAcidRain : true;
    this.acidIntensity = snap.acidIntensity || "moderate";
    this.filterDustStorm = snap.filterDustStorm !== undefined ? snap.filterDustStorm : true;
    this.stormIntensity = snap.stormIntensity || "moderate";
    this.progressiveLodRender = snap.progressiveLodRender !== undefined ? snap.progressiveLodRender : true;
    this.craterFocusOptimize = snap.craterFocusOptimize !== undefined ? snap.craterFocusOptimize : true;
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
    this.backendApiUrl = snap.backendApiUrl || "";
  }

  async init() {
    if (!this.container) return;

    const [, landingJson, hazardJson] = await Promise.all([
      this.tileLoader.initCatalog(),
      this.datasetLoader.getLandingSites(),
      this.datasetLoader.getEnvironmentalHazards()
    ]);

    this.landingSites = landingJson?.landing_sites || [];
    this.hazardsData = hazardJson;

    if (this.backendApi.hasBackend()) {
      await this.checkAndSyncBackend(false);
    }

    this.renderUI();
    this.bindCanvas();
    this.bindGlobalListeners();
    this.requestTilesForView();
    this.drawGlobe();

    window.astroChiefGlobe = this;
  }

  async connectBackend(url) {
    this.backendApiUrl = url.trim().replace(/\/+$/, "");
    this.backendApi.setBaseUrl(this.backendApiUrl);
    this.persistState();
    await this.checkAndSyncBackend(true);
    this.refreshAll();
  }

  async checkAndSyncBackend(showNotice = true) {
    if (!this.backendApi.hasBackend()) {
      this.backendNote = "Backend URL tanımlanmadı";
      return;
    }
    const res = await this.backendApi.checkHealth();
    if (res.ok) {
      this.backendNote = `Bağlı (${res.data?.version || "v1"})`;
      if (showNotice) this.showToast(`Backend bağlantısı başarılı: ${this.backendApi.baseUrl}`);
    } else {
      this.backendNote = `Erişim yok: ${res.reason}`;
      if (showNotice) this.showToast(`Backend yanıt vermedi (${res.reason})`);
    }
  }

  /**
   * Backend /api/v1/pathfind/compute endpoint'ine A->B ve aktif filtre parametrelerini gonderir
   */
  async triggerBackendPathfind() {
    const appState = this.getBackendAppState();
    const res = await this.backendApi.requestPathfind(this.startPoint, this.goalPoint, appState);

    if (res.ok && res.data) {
      this.applyBackendRoutes(res.data);
      this.showToast("Backend rotaları (Mavi / Soluk Mavi) haritaya işlendi");
    } else {
      this.backendNote = res.reason;
      this.refreshAll();
      this.showToast(res.reason || "Backend sunucusu bekleniyor");
    }
  }

  applyBackendRoutes(routePayload) {
    this.backendRoutes = routePayload;
    this.backendNote = "Rotalar güncellendi";
    this.refreshAll();
  }

  getBackendAppState() {
    const activeCrater = CRATERS_DATA[this.activeCraterIndex] || CRATERS_DATA[0];
    return {
      craterId: activeCrater.id,
      filterAcidRain: this.filterAcidRain,
      acidIntensity: this.acidIntensity,
      filterDustStorm: this.filterDustStorm,
      stormIntensity: this.stormIntensity,
      showRadiationZones: this.showRadiationZones,
      oxygenReserveLiters: this.oxygenReserveLiters,
      waterReserveLiters: this.waterReserveLiters
    };
  }

  getSelectedPoints() {
    return { start: this.startPoint, goal: this.goalPoint, backendRoutes: this.backendRoutes };
  }

  persistState() {
    this.storage.saveState({
      activeLayerId: this.activeLayerId,
      activeCraterIndex: this.activeCraterIndex,
      viewMode: this.viewMode,
      filterAcidRain: this.filterAcidRain,
      acidIntensity: this.acidIntensity,
      filterDustStorm: this.filterDustStorm,
      stormIntensity: this.stormIntensity,
      progressiveLodRender: this.progressiveLodRender,
      craterFocusOptimize: this.craterFocusOptimize,
      showRadiationZones: this.showRadiationZones,
      showNomenclature: this.showNomenclature,
      showGraticule: this.showGraticule,
      showStarfield: this.showStarfield,
      basemapOpacity: this.basemapOpacity,
      rotLat: Number(this.rotLat.toFixed(4)),
      rotLon: Number(this.rotLon.toFixed(4)),
      zoom: Number(this.zoom.toFixed(3)),
      backendApiUrl: this.backendApiUrl
    });
  }

  performFactoryReset() {
    this.selectedCraterCard = null;
    this.pickMode = null;
    this.backendRoutes = null;
    const defaults = this.storage.factoryReset();
    this.applyState(defaults);
    this.backendApi.setBaseUrl("");
    this.backendNote = "Backend URL bekleniyor";
    if (this.starfieldRef?.canvas) {
      this.starfieldRef.canvas.style.opacity = "1";
    }
    this.refreshAll();
    this.showToast("Factory Reset: Tam kalite tile LOD, birimler ve küre sıfırlandı");
  }

  updateSetting(key, val) {
    this[key] = val;
    if (key === "showStarfield" && this.starfieldRef?.canvas) {
      this.starfieldRef.canvas.style.opacity = val ? "1" : "0.08";
    }
    this.persistState();
    this.refreshAll();
  }

  requestTilesForView() {
    const sphereRadiusPx = this.renderer.getSphereRadius(this.logicalWidth, this.logicalHeight, this.zoom);
    const activeCrater = CRATERS_DATA[this.activeCraterIndex] || CRATERS_DATA[0];
    this.tileLoader.requestVisibleTiles(this.activeLayerId, {
      rotLat: this.rotLat,
      rotLon: this.rotLon,
      zoom: this.zoom,
      sphereRadiusPx,
      viewMode: this.viewMode,
      progressiveLodRender: this.progressiveLodRender,
      craterFocusOptimize: this.craterFocusOptimize,
      activeCrater
    });
  }

  renderUI() {
    const layers = this.tileLoader.getLayers();
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

    const pri = this.backendRoutes?.primary_route?.summary;
    const sec = this.backendRoutes?.alternative_route?.summary;
    const routeSummaryHtml = (pri || sec) ? `
      <div class="backend-route-results">
        ${pri ? `<div class="brr-row brr-blue"><strong>Mavi Yol:</strong> ${pri.total_km} km (${pri.total_meters} m) • ${pri.duration_hours} sa • ${pri.o2_liters}L O2</div>` : ""}
        ${sec ? `<div class="brr-row brr-pale"><strong>Soluk Mavi:</strong> ${sec.total_km} km • ${sec.duration_hours} sa • ${sec.o2_liters}L O2</div>` : ""}
      </div>
    ` : "";

    const backendPanelHtml = `
      <div class="globe-backend-dock ${this.showBackendPanel ? "open" : "minimized"}">
        <div class="gbd-header">
          <span class="gbd-title">Backend Rota Kancası</span>
          <span class="gbd-status ${this.backendApi.status}">${this.backendApi.hasBackend() ? this.backendApi.status : "AÇIK"}</span>
        </div>
        <div class="gbd-coords">
          <button class="gbd-pick-btn ${this.pickMode === "start" ? "picking" : ""}" id="btn-pick-start" title="Haritada Başlangıç (A) seç">
            A: ${this.startPoint.lat.toFixed(2)}°, ${this.startPoint.lon.toFixed(2)}°
          </button>
          <button class="gbd-pick-btn ${this.pickMode === "goal" ? "picking" : ""}" id="btn-pick-goal" title="Haritada Hedef (B) seç">
            B: ${this.goalPoint.lat.toFixed(2)}°, ${this.goalPoint.lon.toFixed(2)}°
          </button>
        </div>
        ${this.pickMode ? `<div class="gbd-pick-hint">Harita üzerinde ${this.pickMode === "start" ? "A (Başlangıç)" : "B (Hedef)"} noktasına tıklayın...</div>` : ""}
        <div class="gbd-actions">
          <button class="gbd-compute-btn" id="btn-post-pathfind">POST /api/v1/pathfind/compute</button>
        </div>
        ${routeSummaryHtml}
        <div class="gbd-foot">${this.backendNote}</div>
      </div>
    `;

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
      </div>
    ` : "";

    this.container.innerHTML = `
      <div class="globe-stage ${this.pickMode ? "pick-cursor" : ""}" id="globe-stage">
        <canvas id="mars-globe-canvas"></canvas>

        <!-- SOL UST: Ayarlar (1. Secenek: Factory Reset) + Katmanlar + Kraterler -->
        <div class="globe-top-left">
          ${this.settingsMenu.renderMarkup(this, this.backendApi.status)}
          <div class="globe-layer-strip" aria-label="Harita Katmanları">
            ${layerChips}
          </div>
          <div class="globe-crater-strip" aria-label="Hedef Kraterler">
            ${craterChips}
          </div>
        </div>

        <!-- SAG UST: Backend API Rota Kancasi + Krater Karti -->
        <div class="globe-top-right">
          ${backendPanelHtml}
          ${infoCardHtml}
        </div>

        <!-- SOL ALT: Uydular Paneli (Acilir Pencerede 2D/3D + Fotografli Asit/Kasirga Siddetleri) -->
        ${this.satelliteDock.renderMarkup(this)}

        <!-- SAG ALT: Zoom ve HiDPI Tile Telemetrisi -->
        <div class="globe-bottom-right">
          <div class="globe-zoom-stack">
            <button class="globe-zoom-btn" id="btn-zoom-in" title="Yaklaş (Tam Kalite Tile LOD Artır)">＋</button>
            <button class="globe-zoom-btn" id="btn-zoom-out" title="Uzaklaş">－</button>
            <button class="globe-zoom-btn" id="btn-reset-orbit" title="Küre Görünümünü Sıfırla">⌂</button>
          </div>
          <div class="globe-telemetry-bar" id="globe-telemetry-bar"></div>
        </div>

        <div class="globe-toast" id="globe-toast"></div>
      </div>
    `;

    this.settingsMenu.bindEvents();
    this.satelliteDock.bindEvents();
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
        this.flyToCrater(parseInt(btn.getAttribute("data-crater-idx"), 10));
      });
    });

    document.getElementById("btn-close-crater-card")?.addEventListener("click", () => {
      this.selectedCraterCard = null;
      this.refreshAll();
    });

    document.getElementById("btn-pick-start")?.addEventListener("click", () => {
      this.pickMode = this.pickMode === "start" ? null : "start";
      this.refreshAll();
    });
    document.getElementById("btn-pick-goal")?.addEventListener("click", () => {
      this.pickMode = this.pickMode === "goal" ? null : "goal";
      this.refreshAll();
    });
    document.getElementById("btn-post-pathfind")?.addEventListener("click", () => {
      this.triggerBackendPathfind();
    });

    document.getElementById("btn-zoom-in")?.addEventListener("click", () => this.applyZoom(this.zoom * 1.38));
    document.getElementById("btn-zoom-out")?.addEventListener("click", () => this.applyZoom(this.zoom * 0.72));
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
      this.velLon = stepLon * 0.65;
      this.velLat = stepLat * 0.65;

      this.rotLon = this.normalizeLon(this.rotLon + stepLon);
      this.rotLat = Math.max(-85, Math.min(85, this.rotLat + stepLat));
      this.requestTilesForView();
      this.drawGlobe();
      this.updateTelemetryBar();
    });

    this.canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.applyZoom(this.zoom * (e.deltaY < 0 ? 1.18 : 0.85));
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
      if (!e.target.closest("#trek-settings-anchor")) this.settingsMenu.close();
      if (!e.target.closest(".globe-bottom-left")) this.satelliteDock.close();
    });
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this.requestTilesForView();
      this.drawGlobe();
    });
  }

  startInertiaLoop() {
    const step = () => {
      if (Math.abs(this.velLon) < 0.04 && Math.abs(this.velLat) < 0.04) {
        this.drawGlobe();
        this.persistState();
        this.emitViewportEvent();
        return;
      }
      this.rotLon = this.normalizeLon(this.rotLon + this.velLon);
      this.rotLat = Math.max(-85, Math.min(85, this.rotLat + this.velLat));
      this.velLon *= 0.86;
      this.velLat *= 0.86;
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

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / 520);
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
        this.emitViewportEvent();
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
    this.animateToTarget(crater.coordinates.lat, crater.coordinates.lon, Math.max(this.zoom, 3.4));
  }

  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    // A veya B koordinat secme modundaysa tiklanan gercek Mars (lat, lon) degerini yakala
    if (this.pickMode) {
      const picked = this.renderer.screenToLatLon(cx, cy, this.buildRenderState());
      if (picked) {
        if (this.pickMode === "start") this.startPoint = picked;
        else this.goalPoint = picked;
        window.dispatchEvent(new CustomEvent("astrochief:coordinate-picked", {
          detail: { role: this.pickMode, lat: picked.lat, lon: picked.lon }
        }));
        this.pickMode = null;
        this.refreshAll();
      }
      return;
    }

    const hit = this.hitTargets.find((t) => Math.hypot(cx - t.x, cy - t.y) <= t.r);
    if (hit) {
      const idx = CRATERS_DATA.findIndex((c) => c.id === hit.crater.id);
      if (idx >= 0) this.flyToCrater(idx);
    }
  }

  applyZoom(nextZoom) {
    this.zoom = Math.min(Math.max(nextZoom, 0.65), 14.0);
    this.requestTilesForView();
    this.drawGlobe();
    this.updateTelemetryBar();
    clearTimeout(this.wheelSettleTimer);
    this.wheelSettleTimer = setTimeout(() => {
      this.persistState();
      this.emitViewportEvent();
    }, 120);
  }

  emitViewportEvent() {
    const stats = this.tileLoader.getLayerStats(this.activeLayerId);
    window.dispatchEvent(new CustomEvent("astrochief:viewport-changed", {
      detail: { rotLat: this.rotLat, rotLon: this.rotLon, zoom: this.zoom, layerId: this.activeLayerId, activeTileZ: stats.zoom }
    }));
  }

  normalizeLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
  }

  resizeCanvas() {
    if (!this.canvas || !this.ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.logicalWidth = window.innerWidth;
    this.logicalHeight = window.innerHeight;
    this.canvas.width = Math.round(this.logicalWidth * dpr);
    this.canvas.height = Math.round(this.logicalHeight * dpr);
    this.canvas.style.width = `${this.logicalWidth}px`;
    this.canvas.style.height = `${this.logicalHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  updateHoverCoords(e) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const mapped = this.renderer.screenToLatLon(e.clientX - rect.left, e.clientY - rect.top, this.buildRenderState());
    if (mapped) {
      this.hoverCoords = mapped;
      this.updateTelemetryBar();
    }
  }

  updateTelemetryBar() {
    const bar = document.getElementById("globe-telemetry-bar");
    if (!bar) return;
    const stats = this.tileLoader.getLayerStats(this.activeLayerId);
    const rStats = this.renderer.lastRenderStats;
    const focusTag = this.craterFocusOptimize && rStats?.hasFocus
      ? ` • ★ ${(CRATERS_DATA[this.activeCraterIndex]?.id || "gale").replace("-crater", "").toUpperCase()} 1:1 (-%${rStats.savedPct} yük)`
      : "";
    bar.innerText = `${this.hoverCoords.lat.toFixed(3)}°, ${this.hoverCoords.lon.toFixed(3)}° • ${stats.name} • z=${stats.zoom} (${stats.loaded} karo)${focusTag}`;
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

  buildRenderState() {
    return {
      width: this.logicalWidth,
      height: this.logicalHeight,
      rotLat: this.rotLat,
      rotLon: this.rotLon,
      zoom: this.zoom,
      viewMode: this.viewMode,
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
      progressiveLodRender: this.progressiveLodRender,
      craterFocusOptimize: this.craterFocusOptimize,
      startPoint: this.startPoint,
      goalPoint: this.goalPoint,
      backendRoutes: this.backendRoutes
    };
  }

  drawGlobe() {
    if (!this.ctx || !this.canvas) return;
    const payload = this.buildRenderState();
    this.hitTargets = this.viewMode === "2d"
      ? this.renderer.render2DTiled(this.ctx, payload)
      : this.renderer.renderGlobe(this.ctx, payload);
    this.updateTelemetryBar();
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc HiDPI Mars Kuresi ve Backend API (/api/v1/*) baglanti denetleyicisi.
   - Satir 16-95: constructor, applyState ve init; SatelliteDockMenu, SettingsMenu, BackendApiService ve MarsTileLoader baglantilarini kurar.
   - Satir 97-155: connectBackend, checkAndSyncBackend, triggerBackendPathfind ve applyBackendRoutes; Backend rota cizim akisi.
   - Satir 157-395: renderUI & bindOverlayControls; Uydular paneli, Backend A/B nokta secicisi ve Ayarlar Factory Reset kontrolleri.
   - Satir 397-648: HiDPI resizeCanvas, ataletli donus, 14x'e kadar tam kalite zoom, A/B koordinat yakalama (screenToLatLon) ve event yayini.
   ========================================================================== */
