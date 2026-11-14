/**
 * @file MarsNavigatorController.js
 * @description AstroChief Mars Navigator ana koordinasyon denetleyicisi.
 * Varsayilan 3D kure, 2D harita gecisi, Uydular paneli, Factory Reset, FPS < 10 koruma,
 * Progressive LOD data/tiles karo yukleme ve saf Rust Backend rota istek/yanit akisini birlestirir.
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
      this.i18n = ns.i18n || null;
      if (this.i18n) this.i18n.setLang(this.state.lang || "tr");

      this.datasetLoader = new DatasetLoader();
      this.tileLoader = new MarsTileLoader(() => this.scheduleRender(false));
      this.hazardService = new HazardFieldService(this.config);
      this.backendApi = BackendApiService ? new BackendApiService(this.config) : null;
      this.routePlanner = new RoutePlannerService(this.config, this.hazardService);
      this.renderer2D = new Map2DRenderer(this.tileLoader);
      this.renderer3D = new Map3DRenderer(this.tileLoader);
      this.fpsGuard = new FpsGuardService(this.config.fpsMinLimit, (fps) => this.updateFpsBadge(fps), this.config.fpsGuardWindowMs || 10000);

      this.canvas = document.getElementById("mars-map-canvas");
      this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
      this.bottomRightEl = document.getElementById("bottom-right-dock");
      this.dpr = 1;
      this.viewWidth = window.innerWidth || 1280;
      this.viewHeight = window.innerHeight || 720;

      this.landingSites = []; this.hitTargets = []; this.selectedWaypoint = null;
      this.hoverCoords = { lat: this.state.rotLat, lon: this.state.rotLon };
      this.backendRoutes = null; this.backendHazards = null; this.backendLatencyMs = null;
      this.backendLoading = false; this.backendStatusText = ""; this.lastRequestPayload = null;
      this.pickMode = null; this.cachedBundle = null; this.requestSeq = 0;

      this.isDragging = false; this.isOrbitDragging = false; this.isZooming = false; this.isAnimating = false;
      this.hasMoved = false; this.dragX = 0; this.dragY = 0; this.velLat = 0; this.velLon = 0;
      this.animFrame = null; this.renderRafId = null; this.tilesNeedRequest = false;
      this.zoomSettleTimer = null; this.dragSettleTimer = null; this.persistTimer = null; this.routeDebounceTimer = null;
      this.latencyTimer = null; this.toastTimer = null; this.lastTelemetryText = "";
      this.lastFpsVal = -1; this.lastHoverTs = 0; this.lastTelemTs = 0;

      this.initUiPanels();
    }

    t(key, vars = {}) { return this.i18n ? this.i18n.t(key, vars) : key; }

    initUiPanels() {
      this.settingsPanel = new SettingsPanel(document.getElementById("top-left-dock"), {
        onFactoryReset: () => this.performFactoryReset(),
        onLanguageChange: (code) => this.changeLanguage(code),
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
        onToggleInspector: (open) => { this.state.inspectorOpen = open; this.persistState(); this.renderUi(); },
        onChangeGlobalEndpoints: (key, siteId) => this.handlePresetEndpointChange(key, siteId),
        onTogglePickMode: (mode) => this.togglePickMode(mode),
        onSendBackendRoute: () => this.fetchBackendRouteNow(true),
        onChangeStepTab: (tab) => { this.state.activeStepRouteTab = tab === "secondary" ? "secondary" : "primary"; this.persistState(); this.renderUi(); },
        onFocusCoords: (lat, lon) => this.animateTo(lat, lon, Math.max(this.state.zoom, 1.35)),
        onSelectWaypoint: (wpId) => {
          this.selectedWaypoint = this.getActiveWaypoints().find((w) => w.id === wpId) || null;
          this.renderUi();
          this.scheduleRender(false);
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

    getLocalizedCraters() {
      return this.i18n ? CRATERS_DATA.map((c) => this.i18n.localizeCrater(c)) : CRATERS_DATA;
    }

    getActiveCrater() {
      const list = this.getLocalizedCraters();
      return list.find((c) => c.id === this.state.activeCraterId) || list[0];
    }

    getActiveWaypoints() {
      return CRATER_WAYPOINTS_DATA[this.getActiveCrater().id] || [];
    }

    changeLanguage(langCode) {
      if (!this.i18n) return;
      const valid = this.i18n.setLang(langCode);
      this.state.lang = valid;
      this.persistState();
      this.renderBottomRight();
      this.refreshAll();
      const meta = this.i18n.getLanguages().find((l) => l.code === valid);
      this.showToast(this.t("toastLangChanged", { lang: meta ? `${meta.nativeName} (${meta.badge})` : valid.toUpperCase() }));
    }

    persistState() {
      clearTimeout(this.persistTimer);
      this.storage.saveState(this.state);
    }

    schedulePersistState() {
      clearTimeout(this.persistTimer);
      this.persistTimer = setTimeout(() => this.storage.saveState(this.state), 240);
    }

    /** Hizli tekerlek, surukleme ve karo yuklemelerini tek rAF karesinde birlestirir */
    scheduleRender(requestTiles = false) {
      if (requestTiles) this.tilesNeedRequest = true;
      if (this.renderRafId) return;
      this.renderRafId = requestAnimationFrame(() => {
        this.renderRafId = null;
        if (this.tilesNeedRequest) {
          this.tilesNeedRequest = false;
          this.requestTilesForView();
        }
        this.drawMap();
        this.updateTelemetryBar();
      });
    }

    /** ZORUNLU KURAL: Herhangi bir ayar degistiginde FPS < 10 olursa ayari onceki haline geri alir */
    applyGuardedSetting(key, value, label) {
      if (this.state[key] === value) return;
      const prevSnapshot = { ...this.state };
      this.fpsGuard.armSettingGuard(prevSnapshot, label, (safePrev, measuredFps, failedLabel) => {
        this.state = { ...safePrev };
        if (this.i18n) this.i18n.setLang(this.state.lang || "tr");
        this.starfield?.setEnabled(this.state.showStarfield);
        this.persistState();
        this.refreshAll();
        this.showToast(this.t("toastFpsRevert", { fps: measuredFps, label: failedLabel }), true);
      });

      this.state[key] = value;
      if (key === "viewMode" && value === "3d" && this.state.zoom > 22.0) this.state.zoom = 22.0;
      if (key === "showStarfield") this.starfield?.setEnabled(value);
      this.backendRoutes = null;
      this.persistState();
      this.refreshAll();
      if (this.state.backendApiUrl) this.scheduleBackendRouteFetch(220);
    }

    /** ZORUNLU KURAL: Sol ust Ayarlar -> 1. Secenek Factory Reset */
    performFactoryReset() {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      if (this.renderRafId) cancelAnimationFrame(this.renderRafId);
      clearTimeout(this.zoomSettleTimer);
      this.animFrame = null; this.renderRafId = null;
      this.isDragging = false; this.isOrbitDragging = false; this.isZooming = false; this.isAnimating = false;
      this.pickMode = null;
      if (this.canvas) this.canvas.style.cursor = "";
      this.backendRoutes = null; this.backendHazards = null;
      this.backendStatusText = ""; this.lastRequestPayload = null;
      this.state = this.storage.factoryReset();
      if (this.i18n) this.i18n.setLang(this.state.lang || "tr");
      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      this.starfield?.setEnabled(this.state.showStarfield);
      this.renderBottomRight();
      this.refreshAll();
      this.showToast(this.t("toastFactoryReset"));
    }

    switchToGlobalRouteScope() {
      this.state.routeScope = "global";
      this.backendRoutes = null; this.cachedBundle = null;
      this.persistState();
      this.animateTo(-2.0, 96.0, 1.02);
      this.renderUi();
      if (this.state.backendApiUrl) this.scheduleBackendRouteFetch(120);
    }

    flyToCraterById(craterId) {
      const crater = this.getLocalizedCraters().find((c) => c.id === craterId);
      if (!crater) return;
      this.pickMode = null;
      if (this.canvas) this.canvas.style.cursor = "";
      this.state.activeCraterId = crater.id;
      this.state.routeScope = "global";
      if (crater.id !== "gale-crater") {
        this.state.customDestination = { id: crater.id, name: crater.name, lat: crater.coordinates.lat, lon: crater.coordinates.lon };
        this.state.useCustomCoordinates = true;
      }
      this.backendRoutes = null;
      this.persistState();
      this.refreshAll();
      this.animateTo(crater.coordinates.lat, crater.coordinates.lon, Math.max(this.state.zoom, 1.25));
      if (this.state.backendApiUrl) this.scheduleBackendRouteFetch(120);
    }

    getActiveEndpoints() {
      return this.routePlanner.geo.resolveActiveEndpoints(this.state, this.getActiveCrater(), this.getActiveWaypoints(), this.landingSites);
    }

    getActiveHazardBundle() {
      const base = this.hazardService.getGlobalHazardZones(this.state);
      if (!this.backendHazards) return { ...base, acidZones: [], stormZones: [], radiationZones: [] };
      const pick = (flag, arr) => (flag && Array.isArray(arr) ? arr : []);
      return {
        ...base,
        acidZones: pick(this.state.filterAcidRain, this.backendHazards.acidZones),
        stormZones: pick(this.state.filterDustStorm, this.backendHazards.stormZones),
        radiationZones: pick(this.state.showRadiationZones, this.backendHazards.radiationZones)
      };
    }

    computeActiveRoutes() { return this.backendRoutes; }

    buildCurrentRequestPayload(origin, destination, activeCrater) {
      if (!this.backendApi) return null;
      const baseHazards = this.hazardService.getGlobalHazardZones(this.state);
      const craterRadZones = this.hazardService.getCraterRadiationZones(activeCrater.id);
      return this.backendApi.buildRouteRequestPayload({
        scope: this.state.routeScope, origin, destination, state: this.state, activeCrater,
        hazardBundle: this.backendHazards || baseHazards, craterRadZones, planner: this.routePlanner
      });
    }

    getRouteAndHazardBundle() {
      if (!this.cachedBundle) {
        this.cachedBundle = { computedRoutes: this.computeActiveRoutes(), hazardBundle: this.getActiveHazardBundle() };
      }
      return this.cachedBundle;
    }

    refreshAll() {
      this.cachedBundle = null;
      this.renderUi(); this.requestTilesForView(); this.drawMap(); this.updateTelemetryBar();
    }

    renderUi() {
      const craters = this.getLocalizedCraters();
      const activeCrater = this.getActiveCrater();
      const wps = this.getActiveWaypoints();
      const { computedRoutes } = this.getRouteAndHazardBundle();
      const radZones = (this.backendHazards && Array.isArray(this.backendHazards.radiationZones)) ? this.backendHazards.radiationZones : [];
      const { origin, destination } = this.getActiveEndpoints();
      const reqPayload = this.lastRequestPayload || this.buildCurrentRequestPayload(origin, destination, activeCrater);

      this.settingsPanel.render(this.state, craters, this.backendStatusText);
      this.satellitesPanel.render(this.state, this.tileLoader.getLayers());
      this.inspectorPanel.render(
        this.state, activeCrater, this.landingSites, wps, this.selectedWaypoint, computedRoutes, radZones,
        {
          activeOrigin: origin, activeDestination: destination, pickMode: this.pickMode,
          backendLoading: this.backendLoading, backendLatencyMs: this.backendLatencyMs,
          backendStatusText: this.backendStatusText, lastRequestPayload: reqPayload
        }
      );
    }

    renderBottomRight() {
      if (!this.bottomRightEl) return;
      const pitch = Math.round(this.state.camPitch ?? 28);
      this.bottomRightEl.innerHTML = `
        <div class="zoom-stack">
          <button class="zoom-btn" id="btn-zoom-in" title="${this.t("zoomInTitle")}">＋</button>
          <button class="zoom-btn" id="btn-zoom-out" title="${this.t("zoomOutTitle")}">－</button>
          <button class="zoom-btn zoom-btn-3d" id="btn-3d-tilt" title="3D Kamera Eğimi (Sağ Tık Sürükle veya R/F)">${pitch}°</button>
          <button class="zoom-btn zoom-btn-peak" id="btn-3d-peak" title="3D Topografya Zirvelerini Gez (Olympus Mons / Valles Marineris / Mount Sharp)">⛰</button>
          <button class="zoom-btn" id="btn-cam-reset" title="${this.t("zoomResetTitle")}">⌂</button>
        </div>
        <div class="telemetry-strip">
          <span id="telemetry-text">${this.t("telemetryLoading")}</span>
          <span class="fps-pill" id="live-fps-pill">60 FPS</span>
        </div>
      `;

      this.bottomRightEl.querySelector("#btn-zoom-in")?.addEventListener("click", () => this.applyZoom(this.state.zoom * 1.45));
      this.bottomRightEl.querySelector("#btn-zoom-out")?.addEventListener("click", () => this.applyZoom(this.state.zoom * 0.69));
      this.bottomRightEl.querySelector("#btn-3d-tilt")?.addEventListener("click", () => {
        this.state.viewMode = "3d";
        this.state.camPitch = (this.state.camPitch ?? 28) < 20 ? 34 : (this.state.camPitch < 50 ? 58 : 0);
        this.renderBottomRight(); this.scheduleRender(true); this.schedulePersistState();
      });
      this.bottomRightEl.querySelector("#btn-3d-peak")?.addEventListener("click", () => {
        const peaks = [
          { name: "Olympus Mons (+21,229 m)", lat: 18.65, lon: -133.8, zoom: 2.35, pitch: 54 },
          { name: "Valles Marineris (-7,000 m)", lat: -13.9, lon: -59.2, zoom: 2.25, pitch: 52 },
          { name: "Gale / Aeolis Mons (+5,500 m)", lat: -5.08, lon: 137.85, zoom: 3.1, pitch: 56 },
          { name: "Ascraeus Mons (+18,209 m)", lat: 11.9, lon: -104.5, zoom: 2.4, pitch: 54 },
          { name: "Hellas Planitia (-7,152 m)", lat: -42.4, lon: 70.5, zoom: 1.85, pitch: 46 }
        ];
        this.peakIdx = ((this.peakIdx ?? -1) + 1) % peaks.length;
        const p = peaks[this.peakIdx];
        this.state.viewMode = "3d"; this.state.camPitch = p.pitch;
        this.renderBottomRight(); this.animateTo(p.lat, p.lon, p.zoom);
        this.showToast(`⛰ 3D Topografya: ${p.name}`);
      });
      this.bottomRightEl.querySelector("#btn-cam-reset")?.addEventListener("click", () => {
        const c = this.getActiveCrater();
        this.state.camPitch = 28; this.state.camYaw = 0;
        this.renderBottomRight(); this.animateTo(c.coordinates.lat, c.coordinates.lon, 1.05);
      });
    }

    updateFpsBadge(fps) {
      if (fps === this.lastFpsVal) return;
      this.lastFpsVal = fps;
      const pill = document.getElementById("live-fps-pill");
      if (!pill) return;
      pill.textContent = `${fps} FPS`;
      pill.classList.toggle("low", fps < this.config.fpsMinLimit);
    }

    updateTelemetryBar() {
      const now = performance.now();
      if ((this.isDragging || this.isOrbitDragging || this.isAnimating) && now - this.lastTelemTs < 90) return;
      this.lastTelemTs = now;
      const el = document.getElementById("telemetry-text");
      if (!el) return;
      const stats = this.tileLoader.getLayerStats(this.state.activeLayerId);
      const topo = ns.marsTopo ? ns.marsTopo.getSurfaceTelemetry(this.hoverCoords.lat, this.hoverCoords.lon) : null;
      const elevStr = topo ? `${topo.elevM >= 0 ? "+" : ""}${topo.elevM} m (Eğim ${topo.slopeDeg}°)` : "";
      const pitchStr = this.state.viewMode === "3d" ? ` • 3D Eğim: ${Math.round(this.state.camPitch ?? 28)}°` : "";
      const nextText = `${this.hoverCoords.lat.toFixed(2)}°, ${this.hoverCoords.lon.toFixed(2)}° • Rakım: ${elevStr}${pitchStr} • ${stats.name} • z=${stats.zoom}`;
      if (nextText !== this.lastTelemetryText) {
        this.lastTelemetryText = nextText;
        el.textContent = nextText;
      }
    }

    requestTilesForView() {
      const vw = this.viewWidth || window.innerWidth || 1280;
      const vh = this.viewHeight || window.innerHeight || 720;
      const { activeLayerId, rotLat, rotLon, zoom, viewMode, progressiveLodRender, camPitch, camYaw } = this.state;
      const isInteracting = Boolean(this.isDragging || this.isOrbitDragging || this.isZooming || this.isAnimating);
      this.tileLoader.requestVisibleTiles(activeLayerId, {
        rotLat, rotLon, zoom, dpr: this.dpr || 1, viewportW: vw, viewportH: vh,
        camPitch: camPitch ?? 28, camYaw: camYaw ?? 0, isInteracting,
        mapWidthPx: Math.max(vw * 0.86, 620) * Math.min(Math.max(zoom, 0.65), 32.0),
        sphereRadiusPx: Math.min(vw, vh) * 0.41 * Math.min(Math.max(zoom, 0.55), 80.0),
        viewMode, progressiveLodRender
      });
    }

    drawMap() {
      if (!this.ctx || !this.canvas) return;
      const t0 = performance.now();
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const s = this.state;
      const interacting = Boolean(this.isDragging || this.isOrbitDragging || this.isZooming || this.isAnimating);
      this.tileLoader.setInteracting?.(interacting);
      this.starfield?.setInteracting?.(interacting);

      const activeCrater = this.getActiveCrater();
      const { computedRoutes, hazardBundle } = this.getRouteAndHazardBundle();
      const { origin, destination } = this.getActiveEndpoints();
      const payload = {
        width: this.viewWidth, height: this.viewHeight, dpr: this.dpr,
        rotLat: s.rotLat, rotLon: s.rotLon, zoom: s.zoom, activeLayerId: s.activeLayerId,
        camPitch: s.camPitch ?? 28, camYaw: s.camYaw ?? 0,
        topoReliefScale: s.topoReliefScale ?? 1.0, enable3DTerrain: s.enable3DTerrain !== false,
        isDragging: this.isDragging || this.isOrbitDragging, isInteracting: interacting,
        craters: this.getLocalizedCraters(), landingSites: this.landingSites, activeCrater,
        hazardBundle, craterRadZones: this.hazardService.getCraterRadiationZones(activeCrater.id),
        computedRoutes, craterWaypoints: this.getActiveWaypoints(), selectedWaypoint: this.selectedWaypoint,
        customOrigin: origin, customDestination: destination,
        progressiveLodRender: s.progressiveLodRender, showGraticule: s.showGraticule,
        showNomenclature: s.showNomenclature, showRadiationZones: s.showRadiationZones,
        showRouteComments: s.showRouteComments, routeScope: s.routeScope, highQualityGlobeRay: s.highQualityGlobeRay
      };

      this.hitTargets = s.viewMode === "3d"
        ? this.renderer3D.render(this.ctx, payload)
        : this.renderer2D.render(this.ctx, payload);
      this.fpsGuard.recordRenderCost(performance.now() - t0);
    }

    bindCanvasEvents() {
      if (!this.canvas) return;
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

      this.canvas.addEventListener("mousedown", (e) => {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        clearTimeout(this.dragSettleTimer);
        this.animFrame = null; this.isAnimating = false; this.isDragging = true;
        this.isOrbitDragging = (e.button === 2 || e.shiftKey) && this.state.viewMode === "3d";
        this.hasMoved = false; this.dragX = e.clientX; this.dragY = e.clientY;
        this.velLat = 0; this.velLon = 0;
      });

      this.canvas.addEventListener("mousemove", (e) => {
        if (!this.isDragging) {
          this.updateHoverCoords(e);
          return;
        }
        const dx = e.clientX - this.dragX, dy = e.clientY - this.dragY;
        if (dx === 0 && dy === 0) return;
        if (dx * dx + dy * dy > 4) this.hasMoved = true;
        this.dragX = e.clientX; this.dragY = e.clientY;

        if (this.isOrbitDragging) {
          this.state.camYaw = ((this.state.camYaw || 0) + dx * 0.35 + 360) % 360;
          this.state.camPitch = Math.max(0, Math.min(70, (this.state.camPitch ?? 28) - dy * 0.28));
          const tiltBtn = document.getElementById("btn-3d-tilt");
          if (tiltBtn) tiltBtn.textContent = `${Math.round(this.state.camPitch)}°`;
          this.scheduleRender(false); this.schedulePersistState();
          return;
        }

        const vw = this.viewWidth || 1280, vh = this.viewHeight || 720;
        let stepLon, stepLat;
        if (this.state.viewMode === "3d") {
          const radius = Math.min(vw, vh) * 0.41 * Math.min(Math.max(this.state.zoom, 0.55), 80.0);
          const degPerPx = 57.29578 / Math.max(80, radius);
          const yawRad = ((this.state.camYaw || 0) * Math.PI) / 180;
          const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
          const dEast = -dx * cosY + dy * sinY;
          const dNorth = dx * sinY + dy * cosY;
          const cosLat = Math.max(0.3, Math.cos((this.state.rotLat * Math.PI) / 180));
          stepLon = (dEast / cosLat) * degPerPx;
          stepLat = dNorth * degPerPx;
        } else {
          const mapW = Math.max(vw * 0.86, 620) * Math.min(Math.max(this.state.zoom, 0.65), 32.0);
          stepLon = (-dx / mapW) * 360;
          stepLat = (dy / (mapW * 0.5)) * 180;
        }
        this.velLon = stepLon * 0.65; this.velLat = stepLat * 0.65;
        this.state.rotLon = this.normalizeLon(this.state.rotLon + stepLon);
        this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat + stepLat));
        this.hoverCoords.lat = this.state.rotLat;
        this.hoverCoords.lon = this.state.rotLon;
        this.scheduleRender(false);
      });

      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const clampedDelta = Math.max(-180, Math.min(180, e.deltaY));
        this.applyZoom(this.state.zoom * Math.pow(1.0022, -clampedDelta));
      }, { passive: false });

      this.canvas.addEventListener("click", (e) => {
        if (this.hasMoved) return;
        const rect = this.canvas.getBoundingClientRect();
        const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

        const hit = this.hitTargets.find((t) => Math.hypot(cx - t.x, cy - t.y) <= t.r);
        if (hit && !this.pickMode) { this.flyToCraterById(hit.crater.id); return; }

        const geo = this.pixelToGeo(cx, cy);
        if (!geo.insideMap) {
          if (this.pickMode) this.showToast(this.t("toastClickMarsSurface"), true);
          return;
        }
        this.pickMode = null; this.canvas.style.cursor = "";
        this.state.customDestination = this.routePlanner.geo.makeEndpointPoint("picked-dest", this.t("pickedDestName"), geo.lat, geo.lon);
        this.state.useCustomCoordinates = true; this.state.routeScope = "global";
        this.backendRoutes = null;
        this.persistState(); this.refreshAll();
        this.showToast(this.t("toastDestPicked", { lat: geo.lat.toFixed(2), lon: geo.lon.toFixed(2) }));
        this.scheduleBackendRouteFetch(20);
      });
    }

    bindGlobalEvents() {
      window.addEventListener("mouseup", () => {
        if (!this.isDragging) return;
        const wasOrbit = this.isOrbitDragging;
        this.isDragging = false; this.isOrbitDragging = false;
        if (!wasOrbit) this.startInertia();
        else { this.scheduleRender(true); this.schedulePersistState(); }
      });

      window.addEventListener("keydown", (e) => {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "select" || tag === "textarea") return;
        const k = e.key.toLowerCase();
        const step = Math.max(0.15, 4.5 / Math.max(1, this.state.zoom));
        const yawRad = ((this.state.camYaw || 0) * Math.PI) / 180;
        const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
        if (k === "w" || e.key === "ArrowUp") {
          this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat + step * cosY));
          this.state.rotLon = this.normalizeLon(this.state.rotLon + step * sinY);
        } else if (k === "s" || e.key === "ArrowDown") {
          this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat - step * cosY));
          this.state.rotLon = this.normalizeLon(this.state.rotLon - step * sinY);
        } else if (k === "a" || e.key === "ArrowLeft") {
          this.state.rotLon = this.normalizeLon(this.state.rotLon - step * cosY);
          this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat + step * sinY));
        } else if (k === "d" || e.key === "ArrowRight") {
          this.state.rotLon = this.normalizeLon(this.state.rotLon + step * cosY);
          this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat - step * sinY));
        } else if (k === "q") { this.state.camYaw = ((this.state.camYaw || 0) - 8 + 360) % 360; }
        else if (k === "e") { this.state.camYaw = ((this.state.camYaw || 0) + 8) % 360; }
        else if (k === "r") { this.state.camPitch = Math.min(70, (this.state.camPitch ?? 28) + 5); this.renderBottomRight(); }
        else if (k === "f") { this.state.camPitch = Math.max(0, (this.state.camPitch ?? 28) - 5); this.renderBottomRight(); }
        else return;
        this.scheduleRender(true); this.schedulePersistState();
      });

      document.addEventListener("click", (e) => {
        if (!e.target.closest("#settings-anchor")) this.settingsPanel.close();
        if (!e.target.closest("#bottom-left-dock")) this.satellitesPanel.close();
      });

      window.addEventListener("resize", () => { this.resizeCanvas(); this.scheduleRender(true); });
    }

    startInertia() {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      const step = () => {
        if (Math.abs(this.velLon) < 0.03 && Math.abs(this.velLat) < 0.03) {
          this.isAnimating = false; this.animFrame = null;
          this.scheduleRender(true); this.schedulePersistState();
          return;
        }
        this.isAnimating = true;
        this.state.rotLon = this.normalizeLon(this.state.rotLon + this.velLon);
        this.state.rotLat = Math.max(-84, Math.min(84, this.state.rotLat + this.velLat));
        this.velLon *= 0.87; this.velLat *= 0.87;
        this.scheduleRender(false);
        this.animFrame = requestAnimationFrame(step);
      };
      this.animFrame = requestAnimationFrame(step);
    }

    animateTo(targetLat, targetLon, targetZoom) {
      if (this.animFrame) cancelAnimationFrame(this.animFrame);
      clearTimeout(this.zoomSettleTimer);
      this.isZooming = false;
      const maxZ = this.state.viewMode === "3d" ? 80.0 : 32.0;
      const clampedZoom = Math.min(Math.max(targetZoom, 0.65), maxZ);
      let dLon = targetLon - this.state.rotLon;
      if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;

      const startLat = this.state.rotLat, startLon = this.state.rotLon, startZoom = this.state.zoom;
      const tStart = performance.now(), duration = 420;
      this.isAnimating = true;

      const tick = (now) => {
        const t = Math.min(1, (now - tStart) / duration);
        const ease = 1 - Math.pow(1 - t, 3);
        this.state.rotLat = startLat + (targetLat - startLat) * ease;
        this.state.rotLon = this.normalizeLon(startLon + dLon * ease);
        this.state.zoom = startZoom + (clampedZoom - startZoom) * ease;
        if (t < 1) {
          this.scheduleRender(false);
          this.animFrame = requestAnimationFrame(tick);
        } else {
          this.isAnimating = false; this.animFrame = null;
          this.scheduleRender(true); this.persistState();
        }
      };
      this.animFrame = requestAnimationFrame(tick);
    }

    applyZoom(nextZoom) {
      const maxZ = this.state.viewMode === "3d" ? 80.0 : 32.0;
      this.state.zoom = Math.min(Math.max(nextZoom, 0.65), maxZ);
      this.isZooming = true;
      clearTimeout(this.zoomSettleTimer);
      this.zoomSettleTimer = setTimeout(() => {
        this.isZooming = false;
        this.scheduleRender(true);
        this.persistState();
      }, 110);
      this.scheduleRender(false);
      this.schedulePersistState();
    }

    normalizeLon(lon) { return ((lon + 180) % 360 + 360) % 360 - 180; }

    resizeCanvas() {
      if (!this.canvas) return;
      const rect = this.canvas.getBoundingClientRect();
      this.viewWidth = Math.max(1, Math.round(rect.width || window.innerWidth));
      this.viewHeight = Math.max(1, Math.round(rect.height || window.innerHeight));
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.viewWidth * this.dpr);
      this.canvas.height = Math.round(this.viewHeight * this.dpr);
    }

    pixelToGeo(px, py) {
      const geo = this.routePlanner.geo;
      if (this.state.viewMode === "3d") {
        const relief = this.state.enable3DTerrain === false ? 0 : (this.state.topoReliefScale ?? 1.0);
        return geo.screenToMarsCoords3D(px, py, this.viewWidth, this.viewHeight, this.state.rotLat, this.state.rotLon, this.state.zoom, this.state.camPitch ?? 28, this.state.camYaw ?? 0, relief);
      }
      return geo.screenToMarsCoords2D(px, py, this.viewWidth, this.viewHeight, this.state.rotLat, this.state.rotLon, this.state.zoom);
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
      this.persistState(); this.refreshAll();
      if (this.state.backendApiUrl) this.scheduleBackendRouteFetch(40);
    }

    togglePickMode(mode) {
      this.pickMode = this.pickMode === mode ? null : mode;
      if (this.canvas) this.canvas.style.cursor = this.pickMode ? "crosshair" : "";
      if (this.pickMode === "destination") this.showToast(this.t("toastPickDestinationHint"));
      this.renderUi();
    }

    async handleBackendUrlSave(rawUrl) {
      if (!this.backendApi) return;
      const clean = this.backendApi.normalizeBaseUrl(rawUrl);
      this.state.backendApiUrl = clean;
      this.backendRoutes = null; this.backendHazards = null;
      this.backendStatusText = clean ? this.t("backendConnecting") : this.t("backendLocalActive");
      this.persistState(); this.refreshAll();
      if (clean) await this.refreshBackendHazardsAndRoute();
      else this.showToast(this.t("toastBackendUrlCleared"));
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
        this.cachedBundle = null;
        this.scheduleRender(false);
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
        : (this.state.backendApiUrl ? `⏱ ${this.t("inspNoConnection")}` : `⏱ ${this.t("inspLocalBadge")}`);
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
      this.routeDebounceTimer = setTimeout(() => this.fetchBackendRouteNow(), delayMs);
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
        if (res.hazards) this.backendHazards = res.hazards;
        this.backendStatusText = this.t("backendResponded", { ms: res.latencyMs || 0 });
        this.updateLatencyBadges();
      } catch (err) {
        if (seq !== this.requestSeq) return;
        this.backendRoutes = null; this.backendLatencyMs = null;
        this.backendStatusText = `${this.t("inspBackendWaiting")} (${baseUrl}/api/v1/route)`;
        this.updateLatencyBadges();
        if (isManual) this.showToast(`${baseUrl}/api/v1/route — ${this.t("inspBackendWaiting")}`, true);
      } finally {
        if (seq === this.requestSeq) {
          this.backendLoading = false; this.cachedBundle = null;
          this.renderUi(); this.scheduleRender(false);
        }
      }
    }

    updateHoverCoords(e) {
      const now = performance.now();
      if (now - this.lastHoverTs < 32) return;
      this.lastHoverTs = now;
      const px = typeof e.offsetX === "number" ? e.offsetX : e.clientX;
      const py = typeof e.offsetY === "number" ? e.offsetY : e.clientY;
      const geo = this.pixelToGeo(px, py);
      if (geo.insideMap) this.hoverCoords = { lat: geo.lat, lon: geo.lon };
      this.updateTelemetryBar();
    }

    showToast(msg, isWarn = false) {
      const toast = document.getElementById("app-toast");
      if (!toast) return;
      toast.textContent = msg;
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
   - Satir 17-75: constructor; 10 dilli i18n, HiDPI olcek, rAF birlestirme, Rust Backend istemcisi ve 10s FPS koruma sistemini kurar.
   - Satir 76-158: initUiPanels, init, getLocalizedCraters ve changeLanguage; Ayarlar, Uydular, Rota Inceleme panellerini ve 10 dil gecisini yonetir.
   - Satir 160-250: scheduleRender, applyGuardedSetting, performFactoryReset ve krater/kuresel rota gecis metodlari.
   - Satir 251-355: getActiveHazardBundle, computeActiveRoutes, buildCurrentRequestPayload, getRouteAndHazardBundle ve renderUi yardimcilari.
   - Satir 357-445: requestTilesForView ve drawMap; HiDPI tuval donusumuyle 2D/3D motorlarini donmasiz cizer.
   - Satir 447-625: piksel-kilitli surukleme, yumusak tekerlek yakinlastirma, haritadan hedef secimi, atalet ve duragan netlestirme.
   - Satir 626-774: pixelToGeo, Rust Backend senkronizasyonu, 5s gecikme izleyici, HiDPI koordinat okuma ve bildirim yonetimi.
   ========================================================================== */
