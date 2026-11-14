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
      const mapW = baseWidth * Math.min(Math.max(zoom, 0.65), 32.0);
      const mapH = mapW * 0.5;
      const vCenter = (90 - rotLat) / 180;
      const rawOy = height / 2 - vCenter * mapH;
      const oy = mapH <= height
        ? (height - mapH) * 0.5
        : Math.max(height - mapH, Math.min(0, rawOy));

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
    screenToMarsCoords3D(px, py, width, height, rotLat, rotLon, zoom, camPitch = 0, camYaw = 0, reliefScale = 1) {
      if (ns.marsTopo) {
        return ns.marsTopo.screenToElevatedMars3D(px, py, width, height, rotLat, rotLon, zoom, camPitch, camYaw, reliefScale);
      }
      const clampedZoom = Math.min(Math.max(zoom, 0.55), 80.0);
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.41 * clampedZoom;
      const pitchRad = (Math.max(0, Math.min(72, camPitch || 0)) * Math.PI) / 180;
      const yawRad = ((camYaw || 0) * Math.PI) / 180;
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
      const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
      const pivotZ = Math.max(0, Math.min(1, (clampedZoom - 1.1) / 1.1));
      const nx = (px - cx) / radius;
      const ny = (cy - py) / radius + pivotZ * sinP;
      const rSq = nx * nx + ny * ny;
      if (rSq > 1) return { lat: 0, lon: 0, insideMap: false };

      const nz = Math.sqrt(Math.max(0, 1 - rSq));
      const py3 = ny * cosP - nz * sinP;
      const pz3 = ny * sinP + nz * cosP;
      const east = nx * cosY + py3 * sinY;
      const north = -nx * sinY + py3 * cosY;
      const phi0 = (rotLat * Math.PI) / 180;
      const lam0 = (rotLon * Math.PI) / 180;

      const y0 = north * Math.cos(phi0) + pz3 * Math.sin(phi0);
      const z0 = -north * Math.sin(phi0) + pz3 * Math.cos(phi0);
      const phi = Math.asin(Math.max(-1, Math.min(1, y0)));
      const lambda = lam0 + Math.atan2(east, z0);

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
      const defaultDirs = ["Kuzey", "Kuzeydoğu", "Doğu", "Güneydoğu", "Güney", "Güneybatı", "Batı", "Kuzeybatı"];
      const dirs = (ns.i18n && Array.isArray(ns.i18n.t("cardinalDirs"))) ? ns.i18n.t("cardinalDirs") : defaultDirs;
      return dirs[Math.round(norm / 45) % 8];
    }

    /**
     * Kuresel rota nokta dizisinden step-by-step adim listesi uretir
     */
    buildStepsFromGeoPath(pts, hazards, totalHours, totalKm) {
      if (!Array.isArray(pts) || pts.length === 0) return [];
      const t = (k, v) => (ns.i18n ? ns.i18n.t(k, v) : k);
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
            hazardWarning = t("warnHazardDetour", { name: hz.name });
            break;
          }
        }

        let instruction;
        if (i === 0) {
          instruction = t("stepGlobalStart", { lat: cur.lat.toFixed(2), lon: cur.lon.toFixed(2) });
        } else if (i === pts.length - 1) {
          instruction = t("stepGlobalEnd", { lat: cur.lat.toFixed(2), lon: cur.lon.toFixed(2) });
        } else {
          const dir = this.getCardinalDirectionTr(prev.lat, prev.lon, cur.lat, cur.lon);
          instruction = t("stepGlobalMove", { dir, km: Math.round(legKm), slope: slopeDeg });
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

    /** Sabit Bulundugumuz Konum -> Secilen Hedef Konum uc noktalarini cozumler */
    resolveActiveEndpoints(state, _crater, _waypoints, landingSites) {
      const origPrefix = ns.i18n ? ns.i18n.t("originWord") : "Bulunduğumuz Konum";
      const destPrefix = ns.i18n ? ns.i18n.t("destWord") : "Hedef";
      const origin = { id: "curiosity-gale", name: origPrefix, lat: -4.5895, lon: 137.4417 };
      if (state.useCustomCoordinates && state.customDestination) {
        return { origin, destination: state.customDestination };
      }
      const list = landingSites || [];
      const e = list.find((item) => item.id === state.globalTargetId) || list[1] || list[0];
      return {
        origin,
        destination: e
          ? { id: e.id, name: e.name, lat: e.latitude, lon: e.longitude }
          : (state.customDestination || this.makeEndpointPoint("dest", destPrefix, 18.44, 77.45))
      };
    }

    /** Fare tekerlegi deltaY degerini tarayici moduna (px/line/page) gore normalize edip yeni zoom hesaplar */
    computeWheelTargetZoom(currentZoom, deltaY, deltaMode = 0, viewMode = "3d") {
      const unitScale = deltaMode === 1 ? 32 : (deltaMode === 2 ? 240 : 1);
      const clampedDelta = Math.max(-160, Math.min(160, (Number(deltaY) || 0) * unitScale));
      const maxZ = viewMode === "3d" ? 80.0 : 32.0;
      return Math.min(maxZ, Math.max(0.65, currentZoom * Math.pow(1.002, -clampedDelta)));
    }

    /** Ekran surukleme (dx, dy) deltasini 2D/3D (pitch/yaw uyumlu) Mars (stepLat, stepLon) acisina donusturur */
    computePanStep(dx, dy, vw, vh, state) {
      const zoom = state?.zoom || 1;
      if (state?.viewMode === "3d") {
        const radius = Math.min(vw, vh) * 0.41 * Math.min(Math.max(zoom, 0.55), 80.0);
        const degPerPx = 57.29578 / Math.max(80, radius);
        const pitchRad = (Math.max(0, Math.min(72, state.camPitch ?? 28)) * Math.PI) / 180;
        const cosP = Math.max(0.38, Math.cos(pitchRad));
        const yawRad = ((state.camYaw || 0) * Math.PI) / 180;
        const cosY = Math.cos(yawRad);
        const sinY = Math.sin(yawRad);
        const dx1 = -dx;
        const dy1 = dy / cosP;
        const dEast = dx1 * cosY + dy1 * sinY;
        const dNorth = -dx1 * sinY + dy1 * cosY;
        const cosLat = Math.max(0.35, Math.cos(((state.rotLat || 0) * Math.PI) / 180));
        return { stepLon: (dEast / cosLat) * degPerPx, stepLat: dNorth * degPerPx };
      }
      const mapW = Math.max(vw * 0.86, 620) * Math.min(Math.max(zoom, 0.65), 32.0);
      return { stepLon: (-dx / mapW) * 360, stepLat: (dy / (mapW * 0.5)) * 180 };
    }

    /** Verilen ekran pikselini (px, py) zoom degisiminde Mars yuzeyinde sabit tutan (rotLat, rotLon, zoom) hesaplar */
    computeZoomToPoint(opts) {
      const {
        px, py, width, height, viewMode = "3d",
        rotLat = 0, rotLon = 0, zoom = 1, nextZoom = 1,
        camPitch = 0, camYaw = 0, reliefScale = 1
      } = opts || {};
      const maxZ = viewMode === "3d" ? 80.0 : 32.0;
      const targetZoom = Math.min(maxZ, Math.max(0.65, nextZoom));
      if (!Number.isFinite(px) || !Number.isFinite(py) || !(width > 0) || !(height > 0)) {
        return { rotLat, rotLon, zoom: targetZoom };
      }
      if (viewMode !== "3d") {
        return this._computeZoomToPoint2D(px, py, width, height, rotLat, rotLon, zoom, targetZoom);
      }
      return this._computeZoomToPoint3D(px, py, width, height, rotLat, rotLon, zoom, targetZoom, camPitch, camYaw, reliefScale);
    }

    /** 2D Equirectangular haritada imlec altindaki cografi noktayi sabit tutarak zoom kamera merkezini cozer */
    _computeZoomToPoint2D(px, py, width, height, rotLat, rotLon, zoom, targetZoom) {
      const baseWidth = Math.max(width * 0.86, 620);
      const mapW1 = baseWidth * Math.min(Math.max(zoom, 0.65), 32.0);
      const mapH1 = mapW1 * 0.5;
      const rawOy1 = height / 2 - ((90 - rotLat) / 180) * mapH1;
      const oy1 = mapH1 <= height ? (height - mapH1) * 0.5 : Math.max(height - mapH1, Math.min(0, rawOy1));
      const targetLon = this.wrapLon(rotLon + ((px - width / 2) / mapW1) * 360);
      const targetLat = Math.max(-84, Math.min(84, 90 - ((py - oy1) / mapH1) * 180));

      const mapW2 = baseWidth * targetZoom;
      const mapH2 = mapW2 * 0.5;
      const nextLon = this.wrapLon(targetLon - ((px - width / 2) / mapW2) * 360);
      const nextLat = Math.max(-82, Math.min(82, targetLat + ((py - height / 2) / mapH2) * 180));
      return { rotLat: nextLat, rotLon: nextLon, zoom: targetZoom };
    }

    /** 3D kabartmali kurede (pitch/yaw/pivotZ/MOLA dahil) imlec altindaki noktayi sabit tutan kamera merkezini cozer */
    _computeZoomToPoint3D(px, py, width, height, rotLat, rotLon, zoom, targetZoom, camPitch, camYaw, reliefScale) {
      const z1 = Math.min(Math.max(zoom, 0.55), 80.0);
      const hit = this.screenToMarsCoords3D(px, py, width, height, rotLat, rotLon, z1, camPitch, camYaw, reliefScale);
      if (!hit || !hit.insideMap) {
        return { rotLat, rotLon, zoom: targetZoom };
      }

      const cx = width / 2;
      const cy = height / 2;
      const radius2 = Math.min(width, height) * 0.41 * targetZoom;
      const pitchRad = (Math.max(0, Math.min(72, camPitch || 0)) * Math.PI) / 180;
      const yawRad = ((camYaw || 0) * Math.PI) / 180;
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
      const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
      const pivotZ2 = Math.max(0, Math.min(1, (targetZoom - 1.1) / 1.1));
      const topo = ns.marsTopo;
      const elevM = (topo && reliefScale > 0) ? topo.getElevationMeters(hit.lat, hit.lon) : 0;
      const radFactor2 = (topo && reliefScale > 0) ? topo.getRadialScaleFactor(targetZoom, camPitch, reliefScale) : 0;
      const rScale2 = 1.0 + elevM * radFactor2;

      let sx = (px - cx) / radius2;
      let sy = (cy - py) / radius2;
      const sySphere = sy + pivotZ2 * sinP;
      const distSphere = Math.hypot(sx, sySphere);
      const maxSphereR = rScale2 * 0.996;
      if (distSphere > maxSphereR) {
        const k = maxSphereR / distSphere;
        sx *= k;
        sy = sySphere * k - pivotZ2 * sinP;
      }

      const B = pivotZ2 * cosP;
      const C = sx * sx + sy * sy + pivotZ2 * pivotZ2 + 2 * pivotZ2 * sy * sinP - rScale2 * rScale2;
      const disc = B * B - C;
      if (disc < 0) return { rotLat, rotLon, zoom: targetZoom };

      const zRot = -B + Math.sqrt(disc);
      const py3 = sy * cosP - zRot * sinP;
      const pz3 = pivotZ2 + sy * sinP + zRot * cosP;
      const x1 = sx / rScale2;
      const y1 = py3 / rScale2;
      const z1U = pz3 / rScale2;

      const eastStar = x1 * cosY + y1 * sinY;
      const northStar = -x1 * sinY + y1 * cosY;
      const upStar = z1U;

      const phi = (hit.lat * Math.PI) / 180;
      const y0 = Math.sin(phi);
      const rNuSq = northStar * northStar + upStar * upStar;
      const z0Sq = rNuSq - y0 * y0;
      if (z0Sq <= 1e-8) {
        const signY = y0 >= 0 ? 1 : -1;
        const nextLat = Math.max(-84, Math.min(84, (Math.atan2(upStar * signY, northStar * signY) * 180) / Math.PI));
        const dLam = Math.atan2(eastStar, 0);
        return { rotLat: nextLat, rotLon: this.wrapLon(hit.lon - (dLam * 180) / Math.PI), zoom: targetZoom };
      }

      const denom = y0 * y0 + z0Sq;
      const z0Abs = Math.sqrt(z0Sq);
      let best = null;
      for (const z0Cand of [z0Abs, -z0Abs]) {
        const phi0Rad = Math.atan2((upStar * y0 - northStar * z0Cand) / denom, (northStar * y0 + upStar * z0Cand) / denom);
        const latCand = (phi0Rad * 180) / Math.PI;
        if (Math.abs(latCand) > 90) continue;
        const dLam = Math.atan2(eastStar, z0Cand);
        const lonCand = this.wrapLon(hit.lon - (dLam * 180) / Math.PI);
        const err = Math.abs(latCand - rotLat) + Math.abs(this.shortestDeltaLon(rotLon, lonCand));
        if (!best || err < best.err) {
          best = { lat: Math.max(-84, Math.min(84, latCand)), lon: lonCand, err };
        }
      }
      return best ? { rotLat: best.lat, rotLon: best.lon, zoom: targetZoom } : { rotLat, rotLon, zoom: targetZoom };
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
   - Satir 107-174: screenToMarsCoords2D & screenToMarsCoords3D; ekran tiklamasini Mars (lat, lon) koordinatina cevirir.
   - Satir 176-256: estimateElevationM, getCardinalDirectionTr, buildStepsFromGeoPath ve makeEndpointPoint; adim listesi ve uc nokta uretir.
   - Satir 258-395: resolveActiveEndpoints, computeWheelTargetZoom, computePanStep ve computeZoomToPoint (_2D/_3D); 2D/3D surukleme ve imlec odakli zoom matematigi.
   ========================================================================== */
