/**
 * @file RoutePlannerService.js
 * @description Asit yagmuru, kum firtinasi (siddetleriyle) ve Alfa/Beta/Gama foton bolgelerini hesaplayarak:
 * 1) Mavi (#2563eb): En guvenli ve en kisa yol
 * 2) Soluk Mavi (#93c5fd): Yine guvenli ama daha uzun alternatif yol
 * rotalarini kilometre/metre, saat ve Litre (O2 + Su) cinsinden hesaplayan sinif.
 * Her rota uzerinde gosterilecek yol yorumlarini ("yollarda yorum satiri") uretir.
 */

(function (ns) {
  "use strict";
  const { AppConfig, HazardFieldService, RouteGeometryHelper } = ns;

  class RoutePlannerService {
    /**
     * RoutePlannerService yapici metodu
     */
    constructor(config = new AppConfig(), hazardService = null) {
      this.config = config;
      this.hazardService = hazardService || new HazardFieldService(config);
      this.geo = new RouteGeometryHelper();
      this.budget = ns.MissionBudgetHelper ? new ns.MissionBudgetHelper() : null;

      // Fabrika birim sabitleri (Saat, Dakika, Kilometre/Metre, Litre)
      this.evaSpeedKmH = 3.6;           // Rover+Yaya EVA eslik yuruyus hizi (km/saat)
      this.roverSpeedKmH = 14.5;        // Rover+Ekip birlesik seyir hizi (km/saat)
      this.pixelToKmFactor = 0.085;     // Krater ici piksel -> km donusum carpani
      this.o2LitersPerHour = 48.0;      // Saatlik O2 tuketimi (Litre)
      this.waterLitersPerHour = 2.15;   // Saatlik sogutma suyu tuketimi (Litre)
    }

    /**
     * Saati aktif dile gore "X saat Y dk" biciminde okunur metne donusturur
     */
    formatHours(totalHours) {
      const h = Math.floor(totalHours);
      const m = Math.round((totalHours - h) * 60);
      if (h >= 24) {
        const sols = Math.floor(h / 24);
        const remH = h % 24;
        if (ns.i18n) {
          return ns.i18n.t("durationHoursSols", { total: totalHours.toFixed(1), sols, rem: remH });
        }
        return `${totalHours.toFixed(1)} saat (~${sols} Sol ${remH} sa)`;
      }
      if (ns.i18n) {
        return ns.i18n.t("durationHoursMins", { h, m });
      }
      return `${h} saat ${m} dk`;
    }

    /**
     * Secili krater icindeki EVA duraklari icin birlesik Rover+Insan mavi rotayi hesaplar
     */
    computeCraterRoutes(crater, waypoints, options = {}) {
      if (!waypoints || waypoints.length < 2) {
        return { primaryBlue: null, secondaryPaleBlue: null };
      }

      const t = (k, v) => (ns.i18n ? ns.i18n.t(k, v) : k);
      const intensityTable = this.config.getIntensityTable();
      const acidSpec = intensityTable.acid[options.acidIntensity || "orta"];
      const stormSpec = intensityTable.storm[options.stormIntensity || "orta"];

      const primaryPoints = waypoints.map((wp, idx) => {
        let rx = wp.relX;
        let ry = wp.relY;
        if (options.filterDustStorm && wp.stormRisk) {
          rx += 15 * stormSpec.detourScale;
          ry -= 17 * stormSpec.detourScale;
        }
        if (options.filterAcidRain && wp.acidRisk) {
          rx -= 11 * acidSpec.detourScale;
          ry -= 13 * acidSpec.detourScale;
        }
        return { ...wp, relX: rx, relY: ry, stepIdx: idx };
      });

      let totalKm = 0;
      let totalHours = 0;
      const modeSpeed = options.expeditionMode === "joint-eva-escort" ? this.evaSpeedKmH : this.roverSpeedKmH;
      const useSpeed = Number(options.targetSpeedKmH) > 0 ? Number(options.targetSpeedKmH) : modeSpeed;

      for (let i = 0; i < primaryPoints.length - 1; i++) {
        const a = primaryPoints[i];
        const b = primaryPoints[i + 1];
        const distKm = Math.hypot(b.relX - a.relX, b.relY - a.relY) * this.pixelToKmFactor;
        const avgSlope = ((a.slope || 4) + (b.slope || 4)) / 2;
        const slopeFactor = Math.max(0.45, 1.0 - avgSlope / 46);
        let envFactor = 1.0;
        if (options.filterAcidRain && (a.acidRisk || b.acidRisk)) envFactor *= acidSpec.speedMult;
        if (options.filterDustStorm && (a.stormRisk || b.stormRisk)) envFactor *= stormSpec.speedMult;
        totalKm += distKm;
        totalHours += distKm / Math.max(0.5, useSpeed * slopeFactor * envFactor);
      }

      const steps = this.buildCraterSteps(crater, primaryPoints, totalHours, totalKm);
      const budgetMetrics = this.budget
        ? this.budget.computeRouteBudget({
            totalKm,
            steps,
            acidEnabled: Boolean(options.filterAcidRain),
            stormEnabled: Boolean(options.filterDustStorm),
            acidSpeedMult: acidSpec.speedMult,
            stormSpeedMult: stormSpec.speedMult,
            params: options,
            formatHoursFn: (h) => this.formatHours(h)
          })
        : {
            totalKm: Number(totalKm.toFixed(2)),
            totalMeters: Math.round(totalKm * 1000),
            totalHours: Number(totalHours.toFixed(2)),
            totalMinutes: Math.max(1, Math.round(totalHours * 60)),
            formattedDuration: this.formatHours(totalHours),
            o2Liters: Math.round(totalHours * this.o2LitersPerHour),
            waterLiters: Number((totalHours * this.waterLitersPerHour).toFixed(1))
          };

      return {
        scope: "crater",
        source: "local-fallback",
        primaryBlue: {
          ...budgetMetrics,
          points: primaryPoints,
          steps,
          colorHex: "#2563eb",
          label: t("blueRouteTitle"),
          comment: t("craterBlueComment", { name: crater.name, dur: budgetMetrics.formattedDuration, km: budgetMetrics.totalKm.toFixed(1) })
        },
        secondaryPaleBlue: null
      };
    }

    /**
     * Krater EVA durak noktalarindan step-by-step adim listesi uretir
     */
    buildCraterSteps(crater, pts, totalHours, totalKm) {
      if (!Array.isArray(pts) || pts.length === 0) return [];
      const t = (k, v) => (ns.i18n ? ns.i18n.t(k, v) : k);
      const denomKm = Math.max(0.01, totalKm || 1);
      const baseLat = crater && crater.coordinates ? crater.coordinates.lat : -4.59;
      const baseLon = crater && crater.coordinates ? crater.coordinates.lon : 137.44;
      return pts.map((wp, idx) => {
        const prev = idx > 0 ? pts[idx - 1] : wp;
        const legKm = idx === 0 ? 0 : Math.hypot(wp.relX - prev.relX, wp.relY - prev.relY) * this.pixelToKmFactor;
        const legHours = (legKm / denomKm) * (totalHours || 0);
        const lat = Number((baseLat - wp.relY * 0.008).toFixed(4));
        const lon = Number(this.geo.wrapLon(baseLon + wp.relX * 0.008).toFixed(4));
        const slopeDeg = Number((wp.slope || 4.5).toFixed(1));
        const elevM = Math.round(wp.elevationM !== undefined ? wp.elevationM : (-4200 + idx * 145));
        const hazardWarning = wp.acidRisk
          ? t("warnAcidCorridor")
          : (wp.stormRisk ? t("warnStormCorridor") : null);
        const wpTitle = wp.title || wp.name || `#${idx + 1}`;
        const instruction = idx === 0
          ? t("stepCraterStart", { name: wpTitle })
          : t("stepCraterMove", { name: wpTitle, km: legKm.toFixed(2), slope: slopeDeg });
        return {
          step: idx + 1,
          lat,
          lon,
          elevM,
          slopeDeg,
          distKm: Number(legKm.toFixed(2)),
          durationHours: Number(legHours.toFixed(2)),
          instruction,
          hazardWarning
        };
      });
    }

    /**
     * Herhangi iki {lat, lon} noktasi arasinda birlesik Rover+Insan step-by-step yedek rota uretir
     */
    computeRoutesBetweenCoords(origin, destination, options = {}) {
      if (!origin || !destination) return { primaryBlue: null, secondaryPaleBlue: null };

      const t = (k, v) => (ns.i18n ? ns.i18n.t(k, v) : k);
      const hzBundle = options.hazardBundle || this.hazardService.getGlobalHazardZones(options);
      const allHazards = [
        ...(hzBundle.acidZones || []).map((z) => ({ ...z, weight: 1.0 })),
        ...(hzBundle.stormZones || []).map((z) => ({ ...z, weight: 1.1 })),
        ...(hzBundle.radiationZones || []).map((z) => ({ ...z, weight: 0.85 }))
      ];

      const startPt = {
        id: origin.id || "custom-origin",
        name: origin.name || `${t("originWord")} (A)`,
        lat: Number(origin.lat || 0),
        lon: this.geo.wrapLon(Number(origin.lon || 0))
      };
      const endPt = {
        id: destination.id || "custom-destination",
        name: destination.name || `${t("destWord")} (B)`,
        lat: Number(destination.lat || 0),
        lon: this.geo.wrapLon(Number(destination.lon || 0))
      };

      const blueGeoPts = this.geo.buildSafeGlobalPath(startPt, endPt, allHazards, 1.0, 1);
      let totalKm = 0;
      for (let i = 0; i < blueGeoPts.length - 1; i++) {
        totalKm += this.geo.haversineMarsKm(blueGeoPts[i].lat, blueGeoPts[i].lon, blueGeoPts[i + 1].lat, blueGeoPts[i + 1].lon);
      }

      let speedMult = 1.0;
      if (options.filterAcidRain) speedMult *= (0.70 + 0.30 * hzBundle.acidSpec.speedMult);
      if (options.filterDustStorm) speedMult *= (0.68 + 0.32 * hzBundle.stormSpec.speedMult);
      const modeSpeed = options.expeditionMode === "joint-eva-escort" ? this.evaSpeedKmH : this.roverSpeedKmH;
      const baseSpeed = Number(options.targetSpeedKmH) > 0 ? Number(options.targetSpeedKmH) : modeSpeed;
      const roughHours = totalKm / Math.max(0.5, baseSpeed * speedMult);
      const steps = this.geo.buildStepsFromGeoPath(blueGeoPts, allHazards, roughHours, totalKm);

      const budgetMetrics = this.budget
        ? this.budget.computeRouteBudget({
            totalKm,
            steps,
            acidEnabled: Boolean(options.filterAcidRain),
            stormEnabled: Boolean(options.filterDustStorm),
            acidSpeedMult: hzBundle.acidSpec.speedMult,
            stormSpeedMult: hzBundle.stormSpec.speedMult,
            params: options,
            formatHoursFn: (h) => this.formatHours(h)
          })
        : {
            totalKm: Number(totalKm.toFixed(2)),
            totalMeters: Math.round(totalKm * 1000),
            totalHours: Number(roughHours.toFixed(2)),
            totalMinutes: Math.max(1, Math.round(roughHours * 60)),
            formattedDuration: this.formatHours(roughHours),
            o2Liters: Math.round(roughHours * this.o2LitersPerHour),
            waterLiters: Number((roughHours * this.waterLitersPerHour).toFixed(1))
          };

      return {
        scope: "global",
        source: "local-fallback",
        origin: startPt,
        destination: endPt,
        originName: startPt.name,
        targetName: endPt.name,
        primaryBlue: {
          ...budgetMetrics,
          points: blueGeoPts,
          steps,
          colorHex: "#2563eb",
          label: t("blueRouteTitle"),
          comment: t("globalBlueComment", { dur: budgetMetrics.formattedDuration, km: Math.round(budgetMetrics.totalKm) })
        },
        secondaryPaleBlue: null
      };
    }

    /**
     * Kuresel 2D/3D harita uzerinde iki inis sahasi/krater arasi Mavi rotayi hesaplar
     */
    computeGlobalRoutes(sites, originId, targetId, options = {}) {
      const startSite = sites.find((s) => s.id === originId) || sites[0];
      const endSite = sites.find((s) => s.id === targetId) || sites[1] || sites[0];
      if (!startSite || !endSite) return { primaryBlue: null, secondaryPaleBlue: null };
      return this.computeRoutesBetweenCoords(
        { id: startSite.id, name: startSite.name, lat: startSite.latitude, lon: startSite.longitude },
        { id: endSite.id, name: endSite.name, lat: endSite.latitude, lon: endSite.longitude },
        options
      );
    }
  }

  ns.RoutePlannerService = RoutePlannerService;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-8: JSDoc rota hesaplama servisi (Mavi en guvenli kisa yol + step-by-step adimlar + yol yorumlari).
   - Satir 10-31: constructor; MissionBudgetHelper baglantisi, fabrika birimleri (km/m, Saat/Dakika, Litre) ve hiz sabitleri.
   - Satir 33-50: formatHours; saat ve dakika/Sol cinsinden ulasim suresini bicimlendirir.
   - Satir 52-155: computeCraterRoutes ve buildCraterSteps; krater ici EVA duraklari icin adimli birlesik Mavi rota ve butce uretir.
   - Satir 157-244: computeRoutesBetweenCoords ve computeGlobalRoutes; iki {lat, lon} arasi Haversine mesafe, O2/Enerji/Su varis butcesi ve steps[] uretir.
   ========================================================================== */
