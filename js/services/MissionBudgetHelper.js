/**
 * @file MissionBudgetHelper.js
 * @description Rover + Insan ortak sefer fizik profilleri (Rover+Ekip & Rover+Yaya EVA),
 * zorunlu on-gorev parametre dogrulama kapisi ve dakika/saat/km-h/O2(%+L)/Enerji(%+kWh) butce motoru.
 */

(function (ns) {
  "use strict";

  class MissionBudgetHelper {
    constructor() {
      this.profiles = {
        "rover-crew": {
          id: "rover-crew",
          badge: "ROVER+EKİP",
          titleKey: "modeRoverCrew",
          descKey: "modeRoverCrewDesc",
          defaultSpeedKmH: 14.5,
          minSpeedKmH: 4.0,
          maxSpeedKmH: 19.0,
          baseO2LPerMin: 0.08,
          slopeO2Gain: 0.015,
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
          titleKey: "modeJointEva",
          descKey: "modeJointEvaDesc",
          defaultSpeedKmH: 3.6,
          minSpeedKmH: 1.8,
          maxSpeedKmH: 5.4,
          baseO2LPerMin: 0.80,
          slopeO2Gain: 0.05,
          defaultO2L: 420,
          defaultEnergyKwh: 75.0,
          basePowerKw: 2.85,
          slopePowerGainKw: 0.22,
          maxSlopeDeg: 26.0,
          co2Ratio: 0.88
        }
      };
    }

    /** Eski veya farkli arac adlarini birlesik Rover+Insan moduna indirger (ayri robot/tekil mod yok) */
    normalizeModeId(rawMode) {
      const m = String(rawMode || "").toLowerCase();
      if (m === "joint-eva-escort" || m === "eva" || m === "astronaut") return "joint-eva-escort";
      return "rover-crew";
    }

    /** Secili ortak sefer profilini dondurur */
    getModeProfile(rawMode) {
      return this.profiles[this.normalizeModeId(rawMode)];
    }

    /** Pozitif ve sonlu sayisal giris cozumler; bos veya <=0 ise null doner */
    parsePositive(rawVal) {
      if (rawVal === null || rawVal === undefined) return null;
      if (typeof rawVal === "string" && rawVal.trim() === "") return null;
      const num = Number(rawVal);
      return Number.isFinite(num) && num > 0 ? num : null;
    }

    /** Yolculuk ve hesaplama oncesi zorunlu O2, Enerji ve Hiz parametrelerini dogrular */
    validateMissionParams(params = {}) {
      const mode = this.normalizeModeId(params.expeditionMode || params.vehicleType || params.vehicle);
      const prof = this.getModeProfile(mode);

      const o2L = this.parsePositive(params.initialO2L ?? params.oxygenReserveLiters);
      const energyKwh = this.parsePositive(params.initialEnergyKwh ?? params.energyReserveKwh);
      const speedKmH = this.parsePositive(params.targetSpeedKmH);
      const crewCount = Math.max(1, Math.round(Number(params.crewCount) || 1));
      const roverCount = Math.max(1, Math.round(Number(params.roverCount) || 1));

      const missingKeys = [];
      if (o2L === null) missingKeys.push("o2");
      if (energyKwh === null) missingKeys.push("energy");
      if (speedKmH === null) missingKeys.push("speed");

      const refO2Cap = o2L !== null ? o2L : Math.max(1, Number(params.oxygenTankCapacityL || 0));
      const refEnergyCap = Math.max(75, Number(params.energyTankCapacityKwh || 75), energyKwh || 0);
      const startO2Pct = o2L !== null ? Number(((o2L / refO2Cap) * 100).toFixed(1)) : 0;
      const startEnergyPct = energyKwh !== null ? Number(((energyKwh / refEnergyCap) * 100).toFixed(1)) : 0;

      return {
        valid: missingKeys.length === 0,
        missingKeys,
        mode,
        profile: prof,
        normalized: {
          o2L: o2L || 0,
          o2CapL: refO2Cap,
          startO2Pct,
          energyKwh: energyKwh || 0,
          energyCapKwh: refEnergyCap,
          startEnergyPct,
          speedKmH: speedKmH || prof.defaultSpeedKmH,
          crewCount,
          roverCount
        }
      };
    }

    /** Rota adimlari, MOLA egimi ve ortam tehlikeleri uzerinden tam varis butcesi hesaplar */
    computeRouteBudget({
      totalKm = 0,
      steps = [],
      acidEnabled = false,
      stormEnabled = false,
      acidSpeedMult = 1.0,
      stormSpeedMult = 1.0,
      o2LeakActive = false,
      stormSurgeActive = false,
      params = {},
      formatHoursFn = null
    }) {
      const check = this.validateMissionParams(params);
      const prof = check.profile;
      const norm = check.normalized;
      const envSpeedMult = (acidEnabled ? Number(acidSpeedMult || 0.78) : 1.0)
        * (stormEnabled ? Number(stormSpeedMult || 0.70) : 1.0)
        * (stormSurgeActive ? 0.62 : 1.0);
      const stormO2Factor = (stormEnabled || stormSurgeActive) ? 1.18 : 1.0;
      const leakLPerMin = o2LeakActive ? 1.20 : 0.0;

      let accumKm = 0;
      let totalHours = 0;
      let consumedO2L = 0;
      let consumedEnergyKwh = 0;

      if (Array.isArray(steps) && steps.length >= 2) {
        for (const s of steps) {
          const segKm = Math.max(0, Number(s.distKm || 0));
          if (segKm <= 0) continue;
          const slopeDeg = Math.max(0, Number(s.slopeDeg || 0));
          const slopeFactor = Math.max(0.40, 1.0 - slopeDeg / 46.0);
          const effSpeed = Math.max(0.5, norm.speedKmH * slopeFactor * envSpeedMult);
          const segHours = segKm / effSpeed;
          const segMin = segHours * 60.0;
          const o2Rate = Math.min(8.0, prof.baseO2LPerMin * norm.crewCount * (1.0 + slopeDeg * prof.slopeO2Gain) * stormO2Factor) + leakLPerMin;
          const powerKw = Math.max(0.15, (prof.basePowerKw + slopeDeg * prof.slopePowerGainKw + (stormEnabled ? prof.basePowerKw * 0.14 : 0)) * norm.roverCount);

          accumKm += segKm;
          totalHours += segHours;
          consumedO2L += o2Rate * segMin;
          consumedEnergyKwh += powerKw * segHours;
        }
      }

      const finalKm = Number((totalKm > 0 ? totalKm : accumKm).toFixed(2));
      if (totalHours <= 0 && finalKm > 0) {
        const effSpeed = Math.max(0.5, norm.speedKmH * 0.92 * envSpeedMult);
        totalHours = finalKm / effSpeed;
        const totalMin = totalHours * 60.0;
        const o2Rate = Math.min(8.0, prof.baseO2LPerMin * norm.crewCount * 1.12 * stormO2Factor) + leakLPerMin;
        consumedO2L = o2Rate * totalMin;
        consumedEnergyKwh = prof.basePowerKw * norm.roverCount * totalHours;
      }

      const safeHours = Number(Math.max(0.01, totalHours).toFixed(2));
      const totalMinutes = Math.max(1, Math.round(totalHours * 60));
      const avgSpeedKmH = Number((safeHours > 0 ? finalKm / safeHours : norm.speedKmH).toFixed(1));
      const speedMPerMin = Math.round((avgSpeedKmH * 1000) / 60);
      const formattedDuration = typeof formatHoursFn === "function"
        ? formatHoursFn(totalHours)
        : `${Math.floor(totalHours)} saat ${Math.round((totalHours - Math.floor(totalHours)) * 60)} dk`;

      const usedO2 = Math.round(consumedO2L);
      const usedEnergy = Number(consumedEnergyKwh.toFixed(2));

      const arrivalO2L = Math.max(0, Math.round(norm.o2L - consumedO2L));
      const arrivalO2Pct = norm.o2CapL > 0 ? Number(((arrivalO2L / norm.o2CapL) * 100).toFixed(1)) : 0;
      const arrivalEnergyKwh = Number(Math.max(0, norm.energyKwh - consumedEnergyKwh).toFixed(2));
      const arrivalEnergyPct = norm.energyCapKwh > 0 ? Number(((arrivalEnergyKwh / norm.energyCapKwh) * 100).toFixed(1)) : 0;

      return {
        expeditionMode: check.mode,
        modeBadge: prof.badge,
        modeTitleKey: prof.titleKey,
        paramsValid: check.valid,
        totalKm: finalKm,
        totalMeters: Math.round(finalKm * 1000),
        totalHours: safeHours,
        totalMinutes,
        formattedDuration,
        targetSpeedKmH: Number(norm.speedKmH.toFixed(1)),
        avgSpeedKmH,
        speedMPerMin,
        startO2L: Number(norm.o2L.toFixed(0)),
        o2CapL: norm.o2CapL,
        startO2Pct: norm.startO2Pct,
        o2Liters: usedO2,
        arrivalO2L,
        arrivalO2Pct,
        o2DeficitL: Math.max(0, Math.round(consumedO2L - norm.o2L)),
        startEnergyKwh: Number(norm.energyKwh.toFixed(1)),
        energyCapKwh: norm.energyCapKwh,
        startEnergyPct: norm.startEnergyPct,
        energyUsedKwh: usedEnergy,
        arrivalEnergyKwh,
        arrivalEnergyPct,
        energyDeficitKwh: Number(Math.max(0, consumedEnergyKwh - norm.energyKwh).toFixed(1)),
        walkbackO2Alert: arrivalO2Pct < 20 || consumedO2L > norm.o2L,
        batteryReserveAlert: arrivalEnergyPct < 35 || consumedEnergyKwh > norm.energyKwh
      };
    }
  }

  ns.MissionBudgetHelper = MissionBudgetHelper;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-10: JSDoc ve IIFE modul baslangici.
   - Satir 11-50: constructor; Rover+Ekip ve Rover+Yaya EVA ortak sefer profillerini tanimlar (ayrik robot/bilim modu yoktur).
   - Satir 52-63: normalizeModeId ve getModeProfile; tum arac modlarini birlesik Rover+Insan profillerine esler.
   - Satir 65-100: parsePositive ve validateMissionParams; yolculuk oncesi O2, Enerji, Su ve Hiz parametre kapisini denetler.
   - Satir 102-194: computeRouteBudget; dakika/saat, km-h/m-dk, baslangic %+L -> varis L+% O2, kWh/% enerji ve Walkback uyarisini hesaplar.
   ========================================================================== */
