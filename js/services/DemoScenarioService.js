/**
 * @file DemoScenarioService.js
 * @description NASA Space Apps 2026 rehberli ortak sefer simulasyonu ve animasyonlu
 * Rover+Ekip / Rover+Yaya EVA hareket servisi (on-gorev parametre kapisi ile korunur).
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
      this.budget = ns.MissionBudgetHelper ? new ns.MissionBudgetHelper() : null;
      this.active = false;
      this.collapsed = false;
      this.playing = false;
      this.autoTour = true;
      this.scenarioIdx = 0;
      this.expeditionMode = "rover-crew";
      this.speedMult = 1;
      this.progress = 0;
      this.pulsePhase = 0;
      this.rafId = null;
      this.lastTickMs = 0;
      this.autoAdvanceTimer = null;
      this.lastUiSyncMs = 0;
      this.scenarios = this.buildScenarios();
    }

    /** Hazir ortak sefer senaryolarini dondurur (Rover ve Insan daima birlikte ilerler) */
    buildScenarios() {
      return [
        {
          id: "gale-jezero-nominal",
          titleKey: "demoScen1Title",
          cueKey: "demoScen1Cue",
          expeditionMode: "rover-crew",
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
          expeditionMode: "rover-crew",
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
          expeditionMode: "joint-eva-escort",
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
          expeditionMode: "rover-crew",
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

    checkGate(openPanel = true) {
      if (this.adapter.ensureMissionParamsReady && !this.adapter.ensureMissionParamsReady(openPanel)) {
        return false;
      }
      return true;
    }

    toggleDemo() {
      if (this.active) this.stopDemo();
      else this.startDemo(0);
    }

    startDemo(idx = 0) {
      if (!this.checkGate(true)) return false;
      this.active = true;
      this.collapsed = false;
      this.autoTour = true;
      this.selectScenario(idx, true);
      this.adapter.showToast?.(this.t("demoToastStarted"));
      return true;
    }

    /** Kullanicinin sectigi aktif rota ve girdigi parametrelerle ortak Rover+Insan yolculugunu baslatir */
    startCurrentRoute() {
      if (!this.checkGate(true)) return false;
      const st = this.adapter.getState?.() || {};
      this.expeditionMode = this.budget ? this.budget.normalizeModeId(st.expeditionMode) : "rover-crew";
      this.active = true;
      this.collapsed = false;
      this.autoTour = false;
      this.progress = 0;
      this.playing = true;
      this.startLoop();
      this.adapter.renderDemoBar?.();
      this.adapter.scheduleRender?.(false);
      return true;
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
      this.progress = 0;
      this.stopLoop();
      clearTimeout(this.autoAdvanceTimer);
    }

    toggleCollapsed() {
      this.collapsed = !this.collapsed;
      this.adapter.renderDemoBar?.();
      this.adapter.scheduleRender?.(false);
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

    setExpeditionMode(kind) {
      const next = this.budget
        ? this.budget.normalizeModeId(kind)
        : ((kind === "joint-eva-escort" || kind === "astronaut" || kind === "eva") ? "joint-eva-escort" : "rover-crew");
      this.expeditionMode = next;
      if (this.adapter.onChangeExpeditionMode) {
        this.adapter.onChangeExpeditionMode(next);
      } else {
        this.adapter.renderDemoBar?.();
        this.adapter.scheduleRender?.(false);
      }
    }

    setVehicle(kind) {
      this.setExpeditionMode(kind);
    }

    setProgress(p) {
      if (!this.checkGate(true)) return;
      this.progress = Math.max(0, Math.min(1, Number(p) || 0));
      this.adapter.renderDemoBar?.();
      this.adapter.scheduleRender?.(false);
    }

    togglePlay() {
      if (!this.checkGate(true)) return;
      if (!this.active) this.active = true;
      if (this.progress >= 0.999) this.progress = 0;
      this.playing = !this.playing;
      if (this.playing) this.startLoop();
      else this.stopLoop();
      this.scheduleAutoAdvance();
      this.adapter.renderDemoBar?.();
    }

    restart() {
      if (!this.checkGate(true)) return;
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
      if (!this.checkGate(true)) return false;
      const safeIdx = Math.max(0, Math.min(this.scenarios.length - 1, Number(idx) || 0));
      this.scenarioIdx = safeIdx;
      const scen = this.scenarios[safeIdx];
      this.expeditionMode = this.budget ? this.budget.normalizeModeId(scen.expeditionMode) : "rover-crew";
      this.progress = 0;
      this.playing = Boolean(autoPlay);

      this.adapter.applyDemoScenario?.(scen);
      if (this.playing) this.startLoop();
      else this.stopLoop();
      this.scheduleAutoAdvance();
      this.adapter.renderDemoBar?.();
      return true;
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
      if (this.rafId || !this.checkGate(false)) return;
      this.lastTickMs = performance.now();
      const tick = (now) => {
        if (!this.active || !this.playing || !this.checkGate(false)) {
          this.playing = false;
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

    /** Harita cizimi ve HUD icin canli ortak Rover+Insan telemetri yukunu dondurur */
    getRenderPayload() {
      if (!this.active) return null;
      const routes = this.adapter.getRoutes?.();
      const pri = routes?.primaryBlue;
      const pts = pri?.points;
      const state = this.adapter.getState?.() || {};
      const prof = this.budget
        ? this.budget.getModeProfile(this.expeditionMode)
        : { defaultSpeedKmH: 14.5, baseO2LPerMin: 0.55, basePowerKw: 8.8 };

      const o2Start = Number(state.oxygenReserveLiters || 0);
      const o2CapL = Math.max(420, Number(state.oxygenTankCapacityL || 420), o2Start);
      const energyStart = Number(state.energyReserveKwh || 0);
      const energyCapKwh = Math.max(75, Number(state.energyTankCapacityKwh || 75), energyStart);
      const speedKmH = Number(pri?.avgSpeedKmH || state.targetSpeedKmH || prof.defaultSpeedKmH);

      if (!Array.isArray(pts) || pts.length < 2) {
        return {
          active: true, ready: false, playing: this.playing, expeditionMode: this.expeditionMode,
          progress: this.progress, progressPct: Math.round(this.progress * 100),
          traveledKm: 0, totalKm: 0, elapsedMin: 0, elevM: 0,
          remainingO2L: Math.round(o2Start), o2Max: o2CapL, o2Pct: o2CapL > 0 ? Math.round((o2Start / o2CapL) * 100) : 0,
          remainingEnergyKwh: Number(energyStart.toFixed(1)), energyPct: energyCapKwh > 0 ? Math.round((energyStart / energyCapKwh) * 100) : 0,
          speedKmH, pulsePhase: this.pulsePhase
        };
      }

      const pos = this.samplePointAtProgress(pts, this.progress);
      const totalKm = Number(pri.totalKm || 0);
      const traveledKm = totalKm * this.progress;
      const totalMinutes = Number(pri.totalMinutes || ((totalKm / Math.max(0.5, speedKmH)) * 60));
      const elapsedMin = Math.round(totalMinutes * this.progress);
      const usedO2Total = Number(pri.o2Liters || (totalMinutes * prof.baseO2LPerMin));
      const remainingO2L = Math.max(0, Math.round(o2Start - usedO2Total * this.progress));
      const o2Pct = o2CapL > 0 ? Number(((remainingO2L / o2CapL) * 100).toFixed(1)) : 0;
      const usedEnergyTotal = Number(pri.energyUsedKwh || ((totalMinutes / 60) * prof.basePowerKw));
      const remainingEnergyKwh = Number(Math.max(0, energyStart - usedEnergyTotal * this.progress).toFixed(1));
      const energyPct = energyCapKwh > 0 ? Number(((remainingEnergyKwh / energyCapKwh) * 100).toFixed(1)) : 0;
      const topo = ns.marsTopo;
      const elevM = (pos && topo && topo.getElevationMeters) ? Math.round(topo.getElevationMeters(pos.lat, pos.lon)) : 0;

      return {
        active: true,
        ready: Boolean(pos),
        playing: this.playing,
        expeditionMode: this.expeditionMode,
        progress: this.progress,
        progressPct: Math.round(this.progress * 100),
        lat: pos ? pos.lat : 0,
        lon: pos ? pos.lon : 0,
        segIdx: pos ? pos.segIdx : 0,
        headingRad: pos ? pos.headingRad : 0,
        pulsePhase: this.pulsePhase,
        traveledKm: Number(traveledKm.toFixed(1)),
        totalKm: Number(totalKm.toFixed(1)),
        elapsedMin,
        elevM,
        remainingO2L,
        o2Max: o2CapL,
        o2Pct,
        remainingEnergyKwh,
        energyPct,
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
        expeditionMode: this.expeditionMode,
        speedMult: this.speedMult,
        progress: this.progress,
        telemetry: this.getRenderPayload()
      };
    }

    /** Kontrol cubugu + servisi tek adimda baglar (MarsNavigatorController <800 satir kurali icin) */
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
          onSetSpeed: (s) => service.setSpeed(s), onSetVehicle: (v) => service.setExpeditionMode(v),
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
   - Satir 1-5: JSDoc birlesik Rover+Insan ortak sefer simulasyonu ve parametre kapisi servis tanimi.
   - Satir 15-33: constructor; MissionBudgetHelper baglantisi, ortak sefer modu ve rAF dongu degiskenlerini kurar.
   - Satir 35-139: buildScenarios; Rover+Ekip ve Rover+Yaya EVA ortak sunum senaryolarini tanimlar (ayrik mod yoktur).
   - Satir 141-296: checkGate, startDemo, startCurrentRoute, toggleCollapsed (scheduleRender sync), setExpeditionMode ve senaryo gecisleri; parametre kapisi dolmadan animasyonu baslatmaz.
   - Satir 298-335: startLoop ve stopLoop; her karede kapi dogrulamali animasyon ilerlemesi saglar.
   - Satir 337-476: samplePointAtProgress, getRenderPayload, getUiState ve attach; Mars haversine mesafesi, MOLA rakim ve dk/km-sa/%O2-L/kWh telemetrisini uretir.
   ========================================================================== */
