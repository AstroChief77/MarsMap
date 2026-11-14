/**
 * @file RoutePlannerService.js
 * @description Asit yagmuru, kum firtinasi (siddetleriyle) ve Alfa/Beta/Gama foton bolgelerini hesaplayarak:
 * 1) Mavi (#2563eb): En guvenli ve en kisa yol
 * 2) Soluk Mavi (#93c5fd): Yine guvenli ama daha uzun alternatif yol
 * rotalarini kilometre/metre, saat ve Litre (O2 + Su) cinsinden hesaplayan sinif.
 * Her rota uzerinde gosterilecek yol yorumlarini ("yollarda yorum satiri") uretir.
 */

import { AppConfig } from "../models/AppConfig.js";
import { HazardFieldService } from "./HazardFieldService.js";
import { RouteGeometryHelper } from "./RouteGeometryHelper.js";

export class RoutePlannerService {
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
   * Saati "X saat Y dk" biciminde okunur metne donusturur
   */
  formatHours(totalHours) {
    const h = Math.floor(totalHours);
    const m = Math.round((totalHours - h) * 60);
    if (h >= 24) {
      const sols = Math.floor(h / 24);
      const remH = h % 24;
      return `${totalHours.toFixed(1)} saat (~${sols} Sol ${remH} sa)`;
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
        const slopeFactor = Math.max(0.42, 1.0 - avgSlope / 42);

        let envFactor = 1.0;
        if (!isSafeDetour) {
          if (options.filterAcidRain && (a.acidRisk || b.acidRisk)) envFactor *= acidSpec.speedMult;
          if (options.filterDustStorm && (a.stormRisk || b.stormRisk)) envFactor *= stormSpec.speedMult;
        } else {
          // Uzun guvenli yay risk disi kaldigi icin minimum yavaslama yasar
          envFactor = 0.96;
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
    const m2 = calcPolyline(secondaryPoints, true);

    return {
      scope: "crater",
      primaryBlue: {
        ...m1,
        points: primaryPoints,
        colorHex: "#2563eb",
        label: "En Güvenli Kısa Yol (Mavi)",
        comment: `// Mavi Yol: ${crater.name} güvenli en kısa rota — ${m1.formattedDuration} sürer (${m1.totalKm.toFixed(1)} km)`
      },
      secondaryPaleBlue: {
        ...m2,
        points: secondaryPoints,
        colorHex: "#93c5fd",
        label: "Güvenli Uzun Alternatif Yol (Soluk Mavi)",
        comment: `// Soluk Mavi: Fırtına/asit/foton dışı güvenli uzun yay — ${m2.formattedDuration} sürer (${m2.totalKm.toFixed(1)} km)`
      }
    };
  }

  /**
   * Kuresel 2D/3D harita uzerinde iki inis sahasi/krater arasi Mavi ve Soluk Mavi rotayi hesaplar
   */
  computeGlobalRoutes(sites, originId, targetId, options = {}) {
    const startSite = sites.find((s) => s.id === originId) || sites[0];
    const endSite = sites.find((s) => s.id === targetId) || sites[1] || sites[0];
    if (!startSite || !endSite) return { primaryBlue: null, secondaryPaleBlue: null };

    const hzBundle = this.hazardService.getGlobalHazardZones(options);
    const allHazards = [
      ...hzBundle.acidZones.map((z) => ({ ...z, weight: 1.05 })),
      ...hzBundle.stormZones.map((z) => ({ ...z, weight: 1.2 })),
      ...hzBundle.radiationZones.map((z) => ({ ...z, weight: 0.9 }))
    ];

    const startPt = { lat: startSite.latitude, lon: this.geo.wrapLon(startSite.longitude), name: startSite.name };
    const endPt = { lat: endSite.latitude, lon: this.geo.wrapLon(endSite.longitude), name: endSite.name };

    // YOL YORUMU (MAVI): Aktif asit/firtina/foton merkezlerinin kenarindan dolanan en kisa guvenli gezici rotasi
    const blueGeoPts = this.geo.buildSafeGlobalPath(startPt, endPt, allHazards, 1.0, 1);
    // YOL YORUMU (SOLUK MAVI): Tum firtina ve asit kusaklarinin genis dis cemberinden dolanan guvenli uzun yol
    const paleGeoPts = this.geo.buildSafeGlobalPath(startPt, endPt, allHazards, 1.85, -1);

    const summarizeGeo = (pts, isOuterSafe) => {
      let totalKm = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        totalKm += this.geo.haversineMarsKm(pts[i].lat, pts[i].lon, pts[i + 1].lat, pts[i + 1].lon);
      }
      let speedMult = 1.0;
      if (!isOuterSafe) {
        if (options.filterAcidRain) speedMult *= hzBundle.acidSpec.speedMult;
        if (options.filterDustStorm) speedMult *= hzBundle.stormSpec.speedMult;
      } else {
        speedMult = 0.94;
      }
      const effSpeed = this.roverSpeedKmH * speedMult;
      const totalHours = totalKm / effSpeed;

      return {
        points: pts,
        totalKm,
        totalMeters: Math.round(totalKm * 1000),
        totalHours,
        formattedDuration: this.formatHours(totalHours),
        o2Liters: Math.round(totalHours * this.o2LitersPerHour),
        waterLiters: Number((totalHours * this.waterLitersPerHour).toFixed(1))
      };
    };

    const g1 = summarizeGeo(blueGeoPts, false);
    const g2 = summarizeGeo(paleGeoPts, true);

    return {
      scope: "global",
      originName: startSite.name,
      targetName: endSite.name,
      primaryBlue: {
        ...g1,
        colorHex: "#2563eb",
        label: "En Güvenli Kısa Yol (Mavi)",
        comment: `// Mavi Yol: En güvenli & kısa rota — ${g1.formattedDuration} (${Math.round(g1.totalKm)} km)`
      },
      secondaryPaleBlue: {
        ...g2,
        colorHex: "#93c5fd",
        label: "Güvenli Uzun Alternatif Yol (Soluk Mavi)",
        comment: `// Soluk Mavi: Fırtına/asit dışı güvenli uzun rota — ${g2.formattedDuration} (${Math.round(g2.totalKm)} km)`
      }
    };
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-8: JSDoc cift rota hesaplama servisi (Mavi kisa + Soluk Mavi uzun + yol yorumlari + sure).
   - Satir 10-29: constructor; fabrika birimleri (km/m, Saat, Litre) ve hiz sabitlerini tanimlar.
   - Satir 31-42: formatHours; saat ve dakika/Sol cinsinden ulasim suresini bicimlendirir.
   - Satir 44-129: computeCraterRoutes; krater ici EVA duraklari icin asit/firtina siddetli Mavi ve Soluk Mavi yollari, yol yorumlarini ve sureyi hesaplar.
   - Satir 131-196: computeGlobalRoutes; iki Mars bolgesi arasinda Haversine km/m mesafesi, varis suresi (saat), Litre tuketimi ve yol yorumlarini uretir.
   ========================================================================== */
