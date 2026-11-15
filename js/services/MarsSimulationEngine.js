/**
 * @file MarsSimulationEngine.js
 * @description Prameters.md ve NASA standartlarina dayali gercekci Mars hayatta kalma simulasyon motoru.
 * Ortak Rover + Ekip (SEV) ve Rover + Yaya EVA sefer profilleri icin gercek MOLA rakim/egim ve aktif
 * asit yagmuru, kum firtinasi (tau) ile alfa/beta/gama radyasyon uzerinden O2, su, enerji, CO2 ve doz simule eder.
 */

(function (ns) {
  "use strict";

  class MarsSimulationEngine {
    constructor() {
      this.geo = ns.RouteGeometryHelper ? new ns.RouteGeometryHelper() : null;
      this.budget = ns.MissionBudgetHelper ? new ns.MissionBudgetHelper() : null;
      this.profiles = this.budget ? this.budget.profiles : {
        "rover-crew": {
          id: "rover-crew",
          badge: "ROVER+EKİP",
          defaultSpeedKmH: 14.5,
          minSpeedKmH: 4.0,
          maxSpeedKmH: 19.0,
          baseO2LPerMin: 0.55,
          slopeO2Gain: 0.032,
          defaultO2L: 420,
          defaultEnergyKwh: 75.0,
          basePowerKw: 8.8,
          slopePowerGainKw: 0.55,
          maxSlopeDeg: 25.0,
          co2Ratio: 0.85
        },
        "joint-eva-escort": {
          id: "joint-eva-escort",
          badge: "ROVER+EVA",
          defaultSpeedKmH: 3.6,
          minSpeedKmH: 1.8,
          maxSpeedKmH: 5.4,
          baseO2LPerMin: 1.01,
          slopeO2Gain: 0.095,
          defaultO2L: 420,
          defaultEnergyKwh: 75.0,
          basePowerKw: 2.85,
          slopePowerGainKw: 0.22,
          maxSlopeDeg: 26.0,
          co2Ratio: 0.88
        }
      };

      this.samples = [];
      this.events = [];
      this.summary = this.createEmptySummary();
    }

    normalizeMode(rawMode) {
      if (this.budget) return this.budget.normalizeModeId(rawMode);
      const m = String(rawMode || "").toLowerCase();
      return (m === "joint-eva-escort" || m === "eva" || m === "astronaut") ? "joint-eva-escort" : "rover-crew";
    }

    getProfile(rawMode) {
      const mode = this.normalizeMode(rawMode);
      const prof = this.profiles[mode] || this.profiles["rover-crew"];
      const label = mode === "joint-eva-escort" ? "Rover + Yaya EVA (Birlikte Keşif)" : "Rover + Ekip (Birlikte Seyir)";
      return { ...prof, label };
    }

    validateParams(params = {}) {
      if (this.budget) return this.budget.validateMissionParams(params);
      const mode = this.normalizeMode(params.expeditionMode || params.vehicleType || params.vehicle);
      const prof = this.getProfile(mode);
      const o2L = Number(params.initialO2L ?? params.oxygenReserveLiters);
      const energyKwh = Number(params.initialEnergyKwh ?? params.energyReserveKwh);
      const speedKmH = Number(params.targetSpeedKmH);
      const missingKeys = [];
      if (!(o2L > 0)) missingKeys.push("o2");
      if (!(energyKwh > 0)) missingKeys.push("energy");
      if (!(speedKmH > 0)) missingKeys.push("speed");
      return {
        valid: missingKeys.length === 0,
        missingKeys,
        mode,
        profile: prof,
        normalized: {
          o2L: o2L > 0 ? o2L : 0,
          o2CapL: o2L > 0 ? o2L : 0,
          startO2Pct: o2L > 0 ? 100 : 0,
          energyKwh: energyKwh > 0 ? energyKwh : 0,
          energyCapKwh: Math.max(75, energyKwh || 0),
          startEnergyPct: energyKwh > 0 ? Number(((energyKwh / Math.max(75, energyKwh)) * 100).toFixed(1)) : 0,
          speedKmH: speedKmH > 0 ? speedKmH : prof.defaultSpeedKmH
        }
      };
    }

    createEmptySummary() {
      return {
        expeditionMode: "rover-crew",
        paramsValid: false,
        totalKm: 0,
        totalHours: 0,
        totalMinutes: 0,
        avgSpeedKmH: 0,
        speedMPerMin: 0,
        startO2L: 0,
        startO2Pct: 0,
        finalO2L: 0,
        finalO2Pct: 0,
        startEnergyKwh: 0,
        startEnergyPct: 0,
        finalEnergyKwh: 0,
        finalEnergyPct: 0,
        totalRadMsv: 0,
        maxSlopeDeg: 0,
        minElevM: 0,
        maxElevM: 0,
        walkbackBreach: false,
        batteryBreach: false,
        depletedO2: false,
        depletedEnergy: false
      };
    }

    /** Zorunlu O2/Enerji parametrelerini dogrular ve MOLA rakim/egim + tehlikeler uzerinden ortak Rover+Insan zaman serisini uretir */
    buildTimeline(route, params, hazardBundle) {
      this.samples = [];
      this.events = [];
      const check = this.validateParams(params);
      const pts = route?.primaryBlue?.points;
      if (!check.valid || !Array.isArray(pts) || pts.length < 2) {
        this.summary = this.createEmptySummary();
        return { samples: [], events: [], summary: this.summary, gateBlocked: !check.valid, missingKeys: check.missingKeys };
      }

      const prof = this.getProfile(check.mode);
      const norm = check.normalized;
      const initO2 = norm.o2L;
      const o2CapL = norm.o2CapL;
      const initEnergy = norm.energyKwh;
      const energyCapKwh = norm.energyCapKwh;
      const baseSpeed = Math.max(0.5, norm.speedKmH);
      const leakO2LPerMin = params.o2LeakActive ? 1.20 : 0.0;

      const densePts = this.densifyPolyline(pts, 120);
      const acidZones = (params.filterAcidRain && hazardBundle?.acidZones) || [];
      const stormZones = (params.filterDustStorm && hazardBundle?.stormZones) || [];
      const radZones = (params.showRadiationZones && hazardBundle?.radiationZones) || [];
      const acidMult = hazardBundle?.acidSpec?.speedMult || 0.78;
      const stormMult = hazardBundle?.stormSpec?.speedMult || 0.70;
      const topo = ns.marsTopo || null;

      let cumKm = 0;
      let cumHours = 0;
      let remO2 = initO2;
      let remEnergy = initEnergy;
      let cumCo2L = 0;
      let cumRadMsv = 0;
      let maxSlope = 0;
      let minElev = Infinity;
      let maxElev = -Infinity;
      let walkbackLogged = false;
      let o2EmptyLogged = false;
      let battLowLogged = false;
      let stormWarnLogged = false;
      let acidWarnLogged = false;
      let steepWarnLogged = false;

      this.events.push({
        progress: 0,
        hours: 0,
        level: "info",
        text: `Ortak Sefer Başladı: ${prof.label} · ${initO2.toFixed(0)} L O₂ (%${norm.startO2Pct}) · ${initEnergy.toFixed(1)} kWh (%${norm.startEnergyPct})`
      });

      for (let i = 0; i < densePts.length; i++) {
        const pt = densePts[i];
        const prev = i > 0 ? densePts[i - 1] : pt;
        const segKm = i === 0 ? 0 : this.distKm(prev.lat, prev.lon, pt.lat, pt.lon);
        cumKm += segKm;

        const tele = (topo && topo.getSurfaceTelemetry)
          ? topo.getSurfaceTelemetry(pt.lat, pt.lon)
          : { elevM: -2000, slopeDeg: 2.5 };
        const elevM = Math.round(tele.elevM);
        const slopeDeg = Number((tele.slopeDeg || 0).toFixed(1));
        if (slopeDeg > maxSlope) maxSlope = slopeDeg;
        if (elevM < minElev) minElev = elevM;
        if (elevM > maxElev) maxElev = elevM;

        const inAcid = this.isInsideAny(pt.lat, pt.lon, acidZones);
        const inStorm = this.isInsideAny(pt.lat, pt.lon, stormZones);
        const inRad = this.isInsideAny(pt.lat, pt.lon, radZones);

        const slopeSpeedFactor = Math.max(0.40, 1.0 - slopeDeg / 46.0);
        let envSpeedFactor = 1.0;
        if (inAcid) envSpeedFactor *= acidMult;
        if (inStorm) envSpeedFactor *= stormMult;
        if (params.stormSurgeActive) envSpeedFactor *= 0.62;

        const effSpeedKmH = Math.max(0.5, baseSpeed * slopeSpeedFactor * envSpeedFactor);
        const segHours = segKm / effSpeedKmH;
        const segMin = segHours * 60.0;
        cumHours += segHours;

        const o2SlopeFactor = 1.0 + slopeDeg * prof.slopeO2Gain;
        const o2StormPenalty = (inStorm || params.stormSurgeActive) ? 1.18 : 1.0;
        const o2RateLPerMin = Math.min(4.0, prof.baseO2LPerMin * o2SlopeFactor * o2StormPenalty) + leakO2LPerMin;
        const co2RateLPerMin = Math.max(0, (o2RateLPerMin - leakO2LPerMin) * prof.co2Ratio);

        const powerKw = Math.max(0.15, prof.basePowerKw + slopeDeg * prof.slopePowerGainKw + (inStorm ? prof.basePowerKw * 0.14 : 0));
        const radRateUSvPerMin = 0.44 + (inRad ? 3.8 : 0) + (inStorm ? 0.25 : 0);

        remO2 = Math.max(0, remO2 - o2RateLPerMin * segMin);
        remEnergy = Math.max(0, remEnergy - (powerKw * segHours));
        cumCo2L += co2RateLPerMin * segMin;
        cumRadMsv += (radRateUSvPerMin * segMin) / 1000.0;

        const pRatio = i / (densePts.length - 1);
        const o2Pct = o2CapL > 0 ? (remO2 / o2CapL) * 100 : 0;
        const energyPct = energyCapKwh > 0 ? (remEnergy / energyCapKwh) * 100 : 0;

        if (!steepWarnLogged && slopeDeg >= 12.0) {
          steepWarnLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "warn", text: `Dik tırmanış (${slopeDeg}°, ${elevM} m): efor ve güç çekimi arttı.` });
        }
        if (!acidWarnLogged && inAcid) {
          acidWarnLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "warn", text: `Asit sülfat kenar bölgesi geçildi (${hazardBundle?.acidSpec?.ph || "pH 2.4"}).` });
        }
        if (!stormWarnLogged && (inStorm || params.stormSurgeActive)) {
          stormWarnLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "warn", text: `Toz fırtınası koridoru: ortak hız ${effSpeedKmH.toFixed(1)} km/sa seviyesine düşürüldü.` });
        }
        if (!walkbackLogged && o2Pct < 20) {
          walkbackLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "danger", text: `KRİTİK: O₂ rezervi %20 Walkback sınırının altına düştü (${remO2.toFixed(0)} L)!` });
        }
        if (!o2EmptyLogged && remO2 <= 0.1) {
          o2EmptyLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "danger", text: `O₂ TÜKENDİ (${cumKm.toFixed(1)} km noktasında ikmal zorunlu)!` });
        }
        if (!battLowLogged && energyPct < 35) {
          battLowLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "danger", text: `Batarya rezervi %35 Walkback eşiğinin altına indi (${remEnergy.toFixed(1)} kWh).` });
        }

        this.samples.push({
          progress: pRatio,
          lat: pt.lat,
          lon: pt.lon,
          km: Number(cumKm.toFixed(2)),
          hours: Number(cumHours.toFixed(3)),
          minutes: Math.round(cumHours * 60),
          elevM,
          slopeDeg,
          speedKmH: Number(effSpeedKmH.toFixed(2)),
          speedMPerMin: Math.round((effSpeedKmH * 1000) / 60),
          remO2L: Number(remO2.toFixed(1)),
          o2Pct: Number(o2Pct.toFixed(1)),
          o2RateLPerMin: Number(o2RateLPerMin.toFixed(2)),
          remEnergyKwh: Number(remEnergy.toFixed(2)),
          energyPct: Number(energyPct.toFixed(1)),
          powerKw: Number(powerKw.toFixed(2)),
          co2RateLPerMin: Number(co2RateLPerMin.toFixed(2)),
          cumCo2L: Number(cumCo2L.toFixed(1)),
          radRateUSvPerMin: Number(radRateUSvPerMin.toFixed(2)),
          cumRadMsv: Number(cumRadMsv.toFixed(3)),
          inAcid,
          inStorm,
          inRad
        });
      }

      const last = this.samples[this.samples.length - 1];
      const totalMinutes = Math.max(1, Math.round(last.hours * 60));
      const avgSpeedKmH = Number((last.hours > 0 ? last.km / last.hours : baseSpeed).toFixed(1));
      this.events.push({
        progress: 1,
        hours: last.hours,
        level: (o2EmptyLogged || battLowLogged || walkbackLogged) ? "danger" : "ok",
        text: `Varış (${totalMinutes} dk): ${last.km.toFixed(1)} km · Kalan O₂ ${last.remO2L.toFixed(0)} L (%${last.o2Pct}) · Enerji ${last.remEnergyKwh.toFixed(1)} kWh (%${last.energyPct})`
      });

      this.summary = {
        expeditionMode: check.mode,
        paramsValid: true,
        totalKm: last.km,
        totalHours: last.hours,
        totalMinutes,
        avgSpeedKmH,
        speedMPerMin: Math.round((avgSpeedKmH * 1000) / 60),
        startO2L: Math.round(initO2),
        startO2Pct: norm.startO2Pct,
        finalO2L: last.remO2L,
        finalO2Pct: last.o2Pct,
        startEnergyKwh: Number(initEnergy.toFixed(1)),
        startEnergyPct: norm.startEnergyPct,
        finalEnergyKwh: last.remEnergyKwh,
        finalEnergyPct: last.energyPct,
        totalRadMsv: last.cumRadMsv,
        maxSlopeDeg: maxSlope,
        minElevM: Number.isFinite(minElev) ? minElev : 0,
        maxElevM: Number.isFinite(maxElev) ? maxElev : 0,
        walkbackBreach: walkbackLogged || last.o2Pct < 20,
        batteryBreach: battLowLogged || last.energyPct < 35,
        depletedO2: o2EmptyLogged,
        depletedEnergy: remEnergy <= 0.05
      };

      return { samples: this.samples, events: this.events, summary: this.summary, gateBlocked: false };
    }

    /** Rota cizgisini istenen ornek sayisina haversine oranli cogaltir */
    densifyPolyline(pts, count) {
      if (pts.length >= count) return pts;
      const segs = [];
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = Math.max(0.0001, this.distKm(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon));
        segs.push(d);
        total += d;
      }
      const out = [];
      for (let s = 0; s < count; s++) {
        const target = (s / (count - 1)) * total;
        let acc = 0;
        for (let i = 0; i < segs.length; i++) {
          if (acc + segs[i] >= target || i === segs.length - 1) {
            const t = Math.max(0, Math.min(1, (target - acc) / segs[i]));
            const dLon = this.geo ? this.geo.shortestDeltaLon(pts[i].lon, pts[i + 1].lon) : (pts[i + 1].lon - pts[i].lon);
            const lon = this.geo ? this.geo.wrapLon(pts[i].lon + dLon * t) : (pts[i].lon + dLon * t);
            out.push({ lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t, lon });
            break;
          }
          acc += segs[i];
        }
      }
      return out;
    }

    distKm(lat1, lon1, lat2, lon2) {
      if (this.geo) return this.geo.haversineMarsKm(lat1, lon1, lat2, lon2);
      return Math.hypot(lat2 - lat1, lon2 - lon1) * 59.1;
    }

    isInsideAny(lat, lon, zones) {
      if (!Array.isArray(zones) || zones.length === 0) return false;
      const cosLat = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
      for (const z of zones) {
        const dLon = this.geo ? this.geo.shortestDeltaLon(z.lon, lon) : (lon - z.lon);
        const ang = Math.hypot(lat - z.lat, dLon * cosLat);
        if (ang <= (z.radiusDeg || 10) * 0.85) return true;
      }
      return false;
    }

    /** Verilen ilerleme (0..1) icin en yakin iki ornegi enterpole eder */
    sampleAt(progress) {
      if (this.samples.length === 0) return null;
      const p = Math.max(0, Math.min(1, progress));
      const fIdx = p * (this.samples.length - 1);
      const i0 = Math.floor(fIdx);
      const i1 = Math.min(this.samples.length - 1, i0 + 1);
      const t = fIdx - i0;
      const a = this.samples[i0];
      const b = this.samples[i1];
      const lerp = (k) => a[k] + (b[k] - a[k]) * t;
      const dLon = this.geo ? this.geo.shortestDeltaLon(a.lon, b.lon) : (b.lon - a.lon);
      return {
        ...a,
        progress: p,
        lat: a.lat + (b.lat - a.lat) * t,
        lon: this.geo ? this.geo.wrapLon(a.lon + dLon * t) : (a.lon + dLon * t),
        km: lerp("km"),
        hours: lerp("hours"),
        elevM: Math.round(lerp("elevM")),
        slopeDeg: Number(lerp("slopeDeg").toFixed(1)),
        speedKmH: Number(lerp("speedKmH").toFixed(1)),
        speedMPerMin: Math.round(lerp("speedMPerMin")),
        remO2L: Number(lerp("remO2L").toFixed(1)),
        o2Pct: Number(lerp("o2Pct").toFixed(1)),
        o2RateLPerMin: Number(lerp("o2RateLPerMin").toFixed(2)),
        remEnergyKwh: Number(lerp("remEnergyKwh").toFixed(2)),
        energyPct: Number(lerp("energyPct").toFixed(1)),
        powerKw: Number(lerp("powerKw").toFixed(2)),
        cumCo2L: Number(lerp("cumCo2L").toFixed(1)),
        cumRadMsv: Number(lerp("cumRadMsv").toFixed(3))
      };
    }

    /** /demo studyosu icin 4 ortak sefer on-ayar senaryosunu dondurur */
    getPresets() {
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
  }

  ns.MarsSimulationEngine = MarsSimulationEngine;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc NASA standartlarina dayali Mars yasam destek ve enerji simulasyon motoru.
   - Satir 11-99: constructor, ortak sefer profilleri (Rover+Ekip / Rover+Yaya EVA) ve validateParams zorunlu kapi dogrulamasi.
   - Satir 101-325: buildTimeline; MOLA rakim/egim, asit, firtina, radyasyon, O2 sizintisi ve %20 walkback / %35 batarya esiklerini adim adim simule eder.
   - Satir 327-369: densifyPolyline, distKm ve isInsideAny cografik ornekleme yardimcilari.
   - Satir 371-440: sampleAt ve getPresets; canli telemetri enterpolasyonu ve /demo ortak sefer senaryo on-ayarlarini saglar.
   ========================================================================== */
