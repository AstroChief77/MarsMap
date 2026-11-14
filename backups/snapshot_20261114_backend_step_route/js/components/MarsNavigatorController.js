/**
 * @file MarsNavigatorController.js
 * @description AstroChief Mars Navigator ana koordinasyon denetleyicisi.
 * Varsayilan 2D harita, 3D kure gecisi, Uydular paneli, Factory Reset, FPS < 10 koruma,
 * Progressive LOD data/tiles karo yukleme ve Mavi/Soluk Mavi rota motorunu birlestirir.
 */

(function (ns) {
  "use strict";
  const { CRATERS_DATA, CRATER_WAYPOINTS_DATA, AppConfig, StateStorageService, FpsGuardService, DatasetLoader, MarsTileLoader, HazardFieldService, RoutePlannerService, Map2DRenderer, Map3DRenderer, SettingsPanel, SatellitesPanel, RouteInspectorPanel, MissionInfoModal } = ns;

  class MarsNavigatorController {
    /**
     * MarsNavigatorController yapici metodu
     * @param {StarfieldRenderer} starfield - Arka plan yildiz motoru
     */
    constructor(starfield = null) {
      this.starfield = starfield;
      this.config = new AppConfig();
      this.storage = new StateStorageService(this.config);
      this.state = this.storage.loadState();

      this.datasetLoader = new DatasetLoader();
      this.tileLoader = new MarsTileLoader(() => {
        this.drawMap();
        this.updateTelemetryBar();
      });
      this.hazardService = new HazardFieldService(this.config);
      this.routePlanner = new RoutePlannerService(this.config, this.hazardService);
      this.renderer2D = new Map2DRenderer(this.tileLoader);
      this.renderer3D = new Map3DRenderer(this.tileLoader);

      this.fpsGuard = new FpsGuardService(this.config.fpsMinLimit, (fps) => this.updateFpsBadge(fps));

      this.canvas = document.getElementById("mars-map-canvas");
      this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
      this.bottomRightEl = document.getElementById("bottom-right-dock");

      this.landingSites = [];
      this.hitTargets = [];
      this.selectedWaypoint = null;
      this.hoverCoords = { lat: this.state.rotLat, lon: this.state.rotLon };

      this.isDragging = false;
      this.hasMoved = false;
      this.dragX = 0;
      this.dragY = 0;
      this.velLat = 0;
      this.velLon = 0;
      this.animFrame = null;
      this.toastTimer = null;

      this.initUiPanels();
    }

    initUiPanels() {
      this.settingsPanel = new SettingsPanel(document.getElementById("top-left-dock"), {
        onFactoryReset: () => this.performFactoryReset(),
        onSettingChange: (key, val, label) => this.applyGuardedSetting(key, val, label),
        onSelectGlobalScope: () => this.switchToGlobalRouteScope(),
        onSelectCrater: (craterId) => this.flyToCraterById(craterId),
        onOpenInfoModal: () => this.missionModal.open()
      });

      this.satellitesPanel = new SatellitesPanel(document.getElementById("bottom-left-dock"), {
        onSettingChange: (key, val, label) => this.applyGuardedSetting(key, val, label)
      });

      this.inspectorPanel = new RouteInspectorPanel(document.getElementById("top-right-dock"), {
        onToggleInspector: (open) => {
          this.state.inspectorOpen = open;
          this.persistState();
          this.renderUi();
        },
        onChangeGlobalEndpoints: (key, siteId) => {
          this.state[key] = siteId;
          this.persistState();
          this.refreshAll();
        },
        onSelectWaypoint: (wpId) => {
          const wps = this.getActiveWaypoints();
          this.selectedWaypoint = wps.find((w) => w.id === wpId) || null;
          this.renderUi();
          this.drawMap();
        }
      });

      this.missionModal = new MissionInfoModal(document.getElementById("mission-modal-root"));
    }

    /**
     * Veri setlerini, karo katalogunu, FPS sayacini ve haritayi baslatir
     */
    async init() {
      const [, landingJson, hazardJson] = await Promise.all([
        this.tileLoader.initCatalog(),
        this.datasetLoader.getLandingSites(),
        this.datasetLoader.getEnvironmentalHazards()
      ]);

      this.landingSites = landingJson?.landing_sites || [];
      this.hazardService.setWorldviewData(hazardJson);

      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      this.starfield?.setEnabled(this.state.showStarfield);

      this.resizeCanvas();
      this.renderBottomRight();
      this.bindCanvasEvents();
      this.bindGlobalEvents();
      this.fpsGuard.start();
      this.refreshAll();
    }

    getActiveCrater() {
      return CRATERS_DATA.find((c) => c.id === this.state.activeCraterId) || CRATERS_DATA[0];
    }

    getActiveWaypoints() {
      return CRATER_WAYPOINTS_DATA[this.getActiveCrater().id] || [];
    }

    persistState() {
      this.storage.saveState(this.state);
    }

    /**
     * ZORUNLU KURAL: Herhangi bir ayar degistiginde FPS < 10 olursa ayari onceki haline geri alir
     */
    applyGuardedSetting(key, value, label) {
      if (this.state[key] === value) return;
      const prevSnapshot = { ...this.state };

      this.fpsGuard.armSettingGuard(prevSnapshot, label, (safePrev, measuredFps, failedLabel) => {
        this.state = { ...safePrev };
        this.starfield?.setEnabled(this.state.showStarfield);
        this.persistState();
        this.refreshAll();
        this.showToast(`FPS ${measuredFps} (<10)! '${failedLabel}' engellendi ve önceki ayara dönüldü.`, true);
      });

      this.state[key] = value;
      if (key === "showStarfield") {
        this.starfield?.setEnabled(value);
      }
      this.persistState();
      this.refreshAll();
    }

    /**
     * ZORUNLU KURAL: Sol ust Ayarlar -> 1. Secenek Factory Reset
     */
    performFactoryReset() {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      this.state = this.storage.factoryReset();
      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      this.starfield?.setEnabled(this.state.showStarfield);
      this.refreshAll();
      this.showToast("Factory Reset: 2D Varsayılan, Ölçekli LOD ve Litre/km/Saat/α-β-γ yüklendi.");
    }

    switchToGlobalRouteScope() {
      this.state.routeScope = "global";
      this.persistState();
      this.animateTo(-2.0, 96.0, 1.02);
      this.renderUi();
    }

    flyToCraterById(craterId) {
      const crater = CRATERS_DATA.find((c) => c.id === craterId);
      if (!crater) return;
      this.state.activeCraterId = crater.id;
      this.state.routeScope = "crater";
      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      this.persistState();
      this.renderUi();
      this.animateTo(crater.coordinates.lat, crater.coordinates.lon, Math.max(this.state.zoom, 1.95));
    }

    computeActiveRoutes() {
      const activeCrater = this.getActiveCrater();
      const wps = this.getActiveWaypoints();
      const opts = {
        filterAcidRain: this.state.filterAcidRain,
        acidIntensity: this.state.acidIntensity,
        filterDustStorm: this.state.filterDustStorm,
        stormIntensity: this.state.stormIntensity,
        showRadiationZones: this.state.showRadiationZones
      };

      if (this.state.routeScope === "global" && this.landingSites.length >= 2) {
        return this.routePlanner.computeGlobalRoutes(
          this.landingSites,
          this.state.globalOriginId,
          this.state.globalTargetId,
          opts
        );
      }
      return this.routePlanner.computeCraterRoutes(activeCrater, wps, opts);
    }

    refreshAll() {
      this.renderUi();
      this.requestTilesForView();
      this.drawMap();
      this.updateTelemetryBar();
    }

    renderUi() {
      const activeCrater = this.getActiveCrater();
      const wps = this.getActiveWaypoints();
      const routes = this.computeActiveRoutes();
      const radZones = this.hazardService.getCraterRadiationZones(activeCrater.id);

      this.settingsPanel.render(this.state, CRATERS_DATA);
      this.satellitesPanel.render(this.state, this.tileLoader.getLayers());
      this.inspectorPanel.render(
        this.state, activeCrater, this.landingSites,
        wps, this.selectedWaypoint, routes, radZones
      );
    }

    renderBottomRight() {
      if (!this.bottomRightEl) return;
      this.bottomRightEl.innerHTML = `
        <div class="zoom-stack">
          <button class="zoom-btn" id="btn-zoom-in" title="Yaklaş (LOD Arttır)">＋</button>
          <button class="zoom-btn" id="btn-zoom-out" title="Uzaklaş">－</button>
          <button class="zoom-btn" id="btn-cam-reset" title="Görünümü Sıfırla">⌂</button>
        </div>
        <div class="telemetry-strip">
          <span id="telemetry-text">Mars Yükleniyor...</span>
          <span class="fps-pill" id="live-fps-pill">60 FPS</span>
        </div>
      `;

      this.bottomRightEl.querySelector("#btn-zoom-in")?.addEventListener("click", () => this.applyZoom(this.state.zoom * 1.25));
      this.bottomRightEl.querySelector("#btn-zoom-out")?.addEventListener("click", () => this.applyZoom(this.state.zoom * 0.8));
      this.bottomRightEl.querySelector("#btn-cam-reset")?.addEventListener("click", () => {
        const c = this.getActiveCrater();
        this.animateTo(c.coordinates.lat, c.coordinates.lon, 1.05);
      });
    }

    updateFpsBadge(fps) {
      const pill = document.getElementById("live-fps-pill");
      if (!pill) return;
      pill.innerText = `${fps} FPS`;
      pill.classList.toggle("low", fps < this.config.fpsMinLimit);
    }

    updateTelemetryBar() {
      const el = document.getElementById("telemetry-text");
      if (!el) return;
      const stats = this.tileLoader.getLayerStats(this.state.activeLayerId);
      el.innerText = `${this.hoverCoords.lat.toFixed(2)}°, ${this.hoverCoords.lon.toFixed(2)}° • ${stats.name} • z=${stats.zoom} (${stats.loaded} karo)`;
    }

    requestTilesForView() {
      this.tileLoader.requestVisibleTiles(this.state.activeLayerId, {
        rotLat: this.state.rotLat,
        rotLon: this.state.rotLon,
        zoom: this.state.zoom,
        viewMode: this.state.viewMode,
        progressiveLodRender: this.state.progressiveLodRender
      });
    }

    drawMap() {
      if (!this.ctx || !this.canvas) return;
      const t0 = performance.now();
      const activeCrater = this.getActiveCrater();
      const wps = this.getActiveWaypoints();
      const computedRoutes = this.computeActiveRoutes();
      const hazardBundle = this.hazardService.getGlobalHazardZones(this.state);
      const craterRadZones = this.hazardService.getCraterRadiationZones(activeCrater.id);

      const payload = {
        width: this.canvas.width,
        height: this.canvas.height,
        rotLat: this.state.rotLat,
        rotLon: this.state.rotLon,
        zoom: this.state.zoom,
        activeLayerId: this.state.activeLayerId,
        isDragging: this.isDragging,
        craters: CRATERS_DATA,
        landingSites: this.landingSites,
        activeCrater,
        hazardBundle,
        craterRadZones,
        computedRoutes,
        craterWaypoints: wps,
        selectedWaypoint: this.selectedWaypoint,
        progressiveLodRender: this.state.progressiveLodRender,
        showGraticule: this.state.showGraticule,
        showNomenclature: this.state.showNomenclature,
        showRadiationZones: this.state.showRadiationZones,
        showRouteComments: this.state.showRouteComments,
        routeScope: this.state.routeScope,
        highQualityGlobeRay: this.state.highQualityGlobeRay
      };

      if (this.state.viewMode === "3d") {
        this.hitTargets = this.renderer3D.render(this.ctx, payload);
      } else {
        this.hitTargets = this.renderer2D.render(this.ctx, payload);
      }

      const renderCostMs = performance.now() - t0;
      this.fpsGuard.recordRenderCost(renderCostMs);
    }

    bindCanvasEvents() {
      if (!this.canvas) return;

      this.canvas.addEventListener("mousedown", (e) => {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.isDragging = true;
        this.hasMoved = false;
        this.dragX = e.clientX;
        this.dragY = e.clientY;
        this.velLat = 0;
        this.velLon = 0;
      });

      this.canvas.addEventListener("mousemove", (e) => {
        this.updateHoverCoords(e);
        if (!this.isDragging) return;
        const dx = e.clientX - this.dragX;
        const dy = e.clientY - this.dragY;
        if (Math.hypot(dx, dy) > 2) this.hasMoved = true;
        this.dragX = e.clientX;
        this.dragY = e.clientY;

        const stepLon = -dx * (0.28 / this.state.zoom);
        const stepLat = dy * (0.28 / this.state.zoom);
        this.velLon = stepLon * 0.65;
        this.velLat = stepLat * 0.65;

        this.state.rotLon = this.normalizeLon(this.state.rotLon + stepLon);
        this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat + stepLat));
        this.requestTilesForView();
        this.drawMap();
        this.updateTelemetryBar();
      });

      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.applyZoom(this.state.zoom * (e.deltaY < 0 ? 1.14 : 0.88));
      }, { passive: false });

      this.canvas.addEventListener("click", (e) => {
        if (this.hasMoved) return;
        const rect = this.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const hit = this.hitTargets.find((t) => Math.hypot(cx - t.x, cy - t.y) <= t.r);
        if (hit) this.flyToCraterById(hit.crater.id);
      });
    }

    bindGlobalEvents() {
      window.addEventListener("mouseup", () => {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.startInertia();
      });

      document.addEventListener("click", (e) => {
        if (!e.target.closest("#settings-anchor")) this.settingsPanel.close();
        if (!e.target.closest("#bottom-left-dock")) this.satellitesPanel.close();
      });

      window.addEventListener("resize", () => {
        this.resizeCanvas();
        this.drawMap();
      });
    }

    startInertia() {
      const step = () => {
        if (Math.abs(this.velLon) < 0.04 && Math.abs(this.velLat) < 0.04) {
          this.drawMap();
          this.persistState();
          return;
        }
        this.state.rotLon = this.normalizeLon(this.state.rotLon + this.velLon);
        this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat + this.velLat));
        this.velLon *= 0.88;
        this.velLat *= 0.88;
        this.requestTilesForView();
        this.drawMap();
        this.updateTelemetryBar();
        this.animFrame = requestAnimationFrame(step);
      };
      this.animFrame = requestAnimationFrame(step);
    }

    animateTo(targetLat, targetLon, targetZoom) {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      let dLon = targetLon - this.state.rotLon;
      if (dLon > 180) dLon -= 360;
      if (dLon < -180) dLon += 360;

      const startLat = this.state.rotLat;
      const startLon = this.state.rotLon;
      const startZoom = this.state.zoom;
      const tStart = performance.now();
      const duration = 480;

      const tick = (now) => {
        const t = Math.min(1, (now - tStart) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        this.state.rotLat = startLat + (targetLat - startLat) * ease;
        this.state.rotLon = this.normalizeLon(startLon + dLon * ease);
        this.state.zoom = startZoom + (targetZoom - startZoom) * ease;
        this.requestTilesForView();
        this.drawMap();
        this.updateTelemetryBar();
        if (t < 1) {
          this.animFrame = requestAnimationFrame(tick);
        } else {
          this.persistState();
        }
      };
      this.animFrame = requestAnimationFrame(tick);
    }

    applyZoom(nextZoom) {
      this.state.zoom = Math.min(Math.max(nextZoom, 0.65), 4.0);
      this.requestTilesForView();
      this.drawMap();
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
        lat: Math.max(-90, Math.min(90, this.state.rotLat - dy * (0.14 / this.state.zoom))),
        lon: this.normalizeLon(this.state.rotLon + dx * (0.14 / this.state.zoom))
      };
      this.updateTelemetryBar();
    }

    showToast(msg, isWarn = false) {
      const toast = document.getElementById("app-toast");
      if (!toast) return;
      toast.innerText = msg;
      toast.classList.toggle("warn", isWarn);
      toast.classList.add("show");
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => toast.classList.remove("show"), isWarn ? 4200 : 2800);
    }
  }

  ns.MarsNavigatorController = MarsNavigatorController;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc ana Mars Navigator denetleyicisi tanimi.
   - Satir 27-68: constructor; tum servisleri, 2D/3D cizim motorlarini ve FPS koruma sistemini kurar.
   - Satir 70-128: initUiPanels ve init; Ayarlar, Uydular, Rota Inceleme panellerini ve veri setlerini yukler.
   - Satir 142-164: applyGuardedSetting; her ayar degisikliginde FPS < 10 duserse ayari onceki haline dondurur.
   - Satir 166-195: performFactoryReset, switchToGlobalRouteScope ve flyToCraterById islemleri.
   - Satir 197-260: computeActiveRoutes, refreshAll, renderUi, renderBottomRight ve telemetri/FPS guncelleme.
   - Satir 262-310: drawMap; aktif moda gore 2D (varsayilan) veya 3D motoru cizer ve kare suresini FPS Guard'a bildirir.
   - Satir 312-434: fare surukleme, tekerlek yakinlastirma, atalet animasyonu, krater ucusu ve bildirim yonetimi.
   ========================================================================== */
