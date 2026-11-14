/**
 * @file RouteGeometryHelper.js
 * @description Kuresel Haversine mesafe olcumu ve tehlike merkezlerinden kacinan guvenli yol egri geometrileri.
 * Karmaşıklığı azaltmak için saf matematiksel rota fonksiyonları ayrı modülde tutulmuştur.
 */

(function (ns) {
  "use strict";
  class RouteGeometryHelper {
    /**
     * Mars ortalama yaricapi uzerinden iki (lat, lon) noktasi arasindaki gercek mesafeyi (km) hesaplar
     * @param {number} lat1 - Baslangic enlemi
     * @param {number} lon1 - Baslangic boylami
     * @param {number} lat2 - Hedef enlemi
     * @param {number} lon2 - Hedef boylami
     * @returns {number} Kilometre cinsinden yuzey mesafesi
     */
    haversineMarsKm(lat1, lon1, lat2, lon2) {
      const marsRadiusKm = 3389.5;
      const toRad = Math.PI / 180;
      const dLat = (lat2 - lat1) * toRad;
      let dLonDeg = lon2 - lon1;
      if (dLonDeg > 180) dLonDeg -= 360;
      if (dLonDeg < -180) dLonDeg += 360;
      const dLon = dLonDeg * toRad;

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return marsRadiusKm * c;
    }

    /**
     * Boylam farkini [-180, 180] araligina normalize eder
     */
    shortestDeltaLon(lonA, lonB) {
      let d = lonB - lonA;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      return d;
    }

    /**
     * Boylami [-180, 180] araliginda tutar
     */
    wrapLon(lon) {
      return ((lon + 180) % 360 + 360) % 360 - 180;
    }

    /**
     * Iki cografik nokta arasinda aktif tehlike merkezlerinden (Asit Yagmuru, Firtina, Foton)
     * itici vektorlerle kacinan coklu ara noktali guvenli rota geometrisi uretir
     * @param {Object} start - {lat, lon, name}
     * @param {Object} end - {lat, lon, name}
     * @param {Array} hazards - {lat, lon, radiusDeg, weight}
     * @param {number} safetyMarginMult - 1.0 (Mavi kisa yol) veya 1.85 (Soluk Mavi uzun guvenli yay)
     * @param {number} biasSign - Uzun yedek yol icin acisal yay yonu (+1 / -1)
     * @returns {Array} [{lat, lon}] nokta dizisi
     */
    buildSafeGlobalPath(start, end, hazards, safetyMarginMult = 1.0, biasSign = 1) {
      const steps = 16;
      const dLon = this.shortestDeltaLon(start.lon, end.lon);
      const dLat = end.lat - start.lat;
      const pathLenDeg = Math.hypot(dLat, dLon) || 1;
      const perpLat = (-dLon / pathLenDeg) * biasSign;
      const perpLon = (dLat / pathLenDeg) * biasSign;

      const pts = [];
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        let lat = start.lat + dLat * t;
        let lon = start.lon + dLon * t;

        // Yol uzerindeki tehlikelere yakinsa guvenli cevre yayi uygula (uclar yumusak tapering ile)
        if (i > 0 && i < steps) {
          const envelope = Math.sin(t * Math.PI);

          // Soluk Mavi (uzun guvenli yol) icin dogal genis koridor yayi
          if (safetyMarginMult > 1.2) {
            const arcDeg = Math.min(28, pathLenDeg * 0.34) * (safetyMarginMult - 0.7) * envelope;
            lat += perpLat * arcDeg;
            lon += perpLon * arcDeg;
          }

          // Her bir aktif Asit / Firtina / Foton bolgesinden uclarla uyumlu itme kuvveti uygula
          for (const hz of hazards) {
            const hLonDiff = this.shortestDeltaLon(hz.lon, lon);
            const hLatDiff = lat - hz.lat;
            const dist = Math.hypot(hLatDiff, hLonDiff);
            const avoidRadius = Math.min(28, hz.radiusDeg * (0.95 * safetyMarginMult));

            if (dist < avoidRadius) {
              const rawPush = (avoidRadius - dist) * (hz.weight || 0.95) * (0.35 + 0.65 * envelope);
              const pushStrength = Math.min(20, rawPush);
              if (dist < 0.5) {
                lat += perpLat * pushStrength;
                lon += perpLon * pushStrength;
              } else {
                lat += (hLatDiff / dist) * pushStrength;
                lon += (hLonDiff / dist) * pushStrength;
              }
            }
          }
        }

        pts.push({
          lat: Math.max(-84, Math.min(84, lat)),
          lon: this.wrapLon(lon)
        });
      }
      return pts;
    }

    /**
     * 2D harita ekran pikselini Mars (lat, lon) koordinatina cevirir
     */
    screenToMarsCoords2D(px, py, width, height, rotLat, rotLon, zoom) {
      const baseWidth = Math.max(width * 0.86, 620);
      const mapW = baseWidth * Math.min(Math.max(zoom, 0.65), 4.5);
      const mapH = mapW * 0.5;
      const vCenter = (90 - rotLat) / 180;
      const oy = height / 2 - vCenter * mapH;

      const dLon = ((px - width / 2) / mapW) * 360;
      const rawLat = 90 - ((py - oy) / mapH) * 180;
      const insideMap = rawLat >= -90 && rawLat <= 90;
      const lat = Math.max(-84, Math.min(84, rawLat));
      const lon = this.wrapLon(rotLon + dLon);
      return { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)), insideMap };
    }

    /**
     * 3D kure ekran pikselini Mars (lat, lon) koordinatina cevirir
     */
    screenToMarsCoords3D(px, py, width, height, rotLat, rotLon, zoom) {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.41 * Math.min(Math.max(zoom, 0.55), 3.2);
      const nx = (px - cx) / radius;
      const ny = (cy - py) / radius;
      const rSq = nx * nx + ny * ny;
      if (rSq > 1) return { lat: 0, lon: 0, insideMap: false };

      const nz = Math.sqrt(Math.max(0, 1 - rSq));
      const phi0 = (rotLat * Math.PI) / 180;
      const lam0 = (rotLon * Math.PI) / 180;

      const y0 = ny * Math.cos(phi0) + nz * Math.sin(phi0);
      const z0 = -ny * Math.sin(phi0) + nz * Math.cos(phi0);
      const phi = Math.asin(Math.max(-1, Math.min(1, y0)));
      const lambda = lam0 + Math.atan2(nx, z0);

      const lat = Math.max(-84, Math.min(84, (phi * 180) / Math.PI));
      const lon = this.wrapLon((lambda * 180) / Math.PI);
      return { lat: Number(lat.toFixed(4)), lon: Number(lon.toFixed(4)), insideMap: true };
    }

    /** Topografik yukseklik (m) tahmini (yerel yedek rota adimlari icin) */
    estimateElevationM(lat, lon) {
      const tharsisDist = Math.hypot(lat - 5, this.shortestDeltaLon(lon, -110));
      const hellasDist = Math.hypot(lat + 42, this.shortestDeltaLon(lon, 70));
      const northBasin = lat > 15 ? -2600 : 850;
      const tharsisPeak = tharsisDist < 38 ? (38 - tharsisDist) * 185 : 0;
      const hellasDip = hellasDist < 28 ? -(28 - hellasDist) * 195 : 0;
      const ripple = Math.sin(lat * 0.22) * 420 + Math.cos(lon * 0.17) * 360;
      return Math.round(northBasin + tharsisPeak + hellasDip + ripple);
    }

    getCardinalDirectionTr(lat1, lon1, lat2, lon2) {
      const dLat = lat2 - lat1;
      const dLon = this.shortestDeltaLon(lon1, lon2);
      const ang = (Math.atan2(dLon, dLat) * 180) / Math.PI;
      const norm = (ang + 360) % 360;
      const dirs = ["Kuzey", "Kuzeydoğu", "Doğu", "Güneydoğu", "Güney", "Güneybatı", "Batı", "Kuzeybatı"];
      return dirs[Math.round(norm / 45) % 8];
    }

    /**
     * Kuresel rota nokta dizisinden step-by-step adim listesi uretir
     */
    buildStepsFromGeoPath(pts, hazards, totalHours, totalKm) {
      if (!Array.isArray(pts) || pts.length === 0) return [];
      const denomKm = Math.max(0.01, totalKm || 1);
      const steps = [];

      for (let i = 0; i < pts.length; i++) {
        const cur = pts[i];
        const prev = i > 0 ? pts[i - 1] : cur;
        const legKm = i === 0 ? 0 : this.haversineMarsKm(prev.lat, prev.lon, cur.lat, cur.lon);
        const legHours = (legKm / denomKm) * (totalHours || 0);
        const elevM = this.estimateElevationM(cur.lat, cur.lon);
        const prevElev = this.estimateElevationM(prev.lat, prev.lon);
        const riseKm = Math.abs(elevM - prevElev) / 1000;
        const rawSlope = legKm > 0.5 ? (Math.atan2(riseKm * 2.4, legKm) * 180) / Math.PI : 1.5;
        const slopeDeg = Number(Math.min(24.0, Math.max(1.2, rawSlope + (i % 3) * 0.9)).toFixed(1));

        let hazardWarning = null;
        for (const hz of hazards || []) {
          const d = Math.hypot(cur.lat - hz.lat, this.shortestDeltaLon(hz.lon, cur.lon));
          if (d < hz.radiusDeg * 1.45) {
            hazardWarning = `${hz.name} çevresinden güvenli sapma`;
            break;
          }
        }

        let instruction;
        if (i === 0) {
          instruction = `Başlangıç (${cur.lat.toFixed(2)}°, ${cur.lon.toFixed(2)}°): Etkenler doğrulandı, çıkış`;
        } else if (i === pts.length - 1) {
          instruction = `Varış (${cur.lat.toFixed(2)}°, ${cur.lon.toFixed(2)}°): Güvenli park ve görev sonu`;
        } else {
          const dir = this.getCardinalDirectionTr(prev.lat, prev.lon, cur.lat, cur.lon);
          instruction = `${dir} yönünde ${Math.round(legKm)} km ilerle (Eğim ${slopeDeg}°)`;
        }

        steps.push({
          step: i + 1,
          lat: Number(cur.lat.toFixed(4)),
          lon: Number(cur.lon.toFixed(4)),
          elevM,
          slopeDeg,
          distKm: Number(legKm.toFixed(2)),
          durationHours: Number(legHours.toFixed(2)),
          instruction,
          hazardWarning
        });
      }
      return steps;
    }

    /** Koordinat ciftini sinirlayip standart Konum/Varis uc noktasi nesnesi olusturur */
    makeEndpointPoint(id, labelPrefix, rawLat, rawLon) {
      const lat = Math.max(-84, Math.min(84, Number(Number(rawLat || 0).toFixed(4))));
      const lon = Number(this.wrapLon(Number(rawLon || 0)).toFixed(4));
      return { id, name: `${labelPrefix} (${lat.toFixed(1)}°, ${lon.toFixed(1)}°)`, lat, lon };
    }

    /** Aktif mod (crater/global) ve state'e gore gecerli A -> B noktalarini cozumler */
    resolveActiveEndpoints(state, crater, waypoints, landingSites) {
      if (state.routeScope === "crater") {
        const lastWp = waypoints && waypoints[waypoints.length - 1];
        const baseLat = crater ? crater.coordinates.lat : -4.59;
        const baseLon = crater ? crater.coordinates.lon : 137.44;
        return {
          origin: { id: crater ? crater.id : "crater", name: crater ? crater.name : "Krater", lat: baseLat, lon: baseLon },
          destination: {
            id: lastWp ? lastWp.id : "crater-end",
            name: lastWp ? lastWp.name : "EVA Hedef",
            lat: Number((baseLat - ((lastWp ? lastWp.relY : -20) * 0.008)).toFixed(4)),
            lon: Number(this.wrapLon(baseLon + ((lastWp ? lastWp.relX : 20) * 0.008)).toFixed(4))
          }
        };
      }
      if (state.useCustomCoordinates && state.customOrigin && state.customDestination) {
        return { origin: state.customOrigin, destination: state.customDestination };
      }
      const list = landingSites || [];
      const s = list.find((item) => item.id === state.globalOriginId) || list[0];
      const e = list.find((item) => item.id === state.globalTargetId) || list[1] || s;
      return {
        origin: s ? { id: s.id, name: s.name, lat: s.latitude, lon: s.longitude } : (state.customOrigin || this.makeEndpointPoint("origin", "Konum", -4.59, 137.44)),
        destination: e ? { id: e.id, name: e.name, lat: e.latitude, lon: e.longitude } : (state.customDestination || this.makeEndpointPoint("dest", "Varış", 18.44, 77.45))
      };
    }
  }

  ns.RouteGeometryHelper = RouteGeometryHelper;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc kuresel rota geometrisi, ters projeksiyon ve adim uretici matematik yardimcisi.
   - Satir 7-45: haversineMarsKm, shortestDeltaLon, wrapLon kuresel trigonometri ve boylam normalize metodlari.
   - Satir 47-105: buildSafeGlobalPath; Asit/Firtina/Foton dairelerinden itici vektorlerle kacinan Mavi/Soluk Mavi rota noktalari uretir.
   - Satir 107-146: screenToMarsCoords2D & screenToMarsCoords3D; ekran tiklamasini Mars (lat, lon) koordinatina cevirir.
   - Satir 148-221: estimateElevationM ve buildStepsFromGeoPath; yukseklik, egim ve tehlike uyarili step-by-step adim listesi uretir.
   - Satir 223-267: makeEndpointPoint ve resolveActiveEndpoints; krater/kuresel Konum (A) -> Varis (B) uc noktalarini uretir.
   ========================================================================== */
