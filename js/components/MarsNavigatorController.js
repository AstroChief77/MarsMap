/**
 * @file MarsNavigatorController.js
 * @description AstroChief Mars Navigator ana koordinasyon denetleyicisi.
 * Varsayilan 3D kure, 2D harita gecisi, Uydular paneli, Factory Reset, FPS < 10 koruma,
 * Progressive LOD data/tiles karo yukleme ve saf Rust Backend rota istek/yanit akisini birlestirir.
 */

(function (ns) {
  "use strict";
  const { CRATERS_DATA, CRATER_WAYPOINTS_DATA, AppConfig, StateStorageService, FpsGuardService, DatasetLoader, MarsTileLoader, HazardFieldService, BackendApiService, RoutePlannerService, Map2DRenderer, Map3DRenderer, SettingsPanel, SatellitesPanel, RouteInspectorPanel, MissionInfoModal, DemoScenarioService, DemoControlBar } = ns;

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
      this.state.camYaw = 0;
      this.state.rotLat = Math.max(-75, Math.min(75, Number(this.state.rotLat) || -4.59));
      this.state.rotLon = this.normalizeLon(Number(this.state.rotLon) || 137.44);
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
      this.budget = ns.MissionBudgetHelper ? new ns.MissionBudgetHelper() : null;
      this.paramAttempted = false;
      this.interactionHelper = ns.MarsMapInteractionHelper ? new ns.MarsMapInteractionHelper(this) : null;

      this.initUiPanels();
    }

    t(key, vars = {}) { return this.i18n ? this.i18n.t(key, vars) : key; }

    /**
     * Ust arama cubugundan koordinat (lat, lon) veya yer/krater adi aramasini isler
     */
    handleSearchQuery(rawQuery) { return this.interactionHelper?.handleSearchQuery(rawQuery); }

    initUiPanels() {
      this.settingsPanel = new SettingsPanel(document.getElementById("top-left-dock"), {
        onFactoryReset: () => this.performFactoryReset(),
        onLanguageChange: (code) => this.changeLanguage(code),
        onSettingChange: (key, val, label) => this.applyGuardedSetting(key, val, label),
        onSearchQuery: (q) => this.handleSearchQuery(q),
        onPopoverOpen: () => this.satellitesPanel?.close(),
        onPanelToggle: () => this.scheduleRender(false),
        onSelectGlobalScope: () => this.switchToGlobalRouteScope(),
        onSelectCrater: (craterId) => this.flyToCraterById(craterId),
        onOpenInfoModal: () => this.missionModal.open(),
        onToggleDemo: () => {
          window.location.href = window.location.protocol === "file:" ? "./demo/index.html" : "./demo/";
        },
        onBackendUrlSave: (url) => this.handleBackendUrlSave(url),
        onBackendUrlTest: (url) => this.handleBackendUrlTest(url)
      });
      this.satellitesPanel = new SatellitesPanel(document.getElementById("bottom-left-dock"), {
        onSettingChange: (key, val, label) => this.applyGuardedSetting(key, val, label),
        onPopoverOpen: () => this.settingsPanel?.close(),
        onPanelToggle: () => this.scheduleRender(false)
      });
      this.inspectorPanel = new RouteInspectorPanel(document.getElementById("top-right-dock"), {
        onToggleInspector: (open) => { this.state.inspectorOpen = open; this.persistState(); this.renderUi(); this.scheduleRender(false); },
        onChangeExpeditionMode: (m) => this.onChangeExpeditionMode(m),
        onChangeMissionParam: (k, v) => this.onChangeMissionParam(k, v),
        onChangeGlobalEndpoints: (key, siteId) => this.handlePresetEndpointChange(key, siteId),
        onTogglePickMode: (mode) => this.togglePickMode(mode),
        onSendBackendRoute: () => this.confirmAndCalculateRoute(),
        onStartJointJourney: () => this.startJointJourney(),
        onChangeStepTab: (tab) => { this.state.activeStepRouteTab = tab === "secondary" ? "secondary" : "primary"; this.persistState(); this.renderUi(); },
        onFocusCoords: (lat, lon) => this.animateTo(lat, lon, Math.max(this.state.zoom, 1.35)),
        onSelectWaypoint: (wpId) => {
          this.selectedWaypoint = this.getActiveWaypoints().find((w) => w.id === wpId) || null;
          this.renderUi();
          this.scheduleRender(false);
        }
      });
      this.missionModal = new MissionInfoModal(document.getElementById("mission-modal-root"));
      const demoMount = document.getElementById("demo-bar-root");
      if (DemoScenarioService) {
        const wired = DemoScenarioService.attach(demoMount, {
          getState: () => this.state, getRoutes: () => this.backendRoutes,
          ensureMissionParamsReady: (open) => this.ensureMissionParamsReady(open),
          onChangeExpeditionMode: (m) => this.onChangeExpeditionMode(m),
          applyDemoScenario: (sc) => this.applyDemoScenario(sc), scheduleRender: (t) => this.scheduleRender(t),
          renderUi: () => this.renderUi(), showToast: (m, w) => this.showToast(m, w)
        });
        this.demoService = wired.service; this.demoBar = wired.bar;
      }
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
      if (this.demoService) this.demoService.expeditionMode = this.state.expeditionMode || "rover-crew";

      this.resizeCanvas();
      this.renderBottomRight();
      this.bindCanvasEvents();
      this.bindGlobalEvents();
      this.fpsGuard.start();
      this.startBackendLatencyMonitor();
      this.refreshAll();
      this.refreshBackendHazardsAndHealth();
      try { if (new URLSearchParams(window.location.search).get("demo") === "1") this.demoService?.startDemo(0); } catch (_e) {}
    }

    getMissionParamCheck() {
      if (this.budget) return this.budget.validateMissionParams(this.state);
      const miss = [];
      if (!(this.state.oxygenReserveLiters > 0)) miss.push("o2");
      if (!(this.state.energyReserveKwh > 0)) miss.push("energy");
      if (!(this.state.targetSpeedKmH > 0)) miss.push("speed");
      return { valid: miss.length === 0, missingKeys: miss, mode: this.state.expeditionMode || "rover-crew", profile: { minSpeedKmH: 4, maxSpeedKmH: 19, defaultSpeedKmH: 14.5 }, normalized: { startO2Pct: 0, startEnergyPct: 0 } };
    }

    hasValidMissionParams() { return this.getMissionParamCheck().valid; }

    ensureMissionParamsReady(openInspector = true) {
      const check = this.getMissionParamCheck();
      if (check.valid) return true;
      this.paramAttempted = true;
      if (openInspector && !this.state.inspectorOpen) {
        this.state.inspectorOpen = true;
        this.persistState();
      }
      this.renderUi();
      const map = { o2: "#inp-mission-o2", energy: "#inp-mission-energy", speed: "#inp-mission-speed" };
      const sel = map[check.missingKeys[0]];
      if (sel) setTimeout(() => document.querySelector(sel)?.focus?.(), 20);
      this.showToast(this.t("demoGateBlockedToast"), true);
      return false;
    }

    onChangeExpeditionMode(mode) {
      const normalized = this.budget ? this.budget.normalizeModeId(mode) : (mode === "joint-eva-escort" ? "joint-eva-escort" : "rover-crew");
      const prof = this.budget ? this.budget.getModeProfile(normalized) : { defaultSpeedKmH: normalized === "joint-eva-escort" ? 3.6 : 14.5 };
      this.state.expeditionMode = normalized;
      this.state.targetSpeedKmH = prof.defaultSpeedKmH;
      if (this.demoService) this.demoService.expeditionMode = normalized;
      this.backendRoutes = null; this.cachedBundle = null;
      this.persistState();
      this.renderUi();
      if (this.hasValidMissionParams() && this.state.missionParamsConfirmed) this.scheduleBackendRouteFetch(30);
    }

    onChangeMissionParam(key, rawVal) {
      const fieldMap = { o2: "oxygenReserveLiters", energy: "energyReserveKwh", speed: "targetSpeedKmH" };
      const field = fieldMap[key];
      if (!field) return;
      const parsed = this.budget ? this.budget.parsePositive(rawVal) : (Number(rawVal) > 0 ? Number(rawVal) : null);
      if (this.state[field] === parsed && !this.paramAttempted) return;
      this.state[field] = parsed;
      const check = this.getMissionParamCheck();
      if (!check.valid) {
        const hadRoutes = Boolean(this.backendRoutes || this.state.missionParamsConfirmed);
        this.state.missionParamsConfirmed = false;
        this.backendRoutes = null; this.cachedBundle = null;
        this.demoService?.resetSilent?.();
        this.schedulePersistState();
        if (hadRoutes) this.renderUi();
        else this.inspectorPanel?.syncParamGateUi?.(this.state, check, this.paramAttempted);
        return;
      }
      this.paramAttempted = false;
      this.hideToast();
      this.schedulePersistState();
      this.inspectorPanel?.syncParamGateUi?.(this.state, check, false);
      if (this.state.missionParamsConfirmed) this.scheduleBackendRouteFetch(180);
    }

    async confirmAndCalculateRoute() {
      if (!this.ensureMissionParamsReady(true)) return;
      this.paramAttempted = false;
      this.hideToast();
      this.state.missionParamsConfirmed = true;
      this.persistState();
      await this.fetchBackendRouteNow(true);
    }

    async startJointJourney() {
      if (!this.ensureMissionParamsReady(true)) return;
      if (!this.state.missionParamsConfirmed || !this.backendRoutes) await this.confirmAndCalculateRoute();
      if (this.backendRoutes) this.demoService?.startCurrentRoute?.();
    }

    getLocalizedCraters() { return this.i18n ? CRATERS_DATA.map((c) => this.i18n.localizeCrater(c)) : CRATERS_DATA; }
    getActiveCrater() { const list = this.getLocalizedCraters(); return list.find((c) => c.id === this.state.activeCraterId) || list[0]; }
    getActiveWaypoints() { return CRATER_WAYPOINTS_DATA[this.getActiveCrater().id] || []; }

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

    persistState() { clearTimeout(this.persistTimer); this.storage.saveState(this.state); }
    schedulePersistState() { clearTimeout(this.persistTimer); this.persistTimer = setTimeout(() => this.storage.saveState(this.state), 240); }

    /** Hizli tekerlek, surukleme ve karo yuklemelerini tek rAF karesinde birlestirir */
    scheduleRender(requestTiles = false) {
      if (requestTiles) this.tilesNeedRequest = true;
      if (this.renderRafId) return;
      this.renderRafId = requestAnimationFrame(() => {
        this.renderRafId = null;
        if (this.tilesNeedRequest) { this.tilesNeedRequest = false; this.requestTilesForView(); }
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
        this.refreshBackendHazardsAndHealth();
        this.showToast(this.t("toastFpsRevert", { fps: measuredFps, label: failedLabel }), true);
      });

      this.state[key] = value;
      if (key === "viewMode" && value === "3d" && this.state.zoom > 80.0) this.state.zoom = 80.0;
      if (key === "showStarfield") this.starfield?.setEnabled(value);
      this.backendRoutes = null;
      this.persistState();
      this.refreshAll();
      this.scheduleBackendRouteFetch(180);
    }

    /** ZORUNLU KURAL: Sol ust Ayarlar -> 1. Secenek Factory Reset */
    performFactoryReset() {
      this.interactionHelper?.cancelAll();
      if (this.renderRafId) cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
      this.pickMode = null;
      this.paramAttempted = false;
      this.demoService?.resetSilent?.();
      if (this.canvas) this.canvas.style.cursor = "";
      this.backendRoutes = null; this.backendHazards = null;
      this.backendStatusText = ""; this.lastRequestPayload = null;
      this.state = this.storage.factoryReset();
      if (this.i18n) this.i18n.setLang(this.state.lang || "tr");
      if (this.demoService) this.demoService.expeditionMode = this.state.expeditionMode || "rover-crew";
      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      this.starfield?.setEnabled(this.state.showStarfield);
      this.renderBottomRight();
      this.refreshAll();
      this.refreshBackendHazardsAndHealth();
      this.showToast(this.t("toastFactoryReset"));
    }

    switchToGlobalRouteScope() {
      this.state.routeScope = "global";
      this.backendRoutes = null; this.cachedBundle = null;
      this.persistState();
      this.animateTo(-2.0, 96.0, 1.02);
      this.renderUi();
      if (this.hasValidMissionParams() && this.state.missionParamsConfirmed) this.scheduleBackendRouteFetch(120);
    }

    flyToCraterById(craterId) {
      const crater = this.getLocalizedCraters().find((c) => c.id === craterId);
      if (!crater) return;
      this.pickMode = null;
      if (this.canvas) this.canvas.style.cursor = "";
      this.state.activeCraterId = crater.id;
      this.state.routeScope = "global";
      const wps = this.getActiveWaypoints();
      this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
      if (crater.id !== "gale-crater") {
        this.state.customDestination = { id: crater.id, name: crater.name, lat: crater.coordinates.lat, lon: crater.coordinates.lon };
        this.state.useCustomCoordinates = true;
      }
      this.backendRoutes = null;
      this.persistState();
      this.refreshAll();
      this.animateTo(crater.coordinates.lat, crater.coordinates.lon, Math.max(this.state.zoom, 1.25));
      if (this.hasValidMissionParams() && this.state.missionParamsConfirmed) this.scheduleBackendRouteFetch(120);
    }

    getActiveEndpoints() {
      return this.routePlanner.geo.resolveActiveEndpoints(this.state, this.getActiveCrater(), this.getActiveWaypoints(), this.landingSites);
    }

    getActiveHazardBundle() {
      const base = this.hazardService.getGlobalHazardZones(this.state);
      if (!this.backendHazards) return base;
      const pick = (flag, arr, fallback) => (flag ? (Array.isArray(arr) ? arr : fallback) : []);
      return {
        ...base,
        acidZones: pick(this.state.filterAcidRain, this.backendHazards.acidZones, base.acidZones),
        stormZones: pick(this.state.filterDustStorm, this.backendHazards.stormZones, base.stormZones),
        radiationZones: pick(this.state.showRadiationZones, this.backendHazards.radiationZones, base.radiationZones)
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

    applyDemoScenario(scen) {
      if (!scen || !this.ensureMissionParamsReady(true)) return;
      this.paramAttempted = false;
      this.state.missionParamsConfirmed = true;
      Object.assign(this.state, scen.patch || {});
      if (scen.expeditionMode) {
        const mode = this.budget ? this.budget.normalizeModeId(scen.expeditionMode) : scen.expeditionMode;
        const prof = this.budget ? this.budget.getModeProfile(mode) : null;
        this.state.expeditionMode = mode;
        if (prof) this.state.targetSpeedKmH = prof.defaultSpeedKmH;
      }
      if (scen.camera) { this.state.camPitch = scen.camera.pitch ?? 0; this.state.camYaw = 0; }
      this.backendRoutes = null; this.persistState(); this.renderBottomRight(); this.refreshAll();
      if (scen.camera) this.animateTo(scen.camera.lat, scen.camera.lon, scen.camera.zoom);
      this.scheduleBackendRouteFetch(30);
    }

    refreshAll() {
      this.cachedBundle = null;
      this.renderUi(); this.requestTilesForView(); this.drawMap(); this.updateTelemetryBar();
    }

    renderUi() {
      const craters = this.getLocalizedCraters();
      const activeCrater = this.getActiveCrater();
      const wps = this.getActiveWaypoints();
      const { computedRoutes, hazardBundle } = this.getRouteAndHazardBundle();
      const radZones = Array.isArray(hazardBundle?.radiationZones) ? hazardBundle.radiationZones : [];
      const { origin, destination } = this.getActiveEndpoints();
      const reqPayload = this.lastRequestPayload || this.buildCurrentRequestPayload(origin, destination, activeCrater);
      const paramCheck = this.getMissionParamCheck();

      this.settingsPanel.render(this.state, craters, this.backendStatusText, Boolean(this.demoService?.active));
      this.satellitesPanel.render(this.state, this.tileLoader.getLayers());
      this.inspectorPanel.render(
        this.state, activeCrater, this.landingSites, wps, this.selectedWaypoint, computedRoutes, radZones,
        {
          activeOrigin: origin, activeDestination: destination, pickMode: this.pickMode,
          backendLoading: this.backendLoading, backendLatencyMs: this.backendLatencyMs,
          backendStatusText: this.backendStatusText, lastRequestPayload: reqPayload,
          paramCheck, paramAttempted: this.paramAttempted
        }
      );
      this.demoBar?.render(this.demoService?.getUiState());
    }

    renderBottomRight() {
      if (!this.bottomRightEl) return;
      const pitch = Math.round(this.state.camPitch ?? 0);
      this.bottomRightEl.innerHTML = `
        <div class="zoom-stack">
          <button class="zoom-btn" id="btn-zoom-in" title="${this.t("zoomInTitle")}">＋</button>
          <button class="zoom-btn" id="btn-zoom-out" title="${this.t("zoomOutTitle")}">－</button>
          <button class="zoom-btn zoom-btn-3d" id="btn-3d-tilt" title="${this.t("tiltBtnTitle")}">${pitch}°</button>
          <button class="zoom-btn zoom-btn-peak" id="btn-3d-peak" title="${this.t("peakBtnTitle")}">⛰</button>
          <button class="zoom-btn" id="btn-cam-reset" title="${this.t("zoomResetTitle")}">⌂</button>
        </div>
      `;

      this.bottomRightEl.querySelector("#btn-zoom-in")?.addEventListener("click", () => this.applyZoom(this.state.zoom * 1.45));
      this.bottomRightEl.querySelector("#btn-zoom-out")?.addEventListener("click", () => this.applyZoom(this.state.zoom * 0.69));
      this.bottomRightEl.querySelector("#btn-3d-tilt")?.addEventListener("click", () => {
        this.state.viewMode = "3d";
        this.state.camPitch = (this.state.camPitch ?? 0) < 20 ? 34 : (this.state.camPitch < 50 ? 58 : 0);
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
        this.showToast(this.t("toastPeakVisit", { name: p.name }));
      });
      this.bottomRightEl.querySelector("#btn-cam-reset")?.addEventListener("click", () => {
        const c = this.getActiveCrater();
        this.state.camPitch = 0; this.state.camYaw = 0;
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
      const elevStr = topo ? `${topo.elevM >= 0 ? "+" : ""}${topo.elevM} m (${this.t("telemSlope")} ${topo.slopeDeg}°)` : "";
      const pitchStr = this.state.viewMode === "3d" ? ` • ${this.t("telemPitch")}: ${Math.round(this.state.camPitch ?? 0)}°` : "";
      const nextText = `${this.hoverCoords.lat.toFixed(2)}°, ${this.hoverCoords.lon.toFixed(2)}° • ${this.t("telemElev")}: ${elevStr}${pitchStr} • ${stats.name} • z=${stats.zoom}`;
      if (nextText !== this.lastTelemetryText) {
        this.lastTelemetryText = nextText;
        el.textContent = nextText;
      }
    }

    requestTilesForView() {
      const vw = this.viewWidth || window.innerWidth || 1280;
      const vh = this.viewHeight || window.innerHeight || 720;
      const { activeLayerId, rotLat, rotLon, zoom, viewMode, progressiveLodRender, camPitch, camYaw } = this.state;
      const isDragging = Boolean(this.isDragging || this.isOrbitDragging);
      const isZooming = Boolean(this.isZooming || this.isAnimating);
      const isInteracting = Boolean(isDragging || isZooming);
      this.tileLoader.requestVisibleTiles(activeLayerId, {
        rotLat, rotLon, zoom, dpr: this.dpr || 1, viewportW: vw, viewportH: vh,
        camPitch: camPitch ?? 0, camYaw: camYaw ?? 0, isDragging, isZooming, isInteracting,
        mapWidthPx: Math.max(vw * 0.86, 620) * Math.min(Math.max(zoom, 0.65), 32.0),
        sphereRadiusPx: Math.min(vw, vh) * 0.41 * Math.min(Math.max(zoom, 0.55), 80.0),
        viewMode, progressiveLodRender
      });
    }

    computeUiAvoidRects() {
      return this.interactionHelper?.computeUiAvoidRects() || [];
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
        camPitch: s.camPitch ?? 0, camYaw: s.camYaw ?? 0,
        topoReliefScale: s.topoReliefScale ?? 1.0, enable3DTerrain: s.enable3DTerrain !== false,
        isDragging: this.isDragging || this.isOrbitDragging, isInteracting: interacting,
        craters: this.getLocalizedCraters(), landingSites: this.landingSites, activeCrater,
        hazardBundle, craterRadZones: this.hazardService.getCraterRadiationZones(activeCrater.id),
        computedRoutes, craterWaypoints: this.getActiveWaypoints(), selectedWaypoint: this.selectedWaypoint,
        customOrigin: origin, customDestination: destination,
        progressiveLodRender: s.progressiveLodRender, showGraticule: s.showGraticule,
        showNomenclature: s.showNomenclature, showRadiationZones: s.showRadiationZones,
        showRouteComments: s.showRouteComments, routeScope: s.routeScope, highQualityGlobeRay: s.highQualityGlobeRay,
        demoSim: this.demoService?.getRenderPayload() || null,
        uiAvoidRects: this.computeUiAvoidRects()
      };

      this.hitTargets = s.viewMode === "3d"
        ? this.renderer3D.render(this.ctx, payload)
        : this.renderer2D.render(this.ctx, payload);
      this.fpsGuard.recordRenderCost(performance.now() - t0);
    }

    bindCanvasEvents() { this.interactionHelper?.bindCanvasEvents(); }
    bindGlobalEvents() { this.interactionHelper?.bindGlobalEvents(); }
    startInertia() { this.interactionHelper?.startInertia(); }
    animateTo(targetLat, targetLon, targetZoom) { this.interactionHelper?.animateTo(targetLat, targetLon, targetZoom); }
    applyZoom(nextZoom) { this.interactionHelper?.applyZoom(nextZoom); }

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
        return geo.screenToMarsCoords3D(px, py, this.viewWidth, this.viewHeight, this.state.rotLat, this.state.rotLon, this.state.zoom, this.state.camPitch ?? 0, this.state.camYaw ?? 0, relief);
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
        else {
          this.state.customDestination = pt;
          if (siteId === "perseverance-jezero") this.state.activeCraterId = "jezero-crater";
          else if (siteId === "curiosity-gale") this.state.activeCraterId = "gale-crater";
          const wps = this.getActiveWaypoints();
          this.selectedWaypoint = wps.find((w) => w.highlight) || wps[0] || null;
        }
      }
      this.backendRoutes = null;
      this.persistState(); this.refreshAll();
      if (this.hasValidMissionParams() && this.state.missionParamsConfirmed) this.scheduleBackendRouteFetch(40);
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
      if (!clean) this.showToast(this.t("toastBackendUrlCleared"));
      await this.refreshBackendHazardsAndHealth();
    }

    async handleBackendUrlTest(rawUrl) {
      if (!this.backendApi) return;
      const res = await this.backendApi.testConnection(rawUrl);
      this.backendStatusText = res.message;
      this.renderUi();
      this.showToast(res.message, !res.ok);
    }

    async refreshBackendHazardsAndHealth() {
      if (!this.backendApi) return;
      const baseUrl = this.state.backendApiUrl || "";
      const health = await this.backendApi.testConnection(baseUrl);
      this.backendStatusText = health.message;
      this.backendLatencyMs = health.ok ? health.latencyMs : null;
      this.updateLatencyBadges();
      const hz = await this.backendApi.fetchHazards(baseUrl);
      if (hz) {
        this.backendHazards = hz;
        this.cachedBundle = null;
        this.scheduleRender(false);
      }
      if (this.hasValidMissionParams() && this.state.missionParamsConfirmed) await this.fetchBackendRouteNow();
    }

    async refreshBackendHazardsAndRoute() {
      return this.refreshBackendHazardsAndHealth();
    }

    startBackendLatencyMonitor() {
      clearInterval(this.latencyTimer);
      this.latencyTimer = setInterval(async () => {
        if (!this.backendApi) return;
        const health = await this.backendApi.testConnection(this.state.backendApiUrl || "");
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
      if (!this.hasValidMissionParams() || !this.state.missionParamsConfirmed) return;
      this.routeDebounceTimer = setTimeout(() => this.fetchBackendRouteNow(), delayMs);
    }

    async fetchBackendRouteNow(isManual = false) {
      if (!this.backendApi) return;
      if (!this.hasValidMissionParams() || !this.state.missionParamsConfirmed) {
        if (isManual) this.ensureMissionParamsReady(true);
        return;
      }
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
        this.backendStatusText = this.t("backendResponded", { ms: res.latencyMs ?? 1 });
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

    hideToast() { clearTimeout(this.toastTimer); document.getElementById("app-toast")?.classList.remove("show"); }

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
   - Satir 1-61: JSDoc, modul tanimi ve constructor; MissionBudgetHelper, 9 dilli i18n, HiDPI olcek, MarsMapInteractionHelper, Rust Backend/WASM istemcisi ve 10s FPS koruma sistemini kurar.
   - Satir 63-210: handleSearchQuery delegasyonu, initUiPanels (panel ac/kapa yeniden cizimi dahil) ve init.
   - Satir 212-355: Zorunlu on-gorev parametre kapisi (getMissionParamCheck, ensureMissionParamsReady, onChangeExpeditionMode, onChangeMissionParam, confirmAndCalculateRoute, startJointJourney), dil degisimi ve 10s FPS guard.
   - Satir 357-460: performFactoryReset, switchToGlobalRouteScope, flyToCraterById, applyDemoScenario (pitch ?? 0 + expeditionMode) ve rota/tehlike demetleri.
   - Satir 462-575: refreshAll, renderUi, renderBottomRight (0° duz varsayilan egim), updateTelemetryBar, computeUiAvoidRects delegasyonu ve drawMap.
   - Satir 577-750: Etkilesim/koordinat yardimcilari, hedef secimi, backend saglik/tehlike ve kapi korumali rota hesaplama, 5s gecikme izleyici, HiDPI koordinat okuma ve toast bildirimi.
   ========================================================================== */

