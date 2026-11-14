/**
 * @file MolaAStarGridHelper.js
 * @description Kuresel antimeridyen boylam normalizasyonu, gercek NASA MOLA DEM koridor orneklemesi,
 * 24x24 Rust A* maliyet izgarasi uretimi ve file:// ortami icin yerel JS A* yedek cozucusu.
 * BackendApiService.js modulunu 800 satir sinirinin altinda ve tek sorumlulukta tutmak icin ayrilmistir.
 */

(function (ns) {
  "use strict";

  class MolaAStarGridHelper {
    /** Boylami [-180, 180] araligina normalize eder */
    wrapLon(lon) {
      return ((((Number(lon) || 0) + 180) % 360) + 360) % 360 - 180;
    }

    /** Iki boylam arasindaki (-180, 180] en kisa acisal farki hesaplar */
    shortestDeltaLon(fromLon, toLon) {
      return ((((Number(toLon) - Number(fromLon)) + 540) % 360) + 360) % 360 - 180;
    }

    /** Kure yuzeyinde kosinus duzeltmeli yaklasik acisal mesafe (derece) */
    sphericalAngleDeg(lat1, lon1, lat2, lon2) {
      const dLon = this.shortestDeltaLon(lon1, lon2);
      const cosMid = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
      return Math.hypot(lat2 - lat1, dLon * Math.max(0.15, cosMid));
    }

    /** Mars ortalama yaricapi (3389.5 km) uzerinden Haversine yuzey mesafesi (km) */
    haversineMarsKm(lat1, lon1, lat2, lon2) {
      const toRad = Math.PI / 180;
      const dLat = (lat2 - lat1) * toRad;
      const dLon = this.shortestDeltaLon(lon1, lon2) * toRad;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * 3389.5 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    }

    /** (x, y) Rust izgara hucresini antimeridyen-guvenli koridor (lat, lon) koordinatina donusturur */
    gridCellToGeo(x, y, width, height, orig, dest, lateralFactor = 0.38) {
      const denomU = Math.max(1, (width - 1) + (height - 1));
      const denomV = Math.max(1, width - 1);
      const u = (x + y) / denomU;
      const v = (x - y) / denomV;
      const dLat = dest.lat - orig.lat;
      const dLon = this.shortestDeltaLon(orig.lon, dest.lon);

      const perpLat = -dLon * lateralFactor;
      const perpLon = dLat * lateralFactor;
      const lat = Math.max(-89.8, Math.min(89.8, orig.lat + dLat * u + perpLat * v));
      const lon = this.wrapLon(orig.lon + dLon * u + perpLon * v);
      return { lat, lon, u, v };
    }

    /** Verilen (lat, lon) koridorunda gercek NASA MOLA DEM yukseklik ve egim izgarasini ornekler */
    sampleMolaCorridor(orig, dest, width, height, lateralFactor = 0.38) {
      const total = width * height;
      const elevMeters = new Float32Array(total);
      const slopeDegs = new Float32Array(total);
      const lats = new Float32Array(total);
      const lons = new Float32Array(total);
      const topo = ns.marsTopo || null;
      const hasTele = topo && typeof topo.getSurfaceTelemetry === "function";
      const hasElev = topo && typeof topo.getElevationMeters === "function";
      let minElevM = Infinity;
      let maxElevM = -Infinity;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const { lat, lon } = this.gridCellToGeo(x, y, width, height, orig, dest, lateralFactor);
          const tele = hasTele
            ? topo.getSurfaceTelemetry(lat, lon)
            : { elevM: hasElev ? topo.getElevationMeters(lat, lon) : 0, slopeDeg: 2.0 };
          elevMeters[idx] = tele.elevM;
          slopeDegs[idx] = tele.slopeDeg;
          lats[idx] = lat;
          lons[idx] = lon;
          if (tele.elevM < minElevM) minElevM = tele.elevM;
          if (tele.elevM > maxElevM) maxElevM = tele.elevM;
        }
      }

      if (!Number.isFinite(minElevM)) { minElevM = 0; maxElevM = 0; }
      return { elevMeters, slopeDegs, lats, lons, minElevM, maxElevM };
    }

    /** Gercek MOLA verisi + aktif tehlikelerden Rust `find_rover_path` i32 izgarasi uretir (-999 = engel) */
    buildMolaRustGrid(corridor, width, height, payload, opts = {}) {
      const { hazardScale = 1.0, stepScale = 1.0, enforceCliffs = true, smoothNeighbors = false } = opts;
      const flat = new Int32Array(width * height);
      const acidZones = (payload.factors?.acidRain?.enabled && payload.factors?.acidRain?.zones) || [];
      const stormZones = (payload.factors?.dustStorm?.enabled && payload.factors?.dustStorm?.zones) || [];
      const radZones = (payload.factors?.radiation?.enabled && payload.factors?.radiation?.zones) || [];
      const activeZones = [...acidZones, ...stormZones, ...radZones];

      const elevSpan = Math.max(300, corridor.maxElevM - corridor.minElevM);
      const stepMeters = Math.max(160, (elevSpan / ((width + height) * 0.55)) * stepScale);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const isEndpoint = (x === 0 && y === 0) || (x === width - 1 && y === height - 1);
          const lat = corridor.lats[idx];
          const lon = corridor.lons[idx];

          let blocked = false;
          if (!isEndpoint && hazardScale > 0) {
            for (const z of activeZones) {
              const dist = this.sphericalAngleDeg(lat, lon, z.lat, z.lon);
              if (dist < (z.radiusDeg || 6) * 0.65 * hazardScale) {
                blocked = true;
                break;
              }
            }
            if (!blocked && enforceCliffs && corridor.slopeDegs[idx] > 25.0) {
              blocked = true;
            }
          }

          flat[idx] = blocked
            ? -999
            : Math.round((corridor.elevMeters[idx] - corridor.minElevM) / stepMeters);
        }
      }

      if (smoothNeighbors) {
        const clamped = new Int32Array(flat);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            if (clamped[idx] === -999 || (x === 0 && y === 0)) continue;
            const ref = x > 0 && clamped[idx - 1] !== -999
              ? clamped[idx - 1]
              : (y > 0 && clamped[idx - width] !== -999 ? clamped[idx - width] : clamped[idx]);
            const diff = clamped[idx] - ref;
            if (Math.abs(diff) > 2) clamped[idx] = ref + (diff > 0 ? 2 : -2);
          }
        }
        return clamped;
      }

      return flat;
    }

    /** Rust lib.rs ile birebir kuralli (|Δz|<=3, -999 engel, +5/+2/1 maliyet) yerel JS A* yedegi */
    solvePathLocalAStar(flat, w, h, beginOxy) {
      const total = w * h;
      const gScore = new Int32Array(total).fill(1e9);
      const cameFrom = new Int32Array(total).fill(-1);
      const closed = new Uint8Array(total);
      gScore[0] = 0;
      const open = [0];
      const goalIdx = total - 1;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

      while (open.length > 0) {
        let bestPos = 0;
        let bestF = gScore[open[0]] + ((w - 1 - (open[0] % w)) + (h - 1 - ((open[0] / w) | 0)));
        for (let i = 1; i < open.length; i++) {
          const idx = open[i];
          const f = gScore[idx] + ((w - 1 - (idx % w)) + (h - 1 - ((idx / w) | 0)));
          if (f < bestF) { bestF = f; bestPos = i; }
        }
        const cur = open.splice(bestPos, 1)[0];
        if (cur === goalIdx) {
          const path = [];
          let c = cur;
          while (c !== -1) {
            path.push({ x: c % w, y: (c / w) | 0, z: flat[c] });
            c = cameFrom[c];
          }
          path.reverse();
          return {
            success: true,
            cost: gScore[goalIdx],
            distance: path.length,
            avaible_oxy: Math.max(0, beginOxy - path.length * 25),
            steps_count: path.length,
            path
          };
        }
        closed[cur] = 1;
        const cx = cur % w;
        const cy = (cur / w) | 0;
        const cz = flat[cur];
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (closed[nIdx]) continue;
          const nz = flat[nIdx];
          if (nz === -999 || Math.abs(nz - cz) > 3) continue;
          const dz = nz - cz;
          const stepCost = dz > 0 ? 1 + dz * 5 : (dz < 0 ? 1 + Math.abs(dz) * 2 : 1);
          const tentative = gScore[cur] + stepCost;
          if (tentative < gScore[nIdx]) {
            cameFrom[nIdx] = cur;
            gScore[nIdx] = tentative;
            if (!open.includes(nIdx)) open.push(nIdx);
          }
        }
      }
      return { success: false };
    }
  }

  ns.MolaAStarGridHelper = MolaAStarGridHelper;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-11: JSDoc, IIFE modul tanimi ve MolaAStarGridHelper sinif baslangici.
   - Satir 12-38: wrapLon, shortestDeltaLon, sphericalAngleDeg ve haversineMarsKm (kuresel Mars mesafe/boylam matematigi).
   - Satir 40-87: gridCellToGeo ve sampleMolaCorridor; antimeridyen-guvenli koridor uzerinde gercek MOLA DEM orneklemesi.
   - Satir 89-145: buildMolaRustGrid; tehlike cekirdekleri ve >25 deg egim kurallariyla 24x24 i32 izgara uretir.
   - Satir 147-208: solvePathLocalAStar; file:// ortaminda WASM yuklenemezse Rust kurallariyla birebir calisan JS A* cozucusu.
   ========================================================================== */
