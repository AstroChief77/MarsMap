/**
 * @file DemoScenarioService.js
 * @description NASA Space Apps 2026 juri sunumu icin rehberli demo senaryolarini,
 * rota uzerinde animasyonlu Rover/EVA Astronot simulasyonunu ve canli O2/rakim telemetrisini yonetir.
 */

(function (ns) {
  "use strict";

  class DemoScenarioService {
    /**
     * DemoScenarioService yapici metodu
     * @param {Object} adapter - Kontrolcu baglanti arayuzu
     */
    constructor(adapter) {
      this.adapter = adapter;
      this.geo = ns.RouteGeometryHelper ? new ns.RouteGeometryHelper() : null;
      this.active = false;
      this.collapsed = false;
      this.playing = false;
      this.autoTour = true;
      this.scenarioIdx = 0;
      this.vehicle = "rover";
      this.speedMult = 1;
      this.progress = 0;
      this.pulsePhase = 0;
      this.rafId = null;
      this.lastTickMs = 0;
      this.autoAdvanceTimer = null;
      this.lastUiSyncMs = 0;
      this.scenarios = this.buildScenarios();
    }

    /** Hazir juri sunum senaryolarini dondurur */
    buildScenarios() {
      return [
        {
          id: "gale-jezero-nominal",
          titleKey: "demoScen1Title",
          cueKey: "demoScen1Cue",
          vehicle: "rover",
          autoSeconds: 13,
          cycleDurationSec: 11,
          camera: { lat: 6.5, lon: 108.0, zoom: 1.22, pitch: 28 },
          patch: {
            viewMode: "3d",
            activeLayerId: "mars-viking-mdim21",
            activeCraterId: "gale-crater",
            routeScope: "global",
            globalOriginId: "curiosity-gale",
            globalTargetId: "perseverance-jezero",
            useCustomCoordinates: false,
            filterAcidRain: true,
            acidIntensity: "orta",
            filterDustStorm: true,
            stormIntensity: "orta",
            showRadiationZones: true,
            showRouteComments: true,
            inspectorOpen: true
          }
        },
        {
          id: "severe-storm-detour",
          titleKey: "demoScen2Title",
          cueKey: "demoScen2Cue",
          vehicle: "rover",
          autoSeconds: 13,
          cycleDurationSec: 12,
          camera: { lat: 6.0, lon: 68.0, zoom: 1.08, pitch: 32 },
          patch: {
            viewMode: "3d",
            activeLayerId: "mars-themis-day-ir",
            activeCraterId: "gale-crater",
            routeScope: "global",
            globalOriginId: "curiosity-gale",
            globalTargetId: "opportunity-meridiani",
            useCustomCoordinates: false,
            filterAcidRain: true,
            acidIntensity: "siddetli",
            filterDustStorm: true,
            stormIntensity: "siddetli",
            showRadiationZones: true,
            showRouteComments: true,
            inspectorOpen: true
          }
        },
        {
          id: "gale-mola-eva",
          titleKey: "demoScen3Title",
          cueKey: "demoScen3Cue",
          vehicle: "astronaut",
          autoSeconds: 13,
          cycleDurationSec: 10,
          camera: { lat: -0.2, lon: 136.5, zoom: 3.4, pitch: 46 },
          patch: {
            viewMode: "3d",
            activeLayerId: "mars-mola-elevation",
            activeCraterId: "gale-crater",
            routeScope: "global",
            globalOriginId: "curiosity-gale",
            globalTargetId: "insight-elysium",
            useCustomCoordinates: false,
            filterAcidRain: true,
            acidIntensity: "hafif",
            filterDustStorm: false,
            stormIntensity: "hafif",
            showRadiationZones: true,
            showRouteComments: true,
            inspectorOpen: true
          }
        },
        {
          id: "hybrid-2d-tiles",
          titleKey: "demoScen4Title",
          cueKey: "demoScen4Cue",
          vehicle: "rover",
          autoSeconds: 12,
          cycleDurationSec: 10,
          camera: { lat: 10.0, lon: 108.0, zoom: 1.85, pitch: 28 },
          patch: {
            viewMode: "2d",
            activeLayerId: "mars-viking-mdim21",
            activeCraterId: "jezero-crater",
            routeScope: "global",
            globalOriginId: "curiosity-gale",
            globalTargetId: "perseverance-jezero",
            useCustomCoordinates: false,
            filterAcidRain: true,
            acidIntensity: "orta",
            filterDustStorm: true,
            stormIntensity: "orta",
            showRadiationZones: true,
            showRouteComments: true,
            inspectorOpen: true
          }
        }
      ];
    }

    t(key, vars = {}) {
      return ns.i18n ? ns.i18n.t(key, vars) : key;
    }

    toggleDemo() {
      if (this.active) this.stopDemo();
      else this.startDemo();
    }

    startDemo(idx = 0) {
      this.active = true;
      this.collapsed = false;
      this.selectScenario(idx, true);
      this.adapter.showToast?.(this.t("demoToastStarted"));
    }

    stopDemo() {
      this.resetSilent();
      this.adapter.renderUi?.();
      this.adapter.scheduleRender?.(false);
      this.adapter.showToast?.(this.t("demoToastStopped"));
    }

    resetSilent() {
      this.active = false;
      this.playing = false;
      this.stopLoop();
      clearTimeout(this.autoAdvanceTimer);
    }

    toggleCollapsed() {
      this.collapsed = !this.collapsed;
      this.adapter.renderDemoBar?.();
    }

    toggleAutoTour() {
      this.autoTour = !this.autoTour;
      this.scheduleAutoAdvance();
      this.adapter.renderDemoBar?.();
    }

    setSpeed(mult) {
      const allowed = [1, 2, 5, 10];
      this.speedMult = allowed.includes(Number(mult)) ? Number(mult) : 1;
      this.adapter.renderDemoBar?.();
    }

    setVehicle(kind) {
      this.vehicle = kind === "astronaut" ? "astronaut" : "rover";
      this.adapter.renderDemoBar?.();
      this.adapter.scheduleRender?.(false);
    }

    setProgress(p) {
      this.progress = Math.max(0, Math.min(1, Number(p) || 0));
      this.adapter.renderDemoBar?.();
      this.adapter.scheduleRender?.(false);
    }

    togglePlay() {
      if (!this.active) this.active = true;
      if (this.progress >= 0.999) this.progress = 0;
      this.playing = !this.playing;
      if (this.playing) this.startLoop();
      else this.stopLoop();
      this.scheduleAutoAdvance();
      this.adapter.renderDemoBar?.();
    }

    restart() {
      this.progress = 0;
      this.playing = true;
      this.startLoop();
      this.scheduleAutoAdvance();
      this.adapter.renderDemoBar?.();
      this.adapter.scheduleRender?.(false);
    }

    nextScenario() {
      this.selectScenario((this.scenarioIdx + 1) % this.scenarios.length, true);
    }

    prevScenario() {
      this.selectScenario((this.scenarioIdx - 1 + this.scenarios.length) % this.scenarios.length, true);
    }

    selectScenario(idx, autoPlay = true) {
      const safeIdx = Math.max(0, Math.min(this.scenarios.length - 1, Number(idx) || 0));
      this.scenarioIdx = safeIdx;
      const scen = this.scenarios[safeIdx];
      this.vehicle = scen.vehicle || "rover";
      this.progress = 0;
      this.playing = Boolean(autoPlay);

      this.adapter.applyDemoScenario?.(scen);
      if (this.playing) this.startLoop();
      else this.stopLoop();
      this.scheduleAutoAdvance();
      this.adapter.renderDemoBar?.();
    }

    scheduleAutoAdvance() {
      clearTimeout(this.autoAdvanceTimer);
      if (!this.active || !this.autoTour || !this.playing) return;
      const scen = this.scenarios[this.scenarioIdx];
      const ms = Math.max(6000, (scen?.autoSeconds || 12) * 1000);
      this.autoAdvanceTimer = setTimeout(() => {
        if (this.active && this.autoTour && this.playing) {
          this.nextScenario();
        }
      }, ms);
    }

    startLoop() {
      if (this.rafId) return;
      this.lastTickMs = performance.now();
      const tick = (now) => {
        if (!this.active || !this.playing) {
          this.rafId = null;
          return;
        }
        const dt = Math.min(0.1, Math.max(0.001, (now - this.lastTickMs) / 1000));
        this.lastTickMs = now;
        const scen = this.scenarios[this.scenarioIdx];
        const cycleSec = Math.max(4, scen?.cycleDurationSec || 10);
        this.progress = Math.min(1, this.progress + (dt * this.speedMult) / cycleSec);
        this.pulsePhase = (this.pulsePhase + dt * 3.2) % (Math.PI * 2);

        if (this.progress >= 1 && !this.autoTour) {
          this.playing = false;
          this.rafId = null;
          this.adapter.renderDemoBar?.();
          this.adapter.scheduleRender?.(false);
          return;
        }

        this.adapter.scheduleRender?.(false);
        if (now - this.lastUiSyncMs >= 120) {
          this.lastUiSyncMs = now;
          this.adapter.updateDemoTelemetry?.(this.getRenderPayload());
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    stopLoop() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    /** Rota noktalarini Mars haversine mesafesiyle orantili enterpole eder */
    samplePointAtProgress(points, progress) {
      if (!Array.isArray(points) || points.length === 0) return null;
      if (points.length === 1) return { lat: points[0].lat, lon: points[0].lon, segIdx: 0, segT: 0, headingRad: 0 };

      const segLens = [];
      let total = 0;
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const d = this.geo
          ? this.geo.haversineMarsKm(a.lat, a.lon, b.lat, b.lon)
          : Math.hypot(b.lat - a.lat, b.lon - a.lon);
        const len = Math.max(0.0001, d);
        segLens.push(len);
        total += len;
      }

      const target = Math.max(0, Math.min(1, progress)) * total;
      let acc = 0;
      for (let i = 0; i < segLens.length; i++) {
        const len = segLens[i];
        if (acc + len >= target || i === segLens.length - 1) {
          const t = Math.max(0, Math.min(1, (target - acc) / len));
          const a = points[i];
          const b = points[i + 1];
          const dLon = this.geo ? this.geo.shortestDeltaLon(a.lon, b.lon) : (b.lon - a.lon);
          const dLat = b.lat - a.lat;
          const lat = a.lat + dLat * t;
          const lon = this.geo ? this.geo.wrapLon(a.lon + dLon * t) : (a.lon + dLon * t);
          return { lat, lon, segIdx: i, segT: t, headingRad: Math.atan2(dLat, dLon) };
        }
        acc += len;
      }
      const last = points[points.length - 1];
      return { lat: last.lat, lon: last.lon, segIdx: points.length - 2, segT: 1, headingRad: 0 };
    }

    /** Harita cizimi ve Demo HUD icin canli arac konum + telemetri yukunu dondurur */
    getRenderPayload() {
      if (!this.active) return null;
      const routes = this.adapter.getRoutes?.();
      const pri = routes?.primaryBlue;
      const pts = pri?.points;
      const state = this.adapter.getState?.() || {};
      const o2Max = Number(state.oxygenReserveLiters || 420);
      const speedKmH = this.vehicle === "astronaut" ? 3.6 : 14.5;
      const o2RateLPerMin = this.vehicle === "astronaut" ? 1.01 : 0.55;

      if (!Array.isArray(pts) || pts.length < 2) {
        return {
          active: true, ready: false, playing: this.playing, vehicle: this.vehicle,
          progress: this.progress, progressPct: Math.round(this.progress * 100),
          traveledKm: 0, totalKm: 0, elevM: 0, remainingO2L: o2Max, speedKmH, pulsePhase: this.pulsePhase
        };
      }

      const pos = this.samplePointAtProgress(pts, this.progress);
      const totalKm = Number(pri.totalKm || 0);
      const traveledKm = totalKm * this.progress;
      const elapsedMin = (traveledKm / Math.max(0.5, speedKmH)) * 60;
      const usedO2 = elapsedMin * o2RateLPerMin;
      const remainingO2L = Math.max(0, Math.round(o2Max - usedO2));
      const topo = ns.marsTopo;
      const elevM = (pos && topo && topo.getElevationMeters) ? Math.round(topo.getElevationMeters(pos.lat, pos.lon)) : 0;

      return {
        active: true,
        ready: Boolean(pos),
        playing: this.playing,
        vehicle: this.vehicle,
        progress: this.progress,
        progressPct: Math.round(this.progress * 100),
        lat: pos ? pos.lat : 0,
        lon: pos ? pos.lon : 0,
        segIdx: pos ? pos.segIdx : 0,
        headingRad: pos ? pos.headingRad : 0,
        pulsePhase: this.pulsePhase,
        traveledKm: Number(traveledKm.toFixed(1)),
        totalKm: Number(totalKm.toFixed(1)),
        elevM,
        remainingO2L,
        o2Max,
        speedKmH
      };
    }

    getUiState() {
      return {
        active: this.active,
        collapsed: this.collapsed,
        playing: this.playing,
        autoTour: this.autoTour,
        scenarioIdx: this.scenarioIdx,
        scenarios: this.scenarios,
        vehicle: this.vehicle,
        speedMult: this.speedMult,
        progress: this.progress,
        telemetry: this.getRenderPayload()
      };
    }

    /** Kontrolcubuk + servisi tek adimda baglar (MarsNavigatorController <800 satir kurali icin) */
    static attach(mountEl, adapter) {
      let bar = null;
      const service = new DemoScenarioService({
        ...adapter,
        renderDemoBar: () => bar?.render(service.getUiState()),
        updateDemoTelemetry: (tele) => bar?.updateLiveTelemetry(tele)
      });
      if (ns.DemoControlBar && mountEl) {
        bar = new ns.DemoControlBar(mountEl, {
          onClose: () => service.stopDemo(), onToggleCollapse: () => service.toggleCollapsed(),
          onToggleAutoTour: () => service.toggleAutoTour(), onTogglePlay: () => service.togglePlay(),
          onRestart: () => service.restart(), onPrev: () => service.prevScenario(),
          onNext: () => service.nextScenario(), onSelectScenario: (i) => service.selectScenario(i, true),
          onSetSpeed: (s) => service.setSpeed(s), onSetVehicle: (v) => service.setVehicle(v),
          onScrub: (p) => service.setProgress(p)
        });
      }
      return { service, bar };
    }
  }

  ns.DemoScenarioService = DemoScenarioService;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc rehberli demo modu ve animasyonlu rover/astronot servis tanimi.
   - Satir 14-31: constructor; senaryolar, oynatma durumu ve rAF dongu referanslarini kurar.
   - Satir 33-122: buildScenarios; 4 adet juri sunum senaryosunu (Gale->Jezero, Siddetli Firtina, Gale 3D MOLA, 2D Karo) tanimlar.
   - Satir 124-224: toggleDemo, startDemo, stopDemo, selectScenario, togglePlay, setSpeed ve autoTour zamanlayici metodlari.
   - Satir 226-260: startLoop ve stopLoop; animasyon karesi (rAF) boyunca arac ilerlemesini gunceller.
   - Satir 262-336: samplePointAtProgress, getRenderPayload ve getUiState; gercek Mars mesafesiyle konum, MOLA rakim ve kalan O2 hesaplar.
   ========================================================================== */
