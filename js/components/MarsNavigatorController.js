/**
 * @file MarsNavigatorController.js
 * @description AstroChief Mars Navigator ana koordinasyon denetleyicisi.
 * Varsayilan 2D harita, 3D kure gecisi, Uydular paneli, Factory Reset, FPS < 10 koruma,
 * Progressive LOD data/tiles karo yukleme ve Mavi/Soluk Mavi rota motorunu birlestirir.
 */

(function (ns) {
  "use strict";
  const { CRATERS_DATA, CRATER_WAYPOINTS_DATA, AppConfig, StateStorageService, FpsGuardService, DatasetLoader, MarsTileLoader, HazardFieldService, BackendApiService, RoutePlannerService, Map2DRenderer, Map3DRenderer, SettingsPanel, SatellitesPanel, RouteInspectorPanel, MissionInfoModal } = ns;

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
      this.backendApi = BackendApiService ? new BackendApiService(this.config) : null;
      this.routePlanner = new RoutePlannerService(this.config, this.hazardService);
      this.renderer2D = new Map2DRenderer(this.tileLoader);
      this.renderer3D = new Map3DRenderer(this.tileLoader);

      this.fpsGuard = new FpsGuardService(
        this.config.fpsMinLimit,
        (fps) => this.updateFpsBadge(fps),
        this.config.fpsGuardWindowMs || 10000
      );

      this.canvas = document.getElementById("mars-map-canvas");
      this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
      this.bottomRightEl = document.getElementById("bottom-right-dock");

      this.landingSites = [];
      this.hitTargets = [];
      this.selectedWaypoint = null;
      this.hoverCoords = { lat: this.state.rotLat, lon: this.state.rotLon };

      this.backendRoutes = null;
      this.backendHazards = null;
      this.backendLatencyMs = null;
      this.backendLoading = false;
      this.backendStatusText = "Backend bekleniyor (istek hazır)";
      this.lastRequestPayload = null;
      this.pickMode = null;
      this.requestSeq = 0;
      this.routeDebounceTimer = null;
      this.latencyTimer = null;

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
        onOpenInfoModal: () => this.missionModal.open(),
        onBackendUrlSave: (url) => this.handleBackendUrlSave(url),
        onBackendUrlTest: (url) => this.handleBackendUrlTest(url)
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
        onChangeGlobalEndpoints: (key, siteId) => this.handlePresetEndpointChange(key, siteId),
        onTogglePickMode: (mode) => this.togglePickMode(mode),
        onSendBackendRoute: () => this.fetchBackendRouteNow(true),
        onChangeStepTab: (tab) => {
          this.state.activeStepRouteTab = tab === "secondary" ? "secondary" : "primary";
          this.persistState();
          this.renderUi();
        },
        onFocusCoords: (lat, lon) => this.animateTo(lat, lon, Math.max(this.state.zoom, 1.35)),
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
      if (this.backendApi) {
        const initUrl = this.backendApi.resolveInitialUrl(this.state.backendApiUrl);
        if (initUrl) this.state.backendApiUrl = initUrl;
      }

      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      this.starfield?.setEnabled(this.state.showStarfield);

      this.resizeCanvas();
      this.renderBottomRight();
      this.bindCanvasEvents();
      this.bindGlobalEvents();
      this.fpsGuard.start();
      this.startBackendLatencyMonitor();
      this.refreshAll();
      if (this.state.backendApiUrl) {
        this.refreshBackendHazardsAndRoute();
      }
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
      this.backendRoutes = null;
      this.persistState();
      this.refreshAll();
      if (this.state.backendApiUrl) {
        this.scheduleBackendRouteFetch(220);
      }
    }

    /**
     * ZORUNLU KURAL: Sol ust Ayarlar -> 1. Secenek Factory Reset
     */
    performFactoryReset() {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      this.pickMode = null;
      if (this.canvas) this.canvas.style.cursor = "";
      this.backendRoutes = null;
      this.backendHazards = null;
      this.backendStatusText = "";
      this.state = this.storage.factoryReset();
      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      this.starfield?.setEnabled(this.state.showStarfield);
      this.refreshAll();
      this.showToast("Factory Reset: 3D Varsayılan, Ölçekli LOD ve Litre/km/Saat/α-β-γ yüklendi.");
    }

    switchToGlobalRouteScope() {
      this.state.routeScope = "global";
      this.backendRoutes = null;
      this.persistState();
      this.animateTo(-2.0, 96.0, 1.02);
      this.renderUi();
      if (this.state.backendApiUrl) {
        this.scheduleBackendRouteFetch(120);
      }
    }

    flyToCraterById(craterId) {
      const crater = CRATERS_DATA.find((c) => c.id === craterId);
      if (!crater) return;
      this.pickMode = null;
      if (this.canvas) this.canvas.style.cursor = "";
      this.state.activeCraterId = crater.id;
      this.state.routeScope = "global";
      if (crater.id !== "gale-crater") {
        this.state.customDestination = {
          id: crater.id,
          name: crater.name,
          lat: crater.coordinates.lat,
          lon: crater.coordinates.lon
        };
        this.state.useCustomCoordinates = true;
      }
      this.backendRoutes = null;
      this.persistState();
      this.refreshAll();
      this.animateTo(crater.coordinates.lat, crater.coordinates.lon, Math.max(this.state.zoom, 1.25));
      if (this.state.backendApiUrl) {
        this.scheduleBackendRouteFetch(120);
      }
    }

    getActiveEndpoints() {
      return this.routePlanner.geo.resolveActiveEndpoints(
        this.state,
        this.getActiveCrater(),
        this.getActiveWaypoints(),
        this.landingSites
      );
    }

    getActiveHazardBundle() {
      const base = this.hazardService.getGlobalHazardZones(this.state);
      if (!this.backendHazards) {
        return {
          ...base,
          acidZones: [],
          stormZones: [],
          radiationZones: []
        };
      }
      return {
        ...base,
        acidZones: (this.state.filterAcidRain && Array.isArray(this.backendHazards.acidZones))
          ? this.backendHazards.acidZones
          : [],
        stormZones: (this.state.filterDustStorm && Array.isArray(this.backendHazards.stormZones))
          ? this.backendHazards.stormZones
          : [],
        radiationZones: (this.state.showRadiationZones && Array.isArray(this.backendHazards.radiationZones))
          ? this.backendHazards.radiationZones
          : []
      };
    }

    computeActiveRoutes() {
      return this.backendRoutes;
    }

    buildCurrentRequestPayload(origin, destination, activeCrater) {
      if (!this.backendApi) return null;
      const baseHazards = this.hazardService.getGlobalHazardZones(this.state);
      const craterRadZones = this.hazardService.getCraterRadiationZones(activeCrater.id);
      return this.backendApi.buildRouteRequestPayload({
        scope: this.state.routeScope,
        origin,
        destination,
        state: this.state,
        activeCrater,
        hazardBundle: this.backendHazards || baseHazards,
        craterRadZones,
        planner: this.routePlanner
      });
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
      const radZones = (this.backendHazards && Array.isArray(this.backendHazards.radiationZones))
        ? this.backendHazards.radiationZones
        : [];
      const { origin, destination } = this.getActiveEndpoints();
      const reqPayload = this.lastRequestPayload || this.buildCurrentRequestPayload(origin, destination, activeCrater);

      this.settingsPanel.render(this.state, CRATERS_DATA, this.backendStatusText);
      this.satellitesPanel.render(this.state, this.tileLoader.getLayers());
      this.inspectorPanel.render(
        this.state, activeCrater, this.landingSites,
        wps, this.selectedWaypoint, routes, radZones,
        {
          activeOrigin: origin,
          activeDestination: destination,
          pickMode: this.pickMode,
          backendLoading: this.backendLoading,
          backendLatencyMs: this.backendLatencyMs,
          backendStatusText: this.backendStatusText,
          lastRequestPayload: reqPayload
        }
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
      const hazardBundle = this.getActiveHazardBundle();
      const craterRadZones = this.hazardService.getCraterRadiationZones(activeCrater.id);
      const { origin, destination } = this.getActiveEndpoints();

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
        customOrigin: origin,
        customDestination: destination,
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
        const scaleX = this.canvas.width / Math.max(1, rect.width);
        const scaleY = this.canvas.height / Math.max(1, rect.height);
        const cx = (e.clientX - rect.left) * scaleX;
        const cy = (e.clientY - rect.top) * scaleY;

        const hit = this.hitTargets.find((t) => Math.hypot(cx - t.x, cy - t.y) <= t.r);
        if (hit && !this.pickMode) {
          this.flyToCraterById(hit.crater.id);
          return;
        }

        const geo = this.pixelToGeo(cx, cy);
        if (!geo.insideMap) {
          if (this.pickMode) this.showToast("Lütfen Mars yüzeyi üzerinde bir koordinata tıklayın.", true);
          return;
        }
        this.pickMode = null;
        this.canvas.style.cursor = "";
        this.state.customDestination = this.routePlanner.geo.makeEndpointPoint(
          "picked-dest",
          "Seçilen Hedef",
          geo.lat,
          geo.lon
        );
        this.state.useCustomCoordinates = true;
        this.state.routeScope = "global";
        this.backendRoutes = null;
        this.persistState();
        this.refreshAll();
        this.showToast(`🎯 Hedef Seçildi: ${geo.lat.toFixed(2)}°, ${geo.lon.toFixed(2)}° — Backend'e istek gönderiliyor...`);
        this.scheduleBackendRouteFetch(20);
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

    pixelToGeo(px, py) {
      const geo = this.routePlanner.geo;
      if (this.state.viewMode === "3d") {
        return geo.screenToMarsCoords3D(px, py, this.canvas.width, this.canvas.height, this.state.rotLat, this.state.rotLon, this.state.zoom);
      }
      return geo.screenToMarsCoords2D(px, py, this.canvas.width, this.canvas.height, this.state.rotLat, this.state.rotLon, this.state.zoom);
    }

    handlePresetEndpointChange(key, siteId) {
      this.state[key] = siteId;
      this.state.useCustomCoordinates = false;
      const site = this.landingSites.find((s) => s.id === siteId);
      if (site) {
        const pt = { id: site.id, name: site.name, lat: site.latitude, lon: site.longitude };
        if (key === "globalOriginId") this.state.customOrigin = pt;
        else this.state.customDestination = pt;
      }
      this.backendRoutes = null;
      this.persistState();
      this.refreshAll();
      if (this.state.backendApiUrl) {
        this.scheduleBackendRouteFetch(40);
      }
    }

    togglePickMode(mode) {
      this.pickMode = this.pickMode === mode ? null : mode;
      if (this.canvas) {
        this.canvas.style.cursor = this.pickMode ? "crosshair" : "";
      }
      if (this.pickMode === "destination") {
        this.showToast("Harita üzerinde gitmek istediğiniz Hedef Konuma tıklayın.");
      }
      this.renderUi();
    }

    async handleBackendUrlSave(rawUrl) {
      if (!this.backendApi) return;
      const clean = this.backendApi.normalizeBaseUrl(rawUrl);
      this.state.backendApiUrl = clean;
      this.backendRoutes = null;
      this.backendHazards = null;
      this.backendStatusText = clean ? "Bağlanıyor..." : "Yerel yedek rota motoru aktif";
      this.persistState();
      this.refreshAll();
      if (clean) {
        await this.refreshBackendHazardsAndRoute();
      } else {
        this.showToast("Backend URL temizlendi. Yerel yedek mod aktif.");
      }
    }

    async handleBackendUrlTest(rawUrl) {
      if (!this.backendApi) return;
      const res = await this.backendApi.testConnection(rawUrl);
      this.backendStatusText = res.message;
      this.renderUi();
      this.showToast(res.message, !res.ok);
    }

    async refreshBackendHazardsAndRoute() {
      if (!this.backendApi || !this.state.backendApiUrl) return;
      const health = await this.backendApi.testConnection(this.state.backendApiUrl);
      this.backendStatusText = health.message;
      this.backendLatencyMs = health.ok ? health.latencyMs : null;
      this.updateLatencyBadges();
      const hz = await this.backendApi.fetchHazards(this.state.backendApiUrl);
      if (hz) {
        this.backendHazards = hz;
        this.drawMap();
      }
      await this.fetchBackendRouteNow();
    }

    startBackendLatencyMonitor() {
      clearInterval(this.latencyTimer);
      this.latencyTimer = setInterval(async () => {
        if (!this.backendApi || !this.state.backendApiUrl) {
          this.backendLatencyMs = null;
          this.updateLatencyBadges();
          return;
        }
        const health = await this.backendApi.testConnection(this.state.backendApiUrl);
        this.backendLatencyMs = health.ok ? health.latencyMs : null;
        this.backendStatusText = health.message;
        this.updateLatencyBadges();
      }, 5000);
    }

    updateLatencyBadges() {
      const label = typeof this.backendLatencyMs === "number"
        ? `⏱ ${this.backendLatencyMs} ms`
        : (this.state.backendApiUrl ? "⏱ Bağlantı Yok" : "⏱ Yerel");
      const isOffline = typeof this.backendLatencyMs !== "number";
      const isSlow = typeof this.backendLatencyMs === "number" && this.backendLatencyMs > 500;
      ["#insp-latency-pill", "#insp-latency-pill-card"].forEach((sel) => {
        const el = document.querySelector(sel);
        if (!el) return;
        el.textContent = label;
        el.classList.toggle("offline", isOffline);
        el.classList.toggle("slow", isSlow);
      });
    }

    scheduleBackendRouteFetch(delayMs = 180) {
      clearTimeout(this.routeDebounceTimer);
      this.routeDebounceTimer = setTimeout(() => {
        this.fetchBackendRouteNow();
      }, delayMs);
    }

    async fetchBackendRouteNow(isManual = false) {
      if (!this.backendApi) return;
      const baseUrl = this.state.backendApiUrl || "http://127.0.0.1:8080";
      const seq = ++this.requestSeq;
      this.backendLoading = true;

      const activeCrater = this.getActiveCrater();
      const { origin, destination } = this.getActiveEndpoints();
      const payload = this.buildCurrentRequestPayload(origin, destination, activeCrater);
      this.lastRequestPayload = payload;
      this.renderUi();

      try {
        const res = await this.backendApi.requestStepRoute(baseUrl, payload, this.routePlanner);
        if (seq !== this.requestSeq) return;
        this.backendRoutes = res;
        this.backendLatencyMs = typeof res.latencyMs === "number" ? res.latencyMs : this.backendLatencyMs;
        if (res.hazards) {
          this.backendHazards = res.hazards;
        }
        this.backendStatusText = `🦀 Backend yanıtladı (${res.latencyMs || 0} ms)`;
        this.updateLatencyBadges();
      } catch (err) {
        if (seq !== this.requestSeq) return;
        this.backendRoutes = null;
        this.backendLatencyMs = null;
        this.backendStatusText = `İstek hazır (${baseUrl}/api/v1/route) — Rust Backend yanıtı bekleniyor`;
        this.updateLatencyBadges();
        if (isManual) {
          this.showToast(`İstek ${baseUrl}/api/v1/route adresine gönderildi (Backend henüz yanıt vermedi).`, true);
        }
      } finally {
        if (seq === this.requestSeq) {
          this.backendLoading = false;
          this.renderUi();
          this.drawMap();
        }
      }
    }

    updateHoverCoords(e) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = this.canvas.width / Math.max(1, rect.width);
      const scaleY = this.canvas.height / Math.max(1, rect.height);
      const px = (e.clientX - rect.left) * scaleX;
      const py = (e.clientY - rect.top) * scaleY;
      const geo = this.pixelToGeo(px, py);
      if (geo.insideMap) {
        this.hoverCoords = { lat: geo.lat, lon: geo.lon };
      }
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
   - Satir 27-76: constructor; servisleri, Rust BackendApiService istemcisini, 2D/3D motorlarini ve 10s FPS koruma sistemini kurar.
   - Satir 78-156: initUiPanels ve init; Ayarlar, Uydular, Rota Inceleme panellerini, harita secimini ve veri setlerini yukler.
   - Satir 158-295: applyGuardedSetting, A/B koordinat secimi, tehlike katman birlestirme ve rota hesaplama metodlari.
   - Satir 297-395: refreshAll, renderUi, drawMap, telemetri/FPS guncelleme ve kare suresi olcumu.
   - Satir 397-525: harita surukleme/tiklama (A/B secimi dahil), zoom, atalet animasyonu ve krater ucusu.
   - Satir 527-695: pixelToGeo, Rust Backend POST /api/v1/route ve GET /api/v1/hazards senkronizasyonu ve bildirim yonetimi.
   ========================================================================== */
