/**
 * @file DemoStudioController.js
 * @description /demo Mars Hayatta Kalma & Rota Simulasyon Studyosu ana denetleyicisi.
 * On gorev parametreleri (O2, Su, Batarya, Hiz, Insan/Rover), canli cevresel etken enjeksiyonu,
 * 2D/3D MOLA harita simulasyonu, Rust WASM/HTTP A* rota ve canli grafik/log akisini yonetir.
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
        viewMode: "3d",
        activeLayerId: "mars-viking-mdim21",
        activeCraterId: "gale-crater",
        routeScope: "global",
        globalOriginId: "curiosity-gale",
        globalTargetId: "insight-elysium",
        useCustomCoordinates: false,
        customOrigin: { id: "curiosity-gale", name: "Gale (Curiosity)", lat: -4.5895, lon: 137.4417 },
        customDestination: { id: "insight-elysium", name: "Elysium (InSight)", lat: 4.5024, lon: 135.6234 },
        backendApiUrl: this.backendApi.resolveInitialUrl("http://127.0.0.1:8080"),
        filterAcidRain: true,
        acidIntensity: "orta",
        filterDustStorm: true,
        stormIntensity: "orta",
        showRadiationZones: true,
        showRouteComments: true,
        showNomenclature: true,
        showGraticule: false,
        progressiveLodRender: true,
        highQualityGlobeRay: false,
        enable3DTerrain: true,
        topoReliefScale: 1.0,
        rotLat: 0.5,
        rotLon: 136.0,
        zoom: 1.65,
        camPitch: 32,
        camYaw: 0,
        vehicleType: "rover",
        initialO2L: 420,
        initialWaterL: 24.0,
        initialEnergyKwh: 65.0,
        targetSpeedKmH: 14.5,
        o2LeakActive: false,
        stormSurgeActive: false
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
      this.syncInputsFromState();
      this.startLatencyMonitor();
      await this.recomputeRouteAndTimeline();
      this.applyPreset("gale-elysium-rover", true);
    }

    presets() {
      return {
        "gale-elysium-rover": {
          viewMode: "3d", activeLayerId: "mars-viking-mdim21",
          globalOriginId: "curiosity-gale", globalTargetId: "insight-elysium", useCustomCoordinates: false,
          vehicleType: "rover", initialO2L: 420, initialWaterL: 24, initialEnergyKwh: 65, targetSpeedKmH: 14.5,
          filterAcidRain: true, acidIntensity: "orta", filterDustStorm: true, stormIntensity: "orta",
          showRadiationZones: true, o2LeakActive: false, stormSurgeActive: false,
          rotLat: 0.5, rotLon: 136.0, zoom: 1.85, camPitch: 34, speedMult: 20
        },
        "gale-eva-walk": {
          viewMode: "3d", activeLayerId: "mars-mola-elevation",
          globalOriginId: "curiosity-gale", useCustomCoordinates: true,
          customDestination: { id: "mount-sharp", name: "Aeolis Mons (Mount Sharp)", lat: -5.08, lon: 137.85 },
          vehicleType: "eva", initialO2L: 420, initialWaterL: 12, initialEnergyKwh: 1.5, targetSpeedKmH: 3.6,
          filterAcidRain: true, acidIntensity: "hafif", filterDustStorm: false, stormIntensity: "hafif",
          showRadiationZones: true, o2LeakActive: false, stormSurgeActive: false,
          rotLat: -4.8, rotLon: 137.6, zoom: 5.5, camPitch: 48, speedMult: 5
        },
        "storm-jezero-stress": {
          viewMode: "3d", activeLayerId: "mars-themis-day-ir",
          globalOriginId: "curiosity-gale", globalTargetId: "perseverance-jezero", useCustomCoordinates: false,
          vehicleType: "rover", initialO2L: 420, initialWaterL: 24, initialEnergyKwh: 55, targetSpeedKmH: 12.0,
          filterAcidRain: true, acidIntensity: "siddetli", filterDustStorm: true, stormIntensity: "siddetli",
          showRadiationZones: true, o2LeakActive: false, stormSurgeActive: true,
          rotLat: 6.5, rotLon: 108.0, zoom: 1.25, camPitch: 28, speedMult: 60
        },
        "robotic-perseverance": {
          viewMode: "2d", activeLayerId: "mars-viking-mdim21",
          globalOriginId: "perseverance-jezero", globalTargetId: "insight-elysium", useCustomCoordinates: false,
          vehicleType: "robot", initialO2L: 0, initialWaterL: 0, initialEnergyKwh: 2.2, targetSpeedKmH: 0.15,
          filterAcidRain: true, acidIntensity: "orta", filterDustStorm: true, stormIntensity: "orta",
          showRadiationZones: true, o2LeakActive: false, stormSurgeActive: false,
          rotLat: 11.0, rotLon: 106.0, zoom: 1.75, camPitch: 0, speedMult: 240
        }
      };
    }

    applyPreset(id, autoPlay = true) {
      const p = this.presets()[id];
      if (!p) return;
      Object.assign(this.state, p);
      if (p.speedMult) this.speedMult = p.speedMult;
      this.syncSiteCoords();
      this.syncInputsFromState();
      this.progress = 0;
      this.playing = Boolean(autoPlay);
      this.recomputeRouteAndTimeline().then(() => {
        if (this.playing) this.startLoop();
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
      const seq = ++this.requestSeq;
      const hz = this.getHazardBundle();
      const activeCrater = CRATERS_DATA[0];
      const payload = this.backendApi.buildRouteRequestPayload({
        scope: "global",
        origin: this.state.customOrigin,
        destination: this.state.customDestination,
        state: {
          ...this.state,
          oxygenReserveLiters: this.state.initialO2L,
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
          { ...this.state, hazardBundle: hz }
        );
      }

      this.simEngine.buildTimeline(this.backendRoutes, this.state, hz);
      this.updateLatencyUi();
      this.renderTelemetryAndChart();
      this.scheduleMapRender(true);
    }

    rebuildTimelineOnly() {
      const hz = this.getHazardBundle();
      this.simEngine.buildTimeline(this.backendRoutes, this.state, hz);
      this.renderTelemetryAndChart();
      this.scheduleMapRender(false);
    }

    startLoop() {
      if (this.playRafId) return;
      this.lastTickMs = performance.now();
      const tick = (now) => {
        if (!this.playing) { this.playRafId = null; return; }
        const dtSec = Math.min(0.1, Math.max(0.001, (now - this.lastTickMs) / 1000));
        this.lastTickMs = now;
        this.pulsePhase = (this.pulsePhase + dtSec * 3.4) % (Math.PI * 2);

        const totalHours = Math.max(0.08, this.simEngine.summary?.totalHours || 4.0);
        const totalSimSec = totalHours * 3600;
        // 1x = gercek saat * 60 veya kullanicinin sectigi hiz carpanina gore akici ilerleme
        const stepProgress = (dtSec * this.speedMult * 12) / totalSimSec;
        this.progress = Math.min(1, this.progress + stepProgress);

        const cur = this.simEngine.sampleAt(this.progress);
        if (cur && ((this.state.vehicleType !== "robot" && cur.remO2L <= 0.05) || cur.remEnergyKwh <= 0.01)) {
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

    computeUiAvoidRects() {
      if (!this.canvas || typeof document === "undefined") return [];
      const cr = this.canvas.getBoundingClientRect();
      const rects = [];
      for (const sel of [".sim-left-card", ".sim-right-card", ".sim-transport-bar"]) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const b = el.getBoundingClientRect();
        if (b.width <= 0 || b.height <= 0) continue;
        rects.push({ x: b.left - cr.left, y: b.top - cr.top, w: b.width, h: b.height });
      }
      return rects;
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
      const cur = this.simEngine.sampleAt(this.progress);
      const pts = this.backendRoutes?.primaryBlue?.points || [];
      const segIdx = cur ? Math.min(Math.max(0, Math.floor(this.progress * Math.max(0, pts.length - 1))), Math.max(0, pts.length - 2)) : 0;
      const demoSim = cur ? {
        active: true, ready: true, playing: this.playing,
        vehicle: s.vehicleType === "eva" ? "astronaut" : "rover",
        progress: this.progress, progressPct: Math.round(this.progress * 100),
        lat: cur.lat, lon: cur.lon, segIdx, pulsePhase: this.pulsePhase,
        traveledKm: cur.km, totalKm: this.simEngine.summary.totalKm,
        elevM: cur.elevM, remainingO2L: Math.round(cur.remO2L)
      } : null;

      const payload = {
        width: this.viewW, height: this.viewH, dpr: this.dpr,
        rotLat: s.rotLat, rotLon: s.rotLon, zoom: s.zoom, activeLayerId: s.activeLayerId,
        camPitch: s.camPitch, camYaw: s.camYaw, topoReliefScale: 1.0, enable3DTerrain: true,
        isDragging: this.isDragging, isInteracting: this.isDragging,
        craters: CRATERS_DATA, landingSites: this.landingSites, activeCrater: CRATERS_DATA[0],
        hazardBundle: this.getHazardBundle(), craterRadZones: [],
        computedRoutes: this.backendRoutes, craterWaypoints: [], selectedWaypoint: null,
        customOrigin: s.customOrigin, customDestination: s.customDestination,
        progressiveLodRender: true, showGraticule: s.showGraticule,
        showNomenclature: s.showNomenclature, showRadiationZones: s.showRadiationZones,
        showRouteComments: s.showRouteComments, routeScope: "global", highQualityGlobeRay: false,
        demoSim,
        uiAvoidRects: this.computeUiAvoidRects()
      };

      if (s.viewMode === "3d") this.renderer3D.render(this.ctx, payload);
      else this.renderer2D.render(this.ctx, payload);
    }

    renderTelemetryAndChart() {
      const cur = this.simEngine.sampleAt(this.progress);
      const sum = this.simEngine.summary;
      const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      const setBar = (id, pct, warn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
        el.classList.toggle("warn", Boolean(warn));
      };

      if (cur) {
        const h = Math.floor(cur.hours);
        const m = Math.round((cur.hours - h) * 60);
        setTxt("sim-time-val", `${h} sa ${m} dk`);
        setTxt("sim-dist-val", `${cur.km.toFixed(1)} / ${sum.totalKm.toFixed(1)} km`);
        setTxt("sim-speed-val", `${cur.speedKmH} km/sa (${cur.speedMPerMin} m/dk)`);
        setTxt("sim-elev-val", `${cur.elevM >= 0 ? "+" : ""}${cur.elevM} m (${cur.slopeDeg}°)`);
        setTxt("sim-o2-val", `${cur.remO2L.toFixed(0)} L (${cur.o2Pct}%) · ${cur.o2RateLPerMin} L/dk`);
        setTxt("sim-water-val", `${cur.remWaterL.toFixed(1)} L (${cur.waterPct}%)`);
        setTxt("sim-energy-val", `${cur.remEnergyKwh.toFixed(2)} kWh (${cur.energyPct}%) · ${cur.powerKw} kW`);
        setTxt("sim-co2-rad-val", `CO₂: ${cur.cumCo2L} L · Doz: ${cur.cumRadMsv.toFixed(2)} mSv`);
        setBar("sim-o2-bar", cur.o2Pct, this.state.vehicleType !== "robot" && cur.o2Pct <= 20);
        setBar("sim-water-bar", cur.waterPct, cur.waterPct <= 15);
        setBar("sim-energy-bar", cur.energyPct, cur.energyPct <= 15);

        const scrubber = document.getElementById("sim-scrubber");
        if (scrubber) scrubber.value = String(Math.round(this.progress * 1000));
        setTxt("sim-pct-pill", `${Math.round(this.progress * 100)}%`);
      }

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
      const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = String(v); };
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
      setVal("sim-o2-inp", s.initialO2L);
      setVal("sim-water-inp", s.initialWaterL);
      setVal("sim-energy-inp", s.initialEnergyKwh);
      const prof = this.simEngine.getProfile(s.vehicleType);
      const spInp = document.getElementById("sim-speed-inp");
      if (spInp) {
        spInp.min = String(prof.minSpeedKmH);
        spInp.max = String(prof.maxSpeedKmH);
        spInp.step = prof.id === "robot" ? "0.01" : "0.1";
        spInp.value = String(s.targetSpeedKmH);
      }
      const spLbl = document.getElementById("sim-speed-readout");
      if (spLbl) spLbl.textContent = `${s.targetSpeedKmH} km/sa`;

      setChk("sim-acid-chk", s.filterAcidRain);
      setVal("sim-acid-int", s.acidIntensity);
      setChk("sim-storm-chk", s.filterDustStorm);
      setVal("sim-storm-int", s.stormIntensity);
      setChk("sim-rad-chk", s.showRadiationZones);

      document.querySelectorAll("[data-veh]").forEach((b) => b.classList.toggle("active", b.getAttribute("data-veh") === s.vehicleType));
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
        const vt = b.getAttribute("data-veh");
        const prof = this.simEngine.getProfile(vt);
        this.state.vehicleType = vt;
        this.state.targetSpeedKmH = prof.defaultSpeedKmH;
        this.state.initialEnergyKwh = prof.defaultEnergyKwh;
        if (vt === "robot") { this.state.initialO2L = 0; this.state.initialWaterL = 0; }
        else if (this.state.initialO2L === 0) { this.state.initialO2L = 420; this.state.initialWaterL = vt === "eva" ? 12 : 24; }
        this.syncInputsFromState(); this.rebuildTimelineOnly();
      }));

      const bindNum = (id, key, routeNeeded = false) => {
        document.getElementById(id)?.addEventListener("input", (e) => {
          this.state[key] = Math.max(0, Number(e.target.value) || 0);
          if (key === "targetSpeedKmH") {
            const lbl = document.getElementById("sim-speed-readout");
            if (lbl) lbl.textContent = `${this.state[key]} km/sa`;
          }
          if (routeNeeded) this.scheduleRouteRecalc();
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
        this.syncSiteCoords(); this.recomputeRouteAndTimeline();
      });
      document.getElementById("sim-dest-sel")?.addEventListener("change", (e) => {
        if (e.target.value === "__custom__") return;
        this.state.globalTargetId = e.target.value;
        this.state.useCustomCoordinates = false;
        this.syncSiteCoords(); this.recomputeRouteAndTimeline();
      });
      document.getElementById("sim-layer-sel")?.addEventListener("change", (e) => {
        this.state.activeLayerId = e.target.value;
        this.scheduleMapRender(true);
      });

      const bindHaz = (id, key, isBool) => {
        document.getElementById(id)?.addEventListener("change", (e) => {
          this.state[key] = isBool ? e.target.checked : e.target.value;
          this.recomputeRouteAndTimeline();
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
        this.syncInputsFromState(); this.rebuildTimelineOnly();
      });
      document.getElementById("sim-btn-surge")?.addEventListener("click", () => {
        this.state.stormSurgeActive = !this.state.stormSurgeActive;
        this.syncInputsFromState(); this.recomputeRouteAndTimeline();
      });

      document.getElementById("sim-btn-play")?.addEventListener("click", () => {
        if (this.progress >= 0.999) this.progress = 0;
        if (this.playing) this.stopLoop(); else this.startLoop();
      });
      document.getElementById("sim-btn-reset")?.addEventListener("click", () => {
        this.stopLoop(); this.progress = 0; this.renderTelemetryAndChart(); this.scheduleMapRender(false);
      });
      document.getElementById("sim-scrubber")?.addEventListener("input", (e) => {
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
        this.recomputeRouteAndTimeline();
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
   - Satir 1-6: JSDoc /demo Mars hayatta kalma ve rota simulasyon studyosu denetleyicisi.
   - Satir 15-82: constructor; 3D/2D harita motorlari, Rust WASM/HTTP istemcisi, fizik motoru ve varsayilan parametreler.
   - Satir 84-165: init, presets, applyPreset ve syncSiteCoords; hazir senaryolari ve baslangic verilerini yukler.
   - Satir 167-236: getHazardBundle, recomputeRouteAndTimeline ve rebuildTimelineOnly; Rust WASM A* rota ile zaman serisi simulasyonunu hesaplar.
   - Satir 238-340: startLoop, stopLoop, requestTiles, computeUiAvoidRects (HUD cakisma onleme) ve drawMap; canli Rover/EVA ilerlemesi ile 2D/3D haritayi cizer.
   - Satir 342-425: renderTelemetryAndChart, renderEventLog ve syncInputsFromState; O2/Su/Batarya/Radyasyon gostergelerini ve grafigi gunceller.
   - Satir 427-656: bindControls, startLatencyMonitor ve bindCanvasEvents; kontroller, 5 sn ping, surukleme (computePanStep) ve imlece odakli tekerlek zoom.
   ========================================================================== */
