/**
 * @file DemoStudioController.js
 * @description /demo Mars Hayatta Kalma & Ortak Sefer Simulasyon Studyosu ana denetleyicisi.
 * Zorunlu on gorev parametre kapisi (O2, Batarya, Su, Hiz), Rover+Ekip / Rover+Yaya EVA modlari,
 * canli cevresel etken enjeksiyonu, 2D/3D MOLA harita simulasyonu, Rust WASM/HTTP A* ve canli grafik akisini yonetir.
 */

(function (ns) {
  "use strict";

  const {
    CRATERS_DATA, AppConfig, DatasetLoader, MarsTileLoader, HazardFieldService,
    BackendApiService, RoutePlannerService, Map2DRenderer, Map3DRenderer,
    StarfieldRenderer, MarsSimulationEngine, SimulationChartRenderer
  } = ns;

  class DemoStudioController {
    constructor() {
      this.config = new AppConfig();
      this.budget = ns.MissionBudgetHelper ? new ns.MissionBudgetHelper() : null;
      this.datasetLoader = new DatasetLoader();
      this.tileLoader = new MarsTileLoader(() => this.scheduleMapRender(false));
      this.hazardService = new HazardFieldService(this.config);
      this.backendApi = new BackendApiService(this.config);
      this.routePlanner = new RoutePlannerService(this.config, this.hazardService);
      this.simEngine = new MarsSimulationEngine();
      this.renderer2D = new Map2DRenderer(this.tileLoader);
      this.renderer3D = new Map3DRenderer(this.tileLoader);
      this.starfield = new StarfieldRenderer("demo-starfield");
      this.chart = new SimulationChartRenderer(null);

      this.canvas = document.getElementById("demo-map-canvas");
      this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
      this.dpr = 1;
      this.viewW = 960;
      this.viewH = 640;

      this.landingSites = [];
      this.backendRoutes = null;
      this.backendLatencyMs = null;
      this.requestSeq = 0;
      this.pickMode = false;
      this.paramAttempted = false;

      this.playing = false;
      this.progress = 0;
      this.speedMult = 20;
      this.pulsePhase = 0;
      this.lastTickMs = 0;
      this.playRafId = null;
      this.mapRafId = null;
      this.tilesNeeded = false;
      this.lastUiUpdateMs = 0;
      this.lastFps = 60;
      this.fpsFrames = 0;
      this.fpsStamp = performance.now();

      this.isDragging = false;
      this.isOrbit = false;
      this.hasMoved = false;
      this.dragX = 0;
      this.dragY = 0;
      this.routeTimer = null;
      this.latencyTimer = null;

      this.state = {
        viewMode: "3d", activeLayerId: "mars-viking-mdim21", activeCraterId: "gale-crater", routeScope: "global",
        globalOriginId: "curiosity-gale", globalTargetId: "insight-elysium", useCustomCoordinates: false,
        customOrigin: { id: "curiosity-gale", name: "Gale (Curiosity)", lat: -4.5895, lon: 137.4417 },
        customDestination: { id: "insight-elysium", name: "Elysium (InSight)", lat: 4.5024, lon: 135.6234 },
        backendApiUrl: this.backendApi.resolveInitialUrl("http://127.0.0.1:8080"),
        filterAcidRain: true, acidIntensity: "orta", filterDustStorm: true, stormIntensity: "orta",
        showRadiationZones: true, showRouteComments: true, showNomenclature: true, showGraticule: false,
        progressiveLodRender: true, highQualityGlobeRay: false, enable3DTerrain: true, topoReliefScale: 1.0,
        rotLat: 0.5, rotLon: 136.0, zoom: 1.85, camPitch: 34, camYaw: 0,
        expeditionMode: "rover-crew",
        initialO2L: null, oxygenTankCapacityL: 420, initialWaterL: null, initialEnergyKwh: null, energyTankCapacityKwh: 75.0,
        targetSpeedKmH: 14.5, o2LeakActive: false, stormSurgeActive: false
      };
    }

    async init() {
      this.starfield.init();
      const [, landingJson, hazardJson] = await Promise.all([
        this.tileLoader.initCatalog(),
        this.datasetLoader.getLandingSites(),
        this.datasetLoader.getEnvironmentalHazards()
      ]);
      this.landingSites = landingJson?.landing_sites || [];
      this.hazardService.setWorldviewData(hazardJson);
      this.chart.setCanvas(document.getElementById("sim-chart-canvas"));

      this.resizeCanvas();
      this.bindControls();
      this.bindCanvasEvents();
      this.syncSiteCoords();
      this.syncInputsFromState();
      this.startLatencyMonitor();
      this.updateGateStatus(false);
      this.renderTelemetryAndChart();
      this.scheduleMapRender(true);
    }

    presets() {
      return {
        "gale-elysium-rover": {
          viewMode: "3d", activeLayerId: "mars-viking-mdim21", globalOriginId: "curiosity-gale", globalTargetId: "insight-elysium",
          useCustomCoordinates: false, expeditionMode: "rover-crew", targetSpeedKmH: 14.5,
          filterAcidRain: true, acidIntensity: "orta", filterDustStorm: true, stormIntensity: "orta",
          showRadiationZones: true, o2LeakActive: false, stormSurgeActive: false, rotLat: 0.5, rotLon: 136.0, zoom: 1.85, camPitch: 34, speedMult: 20
        },
        "gale-eva-escort": {
          viewMode: "3d", activeLayerId: "mars-mola-elevation", globalOriginId: "curiosity-gale", useCustomCoordinates: true,
          customDestination: { id: "mount-sharp", name: "Aeolis Mons (Mount Sharp)", lat: -5.08, lon: 137.85 },
          expeditionMode: "joint-eva-escort", targetSpeedKmH: 3.6, filterAcidRain: true, acidIntensity: "hafif", filterDustStorm: false,
          stormIntensity: "hafif", showRadiationZones: true, o2LeakActive: false, stormSurgeActive: false, rotLat: -4.8, rotLon: 137.6, zoom: 5.5, camPitch: 48, speedMult: 5
        },
        "storm-jezero-stress": {
          viewMode: "3d", activeLayerId: "mars-themis-day-ir", globalOriginId: "curiosity-gale", globalTargetId: "perseverance-jezero",
          useCustomCoordinates: false, expeditionMode: "rover-crew", targetSpeedKmH: 12.0,
          filterAcidRain: true, acidIntensity: "siddetli", filterDustStorm: true, stormIntensity: "siddetli",
          showRadiationZones: true, o2LeakActive: false, stormSurgeActive: true, rotLat: 6.5, rotLon: 108.0, zoom: 1.25, camPitch: 28, speedMult: 60
        },
        "jezero-delta-2d": {
          viewMode: "2d", activeLayerId: "mars-viking-mdim21", globalOriginId: "perseverance-jezero", globalTargetId: "insight-elysium",
          useCustomCoordinates: false, expeditionMode: "rover-crew", targetSpeedKmH: 14.5,
          filterAcidRain: true, acidIntensity: "orta", filterDustStorm: true, stormIntensity: "orta",
          showRadiationZones: true, o2LeakActive: false, stormSurgeActive: false, rotLat: 11.0, rotLon: 106.0, zoom: 1.75, camPitch: 0, speedMult: 20
        }
      };
    }

    /** Zorunlu O2/Batarya/Su/Hiz parametre kapisi kontrolu (degerler yoksa yolculuk ve rota baslamaz) */
    validateParamsGate(markAttempt = false) {
      const check = this.simEngine.validateParams(this.state);
      if (markAttempt) this.paramAttempted = !check.valid;
      else if (check.valid) this.paramAttempted = false;
      this.applyGateUi(check, markAttempt);
      return check;
    }

    updateGateStatus(markAttempt = false) {
      return this.validateParamsGate(markAttempt);
    }

    applyGateUi(check, focusFirst = false) {
      const s = this.state;
      const o2PctEl = document.getElementById("sim-o2-cap-pct");
      const enPctEl = document.getElementById("sim-energy-cap-pct");
      if (o2PctEl) o2PctEl.textContent = s.initialO2L > 0 ? `%${check.normalized.startO2Pct}` : "—";
      if (enPctEl) enPctEl.textContent = s.initialEnergyKwh > 0 ? `%${check.normalized.startEnergyPct}` : "—";

      const map = { o2: "#sim-o2-inp", energy: "#sim-energy-inp", water: "#sim-water-inp", speed: "#sim-speed-inp" };
      Object.keys(map).forEach((k) => {
        const el = document.querySelector(map[k]);
        if (el) el.classList.toggle("sim-input-missing", Boolean(this.paramAttempted && check.missingKeys.includes(k)));
      });

      const alertEl = document.getElementById("sim-param-alert");
      if (alertEl) alertEl.classList.toggle("hidden", check.valid);

      document.getElementById("sim-btn-play")?.classList.toggle("sim-btn-locked", !check.valid);
      document.getElementById("sim-scrubber")?.classList.toggle("sim-btn-locked", !check.valid);

      if (focusFirst && !check.valid && check.missingKeys.length > 0) {
        const firstEl = document.querySelector(map[check.missingKeys[0]]);
        firstEl?.focus?.();
      }
    }

    applyPreset(id, autoPlay = true) {
      const p = this.presets()[id];
      if (!p) return;
      Object.assign(this.state, p);
      if (p.speedMult) this.speedMult = p.speedMult;
      this.syncSiteCoords();
      this.syncInputsFromState();
      this.stopLoop();
      this.progress = 0;

      const check = this.validateParamsGate(true);
      if (!check.valid) {
        this.backendRoutes = null;
        this.simEngine.buildTimeline(null, this.state, this.getHazardBundle());
        this.renderTelemetryAndChart();
        this.scheduleMapRender(true);
        return;
      }

      this.recomputeRouteAndTimeline().then(() => {
        if (autoPlay && this.validateParamsGate(false).valid) {
          this.playing = true;
          this._runLoopRaf();
        }
      });
    }

    syncSiteCoords() {
      if (this.state.useCustomCoordinates) return;
      const orig = this.landingSites.find((s) => s.id === this.state.globalOriginId);
      const dest = this.landingSites.find((s) => s.id === this.state.globalTargetId);
      if (orig) this.state.customOrigin = { id: orig.id, name: orig.name, lat: orig.latitude, lon: orig.longitude };
      if (dest) this.state.customDestination = { id: dest.id, name: dest.name, lat: dest.latitude, lon: dest.longitude };
    }

    getHazardBundle() {
      const effStorm = this.state.stormSurgeActive ? "siddetli" : this.state.stormIntensity;
      return this.hazardService.getGlobalHazardZones({
        filterAcidRain: this.state.filterAcidRain,
        acidIntensity: this.state.acidIntensity,
        filterDustStorm: this.state.filterDustStorm || this.state.stormSurgeActive,
        stormIntensity: effStorm,
        showRadiationZones: this.state.showRadiationZones
      });
    }

    async recomputeRouteAndTimeline() {
      const check = this.validateParamsGate(false);
      const hz = this.getHazardBundle();
      if (!check.valid) {
        this.stopLoop();
        this.backendRoutes = null;
        this.simEngine.buildTimeline(null, this.state, hz);
        this.updateLatencyUi();
        this.renderTelemetryAndChart();
        this.scheduleMapRender(true);
        return;
      }

      const seq = ++this.requestSeq;
      const activeCrater = CRATERS_DATA[0];
      const payload = this.backendApi.buildRouteRequestPayload({
        scope: "global",
        origin: this.state.customOrigin,
        destination: this.state.customDestination,
        state: {
          ...this.state,
          oxygenReserveLiters: this.state.initialO2L,
          energyReserveKwh: this.state.initialEnergyKwh,
          waterReserveLiters: this.state.initialWaterL
        },
        activeCrater,
        hazardBundle: hz,
        craterRadZones: [],
        planner: this.routePlanner
      });

      try {
        const res = await this.backendApi.requestStepRoute(this.state.backendApiUrl, payload, this.routePlanner);
        if (seq !== this.requestSeq) return;
        this.backendRoutes = res;
        this.backendLatencyMs = typeof res.latencyMs === "number" ? res.latencyMs : 1;
      } catch (_err) {
        if (seq !== this.requestSeq) return;
        this.backendRoutes = this.routePlanner.computeRoutesBetweenCoords(
          this.state.customOrigin, this.state.customDestination,
          {
            ...this.state,
            oxygenReserveLiters: this.state.initialO2L,
            energyReserveKwh: this.state.initialEnergyKwh,
            waterReserveLiters: this.state.initialWaterL,
            hazardBundle: hz
          }
        );
      }

      this.simEngine.buildTimeline(this.backendRoutes, this.state, hz);
      this.updateLatencyUi();
      this.renderTelemetryAndChart();
      this.scheduleMapRender(true);
    }

    rebuildTimelineOnly() {
      const check = this.validateParamsGate(false);
      const hz = this.getHazardBundle();
      if (!check.valid) {
        this.stopLoop();
        this.backendRoutes = null;
        this.simEngine.buildTimeline(null, this.state, hz);
      } else {
        this.simEngine.buildTimeline(this.backendRoutes, this.state, hz);
      }
      this.renderTelemetryAndChart();
      this.scheduleMapRender(false);
    }

    startLoop() {
      const check = this.validateParamsGate(true);
      if (!check.valid) {
        this.playing = false;
        this.syncPlayButton();
        return;
      }
      if (!this.backendRoutes) {
        this.playing = true;
        this.syncPlayButton();
        this.recomputeRouteAndTimeline().then(() => {
          if (this.playing && this.backendRoutes) this._runLoopRaf();
          else { this.playing = false; this.syncPlayButton(); }
        });
        return;
      }
      this.playing = true;
      this._runLoopRaf();
    }

    _runLoopRaf() {
      if (this.playRafId) return;
      this.lastTickMs = performance.now();
      const tick = (now) => {
        if (!this.playing || !this.validateParamsGate(false).valid) {
          this.playing = false;
          this.playRafId = null;
          this.syncPlayButton();
          return;
        }
        const dtSec = Math.min(0.1, Math.max(0.001, (now - this.lastTickMs) / 1000));
        this.lastTickMs = now;
        this.pulsePhase = (this.pulsePhase + dtSec * 3.4) % (Math.PI * 2);

        const totalHours = Math.max(0.08, this.simEngine.summary?.totalHours || 4.0);
        const totalSimSec = totalHours * 3600;
        const stepProgress = (dtSec * this.speedMult * 12) / totalSimSec;
        this.progress = Math.min(1, this.progress + stepProgress);

        const cur = this.simEngine.sampleAt(this.progress);
        if (cur && (cur.remO2L <= 0.05 || cur.remEnergyKwh <= 0.01)) {
          this.playing = false;
          this.syncPlayButton();
        }
        if (this.progress >= 1) {
          this.playing = false;
          this.syncPlayButton();
        }

        this.scheduleMapRender(false);
        if (now - this.lastUiUpdateMs >= 80) {
          this.lastUiUpdateMs = now;
          this.renderTelemetryAndChart();
        }
        if (this.playing) this.playRafId = requestAnimationFrame(tick);
        else { this.playRafId = null; this.renderTelemetryAndChart(); }
      };
      this.playRafId = requestAnimationFrame(tick);
      this.syncPlayButton();
    }

    stopLoop() {
      this.playing = false;
      if (this.playRafId) cancelAnimationFrame(this.playRafId);
      this.playRafId = null;
      this.syncPlayButton();
    }

    scheduleMapRender(reqTiles = false) {
      if (reqTiles) this.tilesNeeded = true;
      if (this.mapRafId) return;
      this.mapRafId = requestAnimationFrame(() => {
        this.mapRafId = null;
        if (this.tilesNeeded) { this.tilesNeeded = false; this.requestTiles(); }
        this.drawMap();
      });
    }

    requestTiles() {
      const s = this.state;
      this.tileLoader.requestVisibleTiles(s.activeLayerId, {
        rotLat: s.rotLat, rotLon: s.rotLon, zoom: s.zoom, dpr: this.dpr,
        viewportW: this.viewW, viewportH: this.viewH,
        camPitch: s.camPitch, camYaw: s.camYaw,
        isDragging: this.isDragging, isZooming: false, isInteracting: this.isDragging,
        mapWidthPx: Math.max(this.viewW * 0.86, 620) * Math.min(Math.max(s.zoom, 0.65), 32.0),
        sphereRadiusPx: Math.min(this.viewW, this.viewH) * 0.41 * Math.min(Math.max(s.zoom, 0.55), 80.0),
        viewMode: s.viewMode, progressiveLodRender: true
      });
    }

    drawMap() {
      if (!this.ctx || !this.canvas) return;
      this.fpsFrames++;
      const now = performance.now();
      if (now - this.fpsStamp >= 500) {
        this.lastFps = Math.round((this.fpsFrames * 1000) / (now - this.fpsStamp));
        this.fpsFrames = 0; this.fpsStamp = now;
        const fpsEl = document.getElementById("sim-fps-pill");
        if (fpsEl) fpsEl.textContent = `${this.lastFps} FPS`;
      }

      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const s = this.state;
      const check = this.simEngine.validateParams(s);
      const cur = check.valid ? this.simEngine.sampleAt(this.progress) : null;
      const pts = this.backendRoutes?.primaryBlue?.points || [];
      const segIdx = cur ? Math.min(Math.max(0, Math.floor(this.progress * Math.max(0, pts.length - 1))), Math.max(0, pts.length - 2)) : 0;
      const demoSim = (cur && check.valid) ? {
        active: true, ready: true, playing: this.playing,
        expeditionMode: s.expeditionMode,
        progress: this.progress, progressPct: Math.round(this.progress * 100),
        lat: cur.lat, lon: cur.lon, segIdx, pulsePhase: this.pulsePhase,
        traveledKm: cur.km, totalKm: this.simEngine.summary.totalKm,
        elapsedMin: cur.minutes, elevM: cur.elevM,
        remainingO2L: Math.round(cur.remO2L), o2Pct: cur.o2Pct,
        remainingEnergyKwh: cur.remEnergyKwh, energyPct: cur.energyPct
      } : null;

      const payload = {
        width: this.viewW, height: this.viewH, dpr: this.dpr,
        rotLat: s.rotLat, rotLon: s.rotLon, zoom: s.zoom, activeLayerId: s.activeLayerId,
        camPitch: s.camPitch, camYaw: s.camYaw, topoReliefScale: 1.0, enable3DTerrain: true,
        isDragging: this.isDragging, isInteracting: this.isDragging,
        craters: CRATERS_DATA, landingSites: this.landingSites, activeCrater: CRATERS_DATA[0],
        hazardBundle: this.getHazardBundle(), craterRadZones: [],
        computedRoutes: check.valid ? this.backendRoutes : null, craterWaypoints: [], selectedWaypoint: null,
        customOrigin: s.customOrigin, customDestination: s.customDestination,
        progressiveLodRender: true, showGraticule: s.showGraticule,
        showNomenclature: s.showNomenclature, showRadiationZones: s.showRadiationZones,
        showRouteComments: s.showRouteComments, routeScope: "global", highQualityGlobeRay: false,
        demoSim
      };

      if (s.viewMode === "3d") this.renderer3D.render(this.ctx, payload);
      else this.renderer2D.render(this.ctx, payload);
    }

    renderTelemetryAndChart() {
      const check = this.simEngine.validateParams(this.state);
      const cur = check.valid ? this.simEngine.sampleAt(this.progress) : null;
      const sum = this.simEngine.summary;
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      const setBar = (id, pct, warn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        el.classList.toggle("warn", Boolean(warn));
      };

      const arrBox = document.getElementById("sim-arrival-box");
      if (cur && sum.paramsValid) {
        const h = Math.floor(cur.hours);
        const m = Math.round((cur.hours - h) * 60);
        const totH = Math.floor(sum.totalHours);
        const totM = Math.round((sum.totalHours - totH) * 60);
        setTxt("sim-time-val", `${cur.minutes} dk (${h} sa ${m} dk)`);
        setTxt("sim-dist-val", `${cur.km.toFixed(1)} / ${sum.totalKm.toFixed(1)} km`);
        setTxt("sim-speed-val", `${cur.speedKmH} km/sa (${cur.speedMPerMin} m/dk)`);
        setTxt("sim-elev-val", `${cur.elevM >= 0 ? "+" : ""}${cur.elevM} m (${cur.slopeDeg}°)`);
        setTxt("sim-o2-val", `${cur.remO2L.toFixed(0)} L (%${cur.o2Pct}) · ${cur.o2RateLPerMin} L/dk`);
        setTxt("sim-water-val", `${cur.remWaterL.toFixed(1)} L (%${cur.waterPct})`);
        setTxt("sim-energy-val", `${cur.remEnergyKwh.toFixed(2)} kWh (%${cur.energyPct}) · ${cur.powerKw} kW`);
        setTxt("sim-co2-rad-val", `CO₂: ${cur.cumCo2L} L · Doz: ${cur.cumRadMsv.toFixed(2)} mSv`);
        setBar("sim-o2-bar", cur.o2Pct, cur.o2Pct < 20);
        setBar("sim-water-bar", cur.waterPct, cur.waterPct <= 15);
        setBar("sim-energy-bar", cur.energyPct, cur.energyPct < 35);

        if (arrBox) {
          arrBox.innerHTML = `
            <div class="sim-arr-row"><span>Varış Süresi:</span><strong>${sum.totalMinutes} dk (${totH} sa ${totM} dk) · ${sum.totalKm.toFixed(1)} km</strong></div>
            <div class="sim-arr-row"><span>Ortalama Hız:</span><strong>${sum.avgSpeedKmH} km/sa (${sum.speedMPerMin} m/dk)</strong></div>
            <div class="sim-arr-row"><span>O₂ Bütçesi:</span><strong>%${sum.startO2Pct} (${sum.startO2L} L) → ${Math.round(sum.finalO2L)} L (%${sum.finalO2Pct})</strong></div>
            <div class="sim-arr-row"><span>Enerji Bütçesi:</span><strong>%${sum.startEnergyPct} (${sum.startEnergyKwh} kWh) → ${sum.finalEnergyKwh.toFixed(1)} kWh (%${sum.finalEnergyPct})</strong></div>
            ${sum.walkbackBreach ? `<div class="sim-arr-warn">⚠ KRİTİK: Varışta O₂ %20 Walkback eşiğinin altında!</div>` : ""}
            ${sum.batteryBreach ? `<div class="sim-arr-warn">⚡ UYARI: Varışta batarya %35 sınırının altında!</div>` : ""}
          `;
        }
      } else {
        ["sim-time-val", "sim-dist-val", "sim-speed-val", "sim-elev-val", "sim-o2-val", "sim-water-val", "sim-energy-val"].forEach((id) => setTxt(id, "—"));
        setTxt("sim-co2-rad-val", "CO₂: — · Doz: —");
        ["sim-o2-bar", "sim-water-bar", "sim-energy-bar"].forEach((id) => setBar(id, 0, false));
        if (arrBox) {
          arrBox.textContent = "Ön görev O₂ (L), Enerji (kWh) ve Su (L) parametreleri girildiğinde ortak sefer süresi (dk), hız (km/sa) ve varış rezervi (%) hesaplanır.";
        }
      }

      const scrubber = document.getElementById("sim-scrubber");
      if (scrubber) scrubber.value = String(Math.round(this.progress * 1000));
      setTxt("sim-pct-pill", `${Math.round(this.progress * 100)}%`);

      this.chart.render(this.simEngine.samples, this.progress, sum);
      this.renderEventLog();
    }

    renderEventLog() {
      const box = document.getElementById("sim-event-log");
      if (!box) return;
      const visible = this.simEngine.events.filter((ev) => ev.progress <= this.progress + 0.001);
      box.innerHTML = visible.slice().reverse().map((ev) => {
        const h = Math.floor(ev.hours);
        const m = Math.round((ev.hours - h) * 60);
        return `<div class="sim-log-item ${ev.level}"><span>[${h}:${String(m).padStart(2, "0")}]</span> ${ev.text}</div>`;
      }).join("");
    }

    syncPlayButton() {
      const btn = document.getElementById("sim-btn-play");
      if (btn) btn.textContent = this.playing ? "⏸ Duraklat" : "▶ Başlat";
    }

    syncInputsFromState() {
      const s = this.state;
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v == null ? "" : String(v); };
      const setChk = (id, v) => { const el = document.getElementById(id); if (el) el.checked = Boolean(v); };

      const siteOpts = this.landingSites.map((ls) => `<option value="${ls.id}">${ls.name}</option>`).join("");
      const origSel = document.getElementById("sim-origin-sel");
      const destSel = document.getElementById("sim-dest-sel");
      if (origSel && !origSel.options.length && siteOpts) origSel.innerHTML = siteOpts;
      if (destSel && !destSel.options.length && siteOpts) destSel.innerHTML = siteOpts;

      setVal("sim-origin-sel", s.globalOriginId);
      if (destSel) {
        if (s.useCustomCoordinates) {
          if (!destSel.querySelector('option[value="__custom__"]')) {
            const opt = document.createElement("option");
            opt.value = "__custom__";
            destSel.prepend(opt);
          }
          destSel.querySelector('option[value="__custom__"]').textContent = `${s.customDestination.name} (${s.customDestination.lat.toFixed(1)}°, ${s.customDestination.lon.toFixed(1)}°)`;
          destSel.value = "__custom__";
        } else {
          destSel.value = s.globalTargetId;
        }
      }

      setVal("sim-layer-sel", s.activeLayerId);
      setVal("sim-o2-inp", s.initialO2L > 0 ? s.initialO2L : "");
      setVal("sim-water-inp", s.initialWaterL > 0 ? s.initialWaterL : "");
      setVal("sim-energy-inp", s.initialEnergyKwh > 0 ? s.initialEnergyKwh : "");
      const prof = this.simEngine.getProfile(s.expeditionMode);
      const spInp = document.getElementById("sim-speed-inp");
      if (spInp) {
        spInp.min = String(prof.minSpeedKmH);
        spInp.max = String(prof.maxSpeedKmH);
        spInp.step = "0.1";
        spInp.value = String(s.targetSpeedKmH);
      }
      const spLbl = document.getElementById("sim-speed-readout");
      if (spLbl) spLbl.textContent = `${s.targetSpeedKmH} km/sa`;

      setChk("sim-acid-chk", s.filterAcidRain);
      setVal("sim-acid-int", s.acidIntensity);
      setChk("sim-storm-chk", s.filterDustStorm);
      setVal("sim-storm-int", s.stormIntensity);
      setChk("sim-rad-chk", s.showRadiationZones);

      document.querySelectorAll("[data-veh]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-veh") === s.expeditionMode));
      document.querySelectorAll("[data-view]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-view") === s.viewMode));
      document.querySelectorAll("[data-sim-speed]").forEach((b) => b.classList.toggle("active", Number(b.getAttribute("data-sim-speed")) === this.speedMult));
      document.getElementById("sim-btn-leak")?.classList.toggle("active", Boolean(s.o2LeakActive));
      document.getElementById("sim-btn-surge")?.classList.toggle("active", Boolean(s.stormSurgeActive));
    }

    bindControls() {
      document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => this.applyPreset(b.getAttribute("data-preset"), true)));
      document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
        this.state.viewMode = b.getAttribute("data-view");
        this.syncInputsFromState(); this.scheduleMapRender(true);
      }));
      document.querySelectorAll("[data-veh]").forEach((b) => b.addEventListener("click", () => {
        const mode = this.simEngine.normalizeMode(b.getAttribute("data-veh"));
        const prof = this.simEngine.getProfile(mode);
        this.state.expeditionMode = mode;
        this.state.targetSpeedKmH = prof.defaultSpeedKmH;
        this.syncInputsFromState();
        if (this.validateParamsGate(false).valid) this.recomputeRouteAndTimeline();
        else this.renderTelemetryAndChart();
      }));

      const bindNum = (id, key, routeNeeded = false) => {
        document.getElementById(id)?.addEventListener("input", (e) => {
          const parsed = this.budget ? this.budget.parsePositive(e.target.value) : (Number(e.target.value) > 0 ? Number(e.target.value) : null);
          this.state[key] = parsed;
          if (key === "targetSpeedKmH") {
            const lbl = document.getElementById("sim-speed-readout");
            if (lbl) lbl.textContent = `${this.state[key] || 0} km/sa`;
          }
          const check = this.validateParamsGate(false);
          if (!check.valid) {
            this.stopLoop();
            this.backendRoutes = null;
            this.simEngine.buildTimeline(null, this.state, this.getHazardBundle());
            this.renderTelemetryAndChart();
            this.scheduleMapRender(false);
            return;
          }
          if (!this.backendRoutes || routeNeeded) this.scheduleRouteRecalc();
          else this.rebuildTimelineOnly();
        });
      };
      bindNum("sim-o2-inp", "initialO2L", true);
      bindNum("sim-water-inp", "initialWaterL", false);
      bindNum("sim-energy-inp", "initialEnergyKwh", false);
      bindNum("sim-speed-inp", "targetSpeedKmH", false);

      document.getElementById("sim-origin-sel")?.addEventListener("change", (e) => {
        this.state.globalOriginId = e.target.value;
        this.state.useCustomCoordinates = false;
        this.syncSiteCoords();
        if (this.validateParamsGate(false).valid) this.recomputeRouteAndTimeline();
      });
      document.getElementById("sim-dest-sel")?.addEventListener("change", (e) => {
        if (e.target.value === "__custom__") return;
        this.state.globalTargetId = e.target.value;
        this.state.useCustomCoordinates = false;
        this.syncSiteCoords();
        if (this.validateParamsGate(false).valid) this.recomputeRouteAndTimeline();
      });
      document.getElementById("sim-layer-sel")?.addEventListener("change", (e) => {
        this.state.activeLayerId = e.target.value;
        this.scheduleMapRender(true);
      });

      const bindHaz = (id, key, isBool) => {
        document.getElementById(id)?.addEventListener("change", (e) => {
          this.state[key] = isBool ? e.target.checked : e.target.value;
          if (this.validateParamsGate(false).valid) this.recomputeRouteAndTimeline();
          else this.scheduleMapRender(false);
        });
      };
      bindHaz("sim-acid-chk", "filterAcidRain", true);
      bindHaz("sim-acid-int", "acidIntensity", false);
      bindHaz("sim-storm-chk", "filterDustStorm", true);
      bindHaz("sim-storm-int", "stormIntensity", false);
      bindHaz("sim-rad-chk", "showRadiationZones", true);

      document.getElementById("sim-btn-pick")?.addEventListener("click", (e) => {
        this.pickMode = !this.pickMode;
        e.currentTarget.classList.toggle("active", this.pickMode);
        if (this.canvas) this.canvas.style.cursor = this.pickMode ? "crosshair" : "grab";
      });
      document.getElementById("sim-btn-leak")?.addEventListener("click", () => {
        this.state.o2LeakActive = !this.state.o2LeakActive;
        this.syncInputsFromState();
        if (this.validateParamsGate(false).valid) this.rebuildTimelineOnly();
      });
      document.getElementById("sim-btn-surge")?.addEventListener("click", () => {
        this.state.stormSurgeActive = !this.state.stormSurgeActive;
        this.syncInputsFromState();
        if (this.validateParamsGate(false).valid) this.recomputeRouteAndTimeline();
        else this.scheduleMapRender(false);
      });

      document.getElementById("sim-btn-play")?.addEventListener("click", () => {
        if (!this.validateParamsGate(true).valid) { this.playing = false; this.syncPlayButton(); return; }
        if (this.progress >= 0.999) this.progress = 0;
        if (this.playing) this.stopLoop(); else this.startLoop();
      });
      document.getElementById("sim-btn-reset")?.addEventListener("click", () => {
        this.stopLoop(); this.progress = 0; this.renderTelemetryAndChart(); this.scheduleMapRender(false);
      });
      document.getElementById("sim-scrubber")?.addEventListener("input", (e) => {
        if (!this.validateParamsGate(true).valid) { e.target.value = "0"; this.progress = 0; return; }
        this.progress = Math.max(0, Math.min(1, Number(e.target.value) / 1000));
        this.renderTelemetryAndChart(); this.scheduleMapRender(false);
      });
      document.querySelectorAll("[data-sim-speed]").forEach((b) => b.addEventListener("click", () => {
        this.speedMult = Number(b.getAttribute("data-sim-speed")) || 20;
        this.syncInputsFromState();
      }));
    }

    scheduleRouteRecalc() {
      clearTimeout(this.routeTimer);
      if (!this.validateParamsGate(false).valid) return;
      this.routeTimer = setTimeout(() => this.recomputeRouteAndTimeline(), 180);
    }

    startLatencyMonitor() {
      clearInterval(this.latencyTimer);
      this.latencyTimer = setInterval(async () => {
        const h = await this.backendApi.testConnection(this.state.backendApiUrl || "");
        this.backendLatencyMs = h.ok ? h.latencyMs : null;
        this.updateLatencyUi();
      }, 5000);
    }

    updateLatencyUi() {
      const el = document.getElementById("sim-latency-pill");
      if (!el) return;
      el.textContent = typeof this.backendLatencyMs === "number" ? `🦀 ${this.backendLatencyMs} ms` : "🦀 Yerel A*";
    }

    bindCanvasEvents() {
      if (!this.canvas) return;
      this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      this.canvas.addEventListener("mousedown", (e) => {
        this.isDragging = true;
        this.isOrbit = (e.button === 2 || e.shiftKey) && this.state.viewMode === "3d";
        this.hasMoved = false; this.dragX = e.clientX; this.dragY = e.clientY;
      });
      window.addEventListener("mouseup", () => {
        if (!this.isDragging) return;
        this.isDragging = false; this.isOrbit = false; this.scheduleMapRender(true);
      });
      this.canvas.addEventListener("mousemove", (e) => {
        if (!this.isDragging) return;
        const dx = e.clientX - this.dragX, dy = e.clientY - this.dragY;
        if (dx * dx + dy * dy > 4) this.hasMoved = true;
        this.dragX = e.clientX; this.dragY = e.clientY;
        if (this.isOrbit) {
          this.state.camPitch = Math.max(0, Math.min(68, this.state.camPitch - dy * 0.25));
          this.state.camYaw = (this.state.camYaw + dx * 0.3 + 360) % 360;
        } else {
          const { stepLon, stepLat } = this.routePlanner.geo.computePanStep(dx, dy, this.viewW, this.viewH, this.state);
          this.state.rotLon = this.simEngine.geo.wrapLon(this.state.rotLon + stepLon);
          this.state.rotLat = Math.max(-78, Math.min(78, this.state.rotLat + stepLat));
        }
        this.scheduleMapRender(false);
      });
      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const geo = this.routePlanner.geo;
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const nextZoom = geo.computeWheelTargetZoom(this.state.zoom, e.deltaY, e.deltaMode, this.state.viewMode);
        const relief = this.state.enable3DTerrain === false ? 0 : (this.state.topoReliefScale ?? 1.0);
        const nextCam = geo.computeZoomToPoint({
          px, py, width: this.viewW, height: this.viewH,
          viewMode: this.state.viewMode, rotLat: this.state.rotLat, rotLon: this.state.rotLon,
          zoom: this.state.zoom, nextZoom, camPitch: this.state.camPitch, camYaw: this.state.camYaw,
          reliefScale: relief
        });
        this.state.rotLat = nextCam.rotLat;
        this.state.rotLon = nextCam.rotLon;
        this.state.zoom = nextCam.zoom;
        this.scheduleMapRender(true);
      }, { passive: false });
      this.canvas.addEventListener("click", (e) => {
        if (this.hasMoved || !this.pickMode) return;
        const rect = this.canvas.getBoundingClientRect();
        const px = e.clientX - rect.left, py = e.clientY - rect.top;
        const geo = this.state.viewMode === "3d"
          ? this.routePlanner.geo.screenToMarsCoords3D(px, py, this.viewW, this.viewH, this.state.rotLat, this.state.rotLon, this.state.zoom, this.state.camPitch, this.state.camYaw, 1.0)
          : this.routePlanner.geo.screenToMarsCoords2D(px, py, this.viewW, this.viewH, this.state.rotLat, this.state.rotLon, this.state.zoom);
        if (!geo.insideMap) return;
        this.pickMode = false;
        document.getElementById("sim-btn-pick")?.classList.remove("active");
        this.canvas.style.cursor = "grab";
        this.state.customDestination = { id: "picked-sim", name: "Seçilen Hedef", lat: geo.lat, lon: geo.lon };
        this.state.useCustomCoordinates = true;
        this.syncInputsFromState();
        if (this.validateParamsGate(true).valid) this.recomputeRouteAndTimeline();
      });
      window.addEventListener("resize", () => { this.resizeCanvas(); this.scheduleMapRender(true); });
    }

    resizeCanvas() {
      if (!this.canvas) return;
      const r = this.canvas.getBoundingClientRect();
      this.viewW = Math.max(320, Math.round(r.width || window.innerWidth));
      this.viewH = Math.max(240, Math.round(r.height || window.innerHeight));
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.round(this.viewW * this.dpr);
      this.canvas.height = Math.round(this.viewH * this.dpr);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const studio = new DemoStudioController();
    studio.init();
    window.__astroChiefDemoStudio = studio;
  });

  ns.DemoStudioController = DemoStudioController;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc /demo ortak Rover+Insan sefer ve hayatta kalma studyosu denetleyicisi.
   - Satir 17-79: constructor; 3D/2D harita motorlari, MissionBudgetHelper, Rust WASM/HTTP istemcisi ve bos baslayan parametre kapisi state'i.
   - Satir 81-202: init, presets, validateParamsGate ve applyGateUi; zorunlu O2/Batarya/Su girilmeden rota ve yolculugu kilitleyen kapi mekanizmasi.
   - Satir 204-316: applyPreset, recomputeRouteAndTimeline ve rebuildTimelineOnly; Ortak Rover+Insan sefer rotasi ve zaman serisi hesabi.
   - Satir 318-420: startLoop, _runLoopRaf, drawMap ve requestTiles; canli Rover+Ekip / Rover+Yaya EVA cizimi ile 2D/3D harita guncellemesi.
   - Satir 422-558: renderTelemetryAndChart ve syncInputsFromState; varis ozeti (dk, sa, km/sa, m/dk, %O2, %Enerji, Walkback) ve grafik akisi.
   - Satir 560-765: bindControls, startLatencyMonitor, bindCanvasEvents ve resizeCanvas; parametre olaylari, 5 sn Rust ping, surukleme ve tekerlek zoom kontrolu.
   ========================================================================== */
