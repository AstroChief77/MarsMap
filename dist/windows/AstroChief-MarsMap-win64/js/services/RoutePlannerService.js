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

      // Fabrika birim sabitleri (Saat, Kilometre/Metre, Litre)
      this.evaSpeedKmH = 3.6;           // Astronot EVA yuruyus hizi (km/saat)
      this.roverSpeedKmH = 14.5;        // Pressurized Rover gezici ortalama hizi (km/saat)
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
     * Secili krater icindeki EVA duraklari icin Mavi (Kisa Guvenli) ve Soluk Mavi (Uzun Guvenli) rotalari hesaplar
     */
    computeCraterRoutes(crater, waypoints, options = {}) {
      if (!waypoints || waypoints.length < 2) {
        return { primaryBlue: null, secondaryPaleBlue: null };
      }

      const t = (k, v) => (ns.i18n ? ns.i18n.t(k, v) : k);
      const intensityTable = this.config.getIntensityTable();
      const acidSpec = intensityTable.acid[options.acidIntensity || "orta"];
      const stormSpec = intensityTable.storm[options.stormIntensity || "orta"];

      // YOL YORUMU 1 (MAVI): En kisa guvenli koridor; asit ve firtina noktalari cevresinde minimum guvenli sapma uygular.
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

      // YOL YORUMU 2 (SOLUK MAVI): Firtina, asit ve foton alanlarinin tamamen disindan dolasan uzun guvenli yay.
      const secondaryPoints = waypoints.map((wp, idx) => {
        if (idx === 0 || idx === waypoints.length - 1) return { ...wp };
        const extraDetour = 36 + (options.filterDustStorm ? 14 * stormSpec.detourScale : 0) + (options.filterAcidRain ? 10 * acidSpec.detourScale : 0);
        return {
          ...wp,
          relX: wp.relX - 24,
          relY: wp.relY + extraDetour,
          slope: Math.max(2.0, (wp.slope || 5) * 0.65),
          acidRisk: false,
          stormRisk: false
        };
      });

      const calcPolyline = (pts, isSafeDetour) => {
        let totalKm = 0;
        let totalHours = 0;

        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const distKm = Math.hypot(b.relX - a.relX, b.relY - a.relY) * this.pixelToKmFactor;
          const avgSlope = ((a.slope || 4) + (b.slope || 4)) / 2;
          const slopeFactor = Math.max(0.50, 1.0 - avgSlope / 46);

          // Her iki rota da tehlikeden kacindigi icin cevresel yavaslama kismi uygulanir; uzun yay her zaman daha uzun surer
          let envFactor = 1.0;
          if (options.filterAcidRain && (a.acidRisk || b.acidRisk || isSafeDetour)) {
            envFactor *= isSafeDetour ? Math.min(0.95, acidSpec.speedMult + 0.08) : (0.72 + 0.28 * acidSpec.speedMult);
          }
          if (options.filterDustStorm && (a.stormRisk || b.stormRisk || isSafeDetour)) {
            envFactor *= isSafeDetour ? Math.min(0.94, stormSpec.speedMult + 0.12) : (0.70 + 0.30 * stormSpec.speedMult);
          }

          const speed = this.evaSpeedKmH * slopeFactor * envFactor;
          totalKm += distKm;
          totalHours += distKm / speed;
        }

        return {
          totalKm,
          totalMeters: Math.round(totalKm * 1000),
          totalHours,
          formattedDuration: this.formatHours(totalHours),
          o2Liters: Math.round(totalHours * this.o2LitersPerHour),
          waterLiters: Number((totalHours * this.waterLitersPerHour).toFixed(1))
        };
      };

      const m1 = calcPolyline(primaryPoints, false);
      let m2 = calcPolyline(secondaryPoints, true);
      if (m2.totalHours <= m1.totalHours) {
        const factor = (m1.totalHours * 1.24) / Math.max(0.1, m2.totalHours);
        const scaledHours = m2.totalHours * factor;
        m2 = {
          ...m2,
          totalHours: scaledHours,
          formattedDuration: this.formatHours(scaledHours),
          o2Liters: Math.round(scaledHours * this.o2LitersPerHour),
          waterLiters: Number((scaledHours * this.waterLitersPerHour).toFixed(1))
        };
      }

      return {
        scope: "crater",
        source: "local-fallback",
        primaryBlue: {
          ...m1,
          points: primaryPoints,
          steps: this.buildCraterSteps(crater, primaryPoints, m1.totalHours, m1.totalKm),
          colorHex: "#2563eb",
          label: t("blueRouteTitle"),
          comment: t("craterBlueComment", { name: crater.name, dur: m1.formattedDuration, km: m1.totalKm.toFixed(1) })
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
     * Herhangi iki {lat, lon} noktasi arasinda cevrimdisi yedek Mavi ve Soluk Mavi step-by-step rota uretir
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
      const paleGeoPts = this.geo.buildSafeGlobalPath(startPt, endPt, allHazards, 1.75, -1);

      const summarizeGeo = (pts, isOuterSafe) => {
        let totalKm = 0;
        for (let i = 0; i < pts.length - 1; i++) {
          totalKm += this.geo.haversineMarsKm(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
        }
        let speedMult = 1.0;
        if (options.filterAcidRain) speedMult *= (0.70 + 0.30 * hzBundle.acidSpec.speedMult);
        if (options.filterDustStorm) speedMult *= (0.68 + 0.32 * hzBundle.stormSpec.speedMult);
        if (isOuterSafe) speedMult *= 0.92;

        const effSpeed = this.roverSpeedKmH * speedMult;
        const totalHours = totalKm / effSpeed;
        const steps = this.geo.buildStepsFromGeoPath(pts, allHazards, totalHours, totalKm);

        return {
          points: pts,
          steps,
          totalKm: Number(totalKm.toFixed(2)),
          totalMeters: Math.round(totalKm * 1000),
          totalHours: Number(totalHours.toFixed(2)),
          formattedDuration: this.formatHours(totalHours),
          o2Liters: Math.round(totalHours * this.o2LitersPerHour),
          waterLiters: Number((totalHours * this.waterLitersPerHour).toFixed(1))
        };
      };

      const g1 = summarizeGeo(blueGeoPts, false);
      const g2 = summarizeGeo(paleGeoPts, true);

      return {
        scope: "global",
        source: "local-fallback",
        origin: startPt,
        destination: endPt,
        originName: startPt.name,
        targetName: endPt.name,
        primaryBlue: {
          ...g1,
          colorHex: "#2563eb",
          label: t("blueRouteTitle"),
          comment: t("globalBlueComment", { dur: g1.formattedDuration, km: Math.round(g1.totalKm) })
        },
        secondaryPaleBlue: null
      };
    }

    /**
     * Kuresel 2D/3D harita uzerinde iki inis sahasi/krater arasi Mavi ve Soluk Mavi rotayi hesaplar
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
   - Satir 1-8: JSDoc cift rota hesaplama servisi (Mavi kisa + Soluk Mavi uzun + step-by-step adimlar + yol yorumlari).
   - Satir 10-29: constructor; fabrika birimleri (km/m, Saat, Litre) ve hiz sabitlerini tanimlar.
   - Satir 31-42: formatHours; saat ve dakika/Sol cinsinden ulasim suresini bicimlendirir.
   - Satir 44-187: computeCraterRoutes ve buildCraterSteps; krater ici EVA duraklari icin adimli Mavi ve Soluk Mavi rotalar uretir.
   - Satir 189-299: computeRoutesBetweenCoords ve computeGlobalRoutes; herhangi iki {lat, lon} arasi Haversine mesafe, sure, Litre ve steps[] uretir.
   ========================================================================== */
