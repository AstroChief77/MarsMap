/**
 * @file MarsSimulationEngine.js
 * @description Prameters.md ve NASA standartlarina dayali gercekci Mars hayatta kalma simulasyon motoru.
 * Insan (EVA), Basincli Rover (SEV) ve Otonom Bilim Roveri icin gercek MOLA rakim/egim ve aktif
 * asit yagmuru, kum firtinasi (tau) ile alfa/beta/gama radyasyon uzerinden O2, su, enerji, CO2 ve doz simule eder.
 */

(function (ns) {
  "use strict";

  class MarsSimulationEngine {
    constructor() {
      this.geo = ns.RouteGeometryHelper ? new ns.RouteGeometryHelper() : null;
      this.profiles = {
        rover: {
          id: "rover",
          label: "Basınçlı Rover (SEV)",
          defaultSpeedKmH: 14.5,
          minSpeedKmH: 4.0,
          maxSpeedKmH: 19.0,
          baseO2LPerMin: 0.55,
          slopeO2Gain: 0.032,
          baseWaterLPerMin: 0.015,
          defaultEnergyKwh: 65.0,
          basePowerKw: 8.8,
          slopePowerGainKw: 0.55,
          maxSlopeDeg: 25.0,
          co2Ratio: 0.85
        },
        eva: {
          id: "eva",
          label: "İnsan (EVA Giysisi)",
          defaultSpeedKmH: 3.6,
          minSpeedKmH: 1.8,
          maxSpeedKmH: 5.4,
          baseO2LPerMin: 0.85,
          slopeO2Gain: 0.095,
          baseWaterLPerMin: 0.021,
          defaultEnergyKwh: 1.5,
          basePowerKw: 0.085,
          slopePowerGainKw: 0.0045,
          maxSlopeDeg: 28.0,
          co2Ratio: 0.88
        },
        robot: {
          id: "robot",
          label: "Bilim Roveri (Perseverance)",
          defaultSpeedKmH: 0.15,
          minSpeedKmH: 0.06,
          maxSpeedKmH: 0.30,
          baseO2LPerMin: 0.0,
          slopeO2Gain: 0.0,
          baseWaterLPerMin: 0.0,
          defaultEnergyKwh: 2.2,
          basePowerKw: 0.24,
          slopePowerGainKw: 0.015,
          maxSlopeDeg: 30.0,
          co2Ratio: 0.0
        }
      };

      this.samples = [];
      this.events = [];
      this.summary = this.createEmptySummary();
    }

    getProfile(vehicleType) {
      return this.profiles[vehicleType] || this.profiles.rover;
    }

    createEmptySummary() {
      return {
        totalKm: 0,
        totalHours: 0,
        finalO2L: 420,
        finalWaterL: 24,
        finalEnergyKwh: 65,
        totalRadMsv: 0,
        maxSlopeDeg: 0,
        minElevM: 0,
        maxElevM: 0,
        walkbackBreach: false,
        depletedO2: false,
        depletedEnergy: false
      };
    }

    /** Rota noktalarini esit adimlarla ornekleyip tum fizik/yasam-destek zaman serisini uretir */
    buildTimeline(route, params, hazardBundle) {
      this.samples = [];
      this.events = [];
      const pts = route?.primaryBlue?.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        this.summary = this.createEmptySummary();
        return { samples: [], events: [], summary: this.summary };
      }

      const prof = this.getProfile(params.vehicleType);
      const initO2 = Math.max(0, Number(params.initialO2L ?? 420));
      const initWater = Math.max(0, Number(params.initialWaterL ?? 24));
      const initEnergy = Math.max(0.1, Number(params.initialEnergyKwh ?? prof.defaultEnergyKwh));
      const baseSpeed = Math.max(0.05, Number(params.targetSpeedKmH ?? prof.defaultSpeedKmH));
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
      let remWater = initWater;
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
        text: `Görev başlatıldı: ${prof.label} · ${initO2.toFixed(0)} L O₂ · ${initEnergy.toFixed(1)} kWh`
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

        const slopeSpeedFactor = Math.max(0.45, 1.0 - slopeDeg / 45.0);
        let envSpeedFactor = 1.0;
        if (inAcid) envSpeedFactor *= acidMult;
        if (inStorm) envSpeedFactor *= stormMult;
        if (params.stormSurgeActive) envSpeedFactor *= 0.62;

        const effSpeedKmH = Math.max(0.03, baseSpeed * slopeSpeedFactor * envSpeedFactor);
        const segHours = segKm / effSpeedKmH;
        const segMin = segHours * 60.0;
        cumHours += segHours;

        const o2SlopeFactor = 1.0 + slopeDeg * prof.slopeO2Gain;
        const o2StormPenalty = (inStorm || params.stormSurgeActive) && prof.baseO2LPerMin > 0 ? 1.18 : 1.0;
        const o2RateLPerMin = prof.baseO2LPerMin > 0
          ? Math.min(4.0, prof.baseO2LPerMin * o2SlopeFactor * o2StormPenalty) + leakO2LPerMin
          : 0;
        const waterRateLPerMin = prof.baseWaterLPerMin * (1.0 + slopeDeg * 0.015);
        const co2RateLPerMin = Math.max(0, (o2RateLPerMin - leakO2LPerMin) * prof.co2Ratio);

        // MMRTG 110W surekli sagladigi icin robotik rover net cekimi cok dusuktur
        const rtgSupplyKw = prof.id === "robot" ? 0.11 : 0.0;
        const powerKw = Math.max(0.05, prof.basePowerKw + slopeDeg * prof.slopePowerGainKw + (inStorm ? prof.basePowerKw * 0.14 : 0) - rtgSupplyKw);
        const radRateUSvPerMin = 0.44 + (inRad ? 3.8 : 0) + (inStorm ? 0.25 : 0);

        remO2 = Math.max(0, remO2 - o2RateLPerMin * segMin);
        remWater = Math.max(0, remWater - waterRateLPerMin * segMin);
        remEnergy = Math.max(0, remEnergy - (powerKw * segHours));
        cumCo2L += co2RateLPerMin * segMin;
        cumRadMsv += (radRateUSvPerMin * segMin) / 1000.0;

        const pRatio = i / (densePts.length - 1);
        const o2Pct = initO2 > 0 ? (remO2 / initO2) * 100 : 100;
        const energyPct = initEnergy > 0 ? (remEnergy / initEnergy) * 100 : 100;

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
          this.events.push({ progress: pRatio, hours: cumHours, level: "warn", text: `Toz fırtınası koridoru: hız ${effSpeedKmH.toFixed(1)} km/sa seviyesine düşürüldü.` });
        }
        if (!walkbackLogged && initO2 > 0 && o2Pct <= 20 && prof.baseO2LPerMin > 0) {
          walkbackLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "danger", text: `KRİTİK: O₂ rezervi %20 Walkback sınırının altına düştü (${remO2.toFixed(0)} L)!` });
        }
        if (!o2EmptyLogged && remO2 <= 0.1 && prof.baseO2LPerMin > 0) {
          o2EmptyLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "danger", text: `O₂ TÜKENDİ (${cumKm.toFixed(1)} km noktasında ikmal zorunlu)!` });
        }
        if (!battLowLogged && energyPct <= 15) {
          battLowLogged = true;
          this.events.push({ progress: pRatio, hours: cumHours, level: "danger", text: `Batarya rezervi %15 altına indi (${remEnergy.toFixed(2)} kWh).` });
        }

        this.samples.push({
          progress: pRatio,
          lat: pt.lat,
          lon: pt.lon,
          km: Number(cumKm.toFixed(2)),
          hours: Number(cumHours.toFixed(3)),
          elevM,
          slopeDeg,
          speedKmH: Number(effSpeedKmH.toFixed(2)),
          speedMPerMin: Number(((effSpeedKmH * 1000) / 60).toFixed(1)),
          remO2L: Number(remO2.toFixed(1)),
          o2Pct: Number(o2Pct.toFixed(1)),
          o2RateLPerMin: Number(o2RateLPerMin.toFixed(2)),
          remWaterL: Number(remWater.toFixed(2)),
          waterPct: Number((initWater > 0 ? (remWater / initWater) * 100 : 100).toFixed(1)),
          waterRateMlPerMin: Number((waterRateLPerMin * 1000).toFixed(1)),
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
      this.events.push({
        progress: 1,
        hours: last.hours,
        level: (o2EmptyLogged || battLowLogged) ? "danger" : "ok",
        text: `Simülasyon tamamlandı: ${last.km.toFixed(1)} km · Kalan O₂ ${last.remO2L.toFixed(0)} L · Doz ${last.cumRadMsv.toFixed(2)} mSv`
      });

      this.summary = {
        totalKm: last.km,
        totalHours: last.hours,
        finalO2L: last.remO2L,
        finalWaterL: last.remWaterL,
        finalEnergyKwh: last.remEnergyKwh,
        totalRadMsv: last.cumRadMsv,
        maxSlopeDeg: maxSlope,
        minElevM: Number.isFinite(minElev) ? minElev : 0,
        maxElevM: Number.isFinite(maxElev) ? maxElev : 0,
        walkbackBreach: walkbackLogged,
        depletedO2: o2EmptyLogged,
        depletedEnergy: remEnergy <= 0.05
      };

      return { samples: this.samples, events: this.events, summary: this.summary };
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
        remWaterL: Number(lerp("remWaterL").toFixed(2)),
        waterPct: Number(lerp("waterPct").toFixed(1)),
        remEnergyKwh: Number(lerp("remEnergyKwh").toFixed(2)),
        energyPct: Number(lerp("energyPct").toFixed(1)),
        powerKw: Number(lerp("powerKw").toFixed(2)),
        cumCo2L: Number(lerp("cumCo2L").toFixed(1)),
        cumRadMsv: Number(lerp("cumRadMsv").toFixed(3))
      };
    }
  }

  ns.MarsSimulationEngine = MarsSimulationEngine;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc NASA standartlarina dayali Mars yasam destek ve enerji simulasyon motoru.
   - Satir 11-57: constructor ve arac profilleri (Basincli Rover SEV, Insan EVA, Perseverance Rover).
   - Satir 79-227: buildTimeline; MOLA rakim/egim, asit, firtina, radyasyon, O2 sizintisi ve %20 walkback esiklerini adim adim simule eder.
   - Satir 229-275: densifyPolyline, distKm ve isInsideAny cografik ornekleme yardimcilari.
   - Satir 277-309: sampleAt; herhangi bir zaman noktasindaki canli telemetri degerlerini enterpole eder.
   ========================================================================== */
