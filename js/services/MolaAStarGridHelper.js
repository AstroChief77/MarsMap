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

    /** Iki cografi nokta arasindaki baslangic azimut acisini (0..360 derece) hesaplar */
    bearingDeg(lat1, lon1, lat2, lon2) {
      const toRad = Math.PI / 180;
      const p1 = lat1 * toRad;
      const p2 = lat2 * toRad;
      const dLon = this.shortestDeltaLon(lon1, lon2) * toRad;
      const y = Math.sin(dLon) * Math.cos(p2);
      const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
      return Number((((Math.atan2(y, x) * 180) / Math.PI + 360) % 360).toFixed(1));
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

    /** Verilen (lat, lon) koridorunda gercek NASA MOLA DEM yukseklik, max hucre-ici egim ve hucre olcegini ornekler */
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
      let minSlopeDeg = Infinity;
      let maxSlopeDeg = -Infinity;
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;

      const samplePoint = (lat, lon) => (hasTele
        ? topo.getSurfaceTelemetry(lat, lon)
        : { elevM: hasElev ? topo.getElevationMeters(lat, lon) : 0, slopeDeg: 2.0 });

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const { lat, lon } = this.gridCellToGeo(x, y, width, height, orig, dest, lateralFactor);
          const center = samplePoint(lat, lon);
          let peakSlope = center.slopeDeg;

          // Hucre merkezinden kacabilecek dik krater duvarlarini yakalamak icin 4 alt-ceyrek ornegi
          if (hasTele && x > 0 && x < width - 1 && y > 0 && y < height - 1) {
            for (const [ox, oy] of [[-0.35, 0], [0.35, 0], [0, -0.35], [0, 0.35]]) {
              const subGeo = this.gridCellToGeo(x + ox, y + oy, width, height, orig, dest, lateralFactor);
              const subTele = topo.getSurfaceTelemetry(subGeo.lat, subGeo.lon);
              if (subTele.slopeDeg > peakSlope) peakSlope = subTele.slopeDeg;
            }
          }

          elevMeters[idx] = center.elevM;
          slopeDegs[idx] = peakSlope;
          lats[idx] = lat;
          lons[idx] = lon;
          if (center.elevM < minElevM) minElevM = center.elevM;
          if (center.elevM > maxElevM) maxElevM = center.elevM;
          if (peakSlope < minSlopeDeg) minSlopeDeg = peakSlope;
          if (peakSlope > maxSlopeDeg) maxSlopeDeg = peakSlope;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
        }
      }

      if (!Number.isFinite(minElevM)) { minElevM = 0; maxElevM = 0; }
      if (!Number.isFinite(minSlopeDeg)) { minSlopeDeg = 0; maxSlopeDeg = 0; }
      const yMid = Math.floor(height / 2);
      const xMid = Math.floor(width / 2);
      const gX0 = this.gridCellToGeo(0, yMid, width, height, orig, dest, lateralFactor);
      const gX1 = this.gridCellToGeo(width - 1, yMid, width, height, orig, dest, lateralFactor);
      const gY0 = this.gridCellToGeo(xMid, 0, width, height, orig, dest, lateralFactor);
      const gY1 = this.gridCellToGeo(xMid, height - 1, width, height, orig, dest, lateralFactor);
      const dxMeters = Math.round((this.haversineMarsKm(gX0.lat, gX0.lon, gX1.lat, gX1.lon) * 1000) / Math.max(1, width - 1));
      const dyMeters = Math.round((this.haversineMarsKm(gY0.lat, gY0.lon, gY1.lat, gY1.lon) * 1000) / Math.max(1, height - 1));

      return {
        elevMeters, slopeDegs, lats, lons,
        minElevM, maxElevM, minSlopeDeg, maxSlopeDeg,
        bounds: {
          minLat: Number(minLat.toFixed(4)), maxLat: Number(maxLat.toFixed(4)),
          minLon: Number(minLon.toFixed(4)), maxLon: Number(maxLon.toFixed(4)),
          minElevM: Math.round(minElevM), maxElevM: Math.round(maxElevM),
          minSlopeDeg: Number(minSlopeDeg.toFixed(1)), maxSlopeDeg: Number(maxSlopeDeg.toFixed(1))
        },
        cellSizeMeters: {
          dxMeters,
          dyMeters,
          diagonalMeters: Math.round(Math.hypot(dxMeters, dyMeters)),
          corridorSpanMeters: Math.round(this.haversineMarsKm(orig.lat, orig.lon, dest.lat, dest.lon) * 1000)
        }
      };
    }

    /** Gercek MOLA verisi + aktif tehlikelerden Rust i32 izgarasi ve engel bitmaskesi uretir */
    evaluateGridAndMasks(corridor, width, height, payload, opts = {}) {
      const { hazardScale = 1.0, stepScale = 1.0, enforceCliffs = true, smoothNeighbors = false } = opts;
      const flat = new Int32Array(width * height);
      const blockedMask = new Uint8Array(width * height);
      const acidZones = (payload.factors?.acidRain?.enabled && payload.factors?.acidRain?.zones) || [];
      const stormZones = (payload.factors?.dustStorm?.enabled && payload.factors?.dustStorm?.zones) || [];
      const radZones = (payload.factors?.radiation?.enabled && payload.factors?.radiation?.zones) || [];

      const elevSpan = Math.max(300, corridor.maxElevM - corridor.minElevM);
      const stepMeters = Math.max(160, (elevSpan / ((width + height) * 0.55)) * stepScale);

      const inZone = (zones, lat, lon) => zones.some(
        (z) => this.sphericalAngleDeg(lat, lon, z.lat, z.lon) < (z.radiusDeg || 6) * 0.65 * hazardScale
      );

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          const isEndpoint = (x === 0 && y === 0) || (x === width - 1 && y === height - 1);
          const lat = corridor.lats[idx];
          const lon = corridor.lons[idx];
          let mask = 0;

          if (!isEndpoint && hazardScale > 0) {
            if (enforceCliffs && corridor.slopeDegs[idx] > 25.0) mask |= 1;
            if (inZone(acidZones, lat, lon)) mask |= 2;
            if (inZone(stormZones, lat, lon)) mask |= 4;
            if (inZone(radZones, lat, lon)) mask |= 8;
          }

          blockedMask[idx] = mask;
          flat[idx] = mask !== 0
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
        return { flat: clamped, blockedMask, stepMeters };
      }

      return { flat, blockedMask, stepMeters };
    }

    /** Gercek MOLA verisi + aktif tehlikelerden Rust `find_rover_path` i32 izgarasi uretir (-999 = engel) */
    buildMolaRustGrid(corridor, width, height, payload, opts = {}) {
      return this.evaluateGridAndMasks(corridor, width, height, payload, opts).flat;
    }

    /** Backend `/api/v1/route` ve Rust A* icin tam cozunurluklu koridor DEM + engel + geometri paketi uretir */
    buildRichTerrainPayload(orig, dest, factors, width = 48, height = 48, lateralFactor = 0.38) {
      const corridor = this.sampleMolaCorridor(orig, dest, width, height, lateralFactor);
      const { flat, blockedMask, stepMeters } = this.evaluateGridAndMasks(
        corridor, width, height, { factors }, { hazardScale: 1.0, stepScale: 1.0, enforceCliffs: true }
      );
      const directDistanceKm = Number(this.haversineMarsKm(orig.lat, orig.lon, dest.lat, dest.lon).toFixed(2));
      const dLonShort = Number(this.shortestDeltaLon(orig.lon, dest.lon).toFixed(4));
      const rawDeltaLon = Math.abs(dest.lon - orig.lon);
      const midLat = (orig.lat + dest.lat) * 0.5;
      const midLon = this.wrapLon(orig.lon + dLonShort * 0.5);
      const spanDeg = this.sphericalAngleDeg(orig.lat, orig.lon, dest.lat, dest.lon);

      const allFeatures = ns.marsTopo && typeof ns.marsTopo.getDemFeaturesCatalog === "function"
        ? ns.marsTopo.getDemFeaturesCatalog()
        : [];
      const nearbyFeatures = allFeatures.filter(
        (f) => this.sphericalAngleDeg(midLat, midLon, f.lat, f.lon) <= Math.max(spanDeg * 0.75 + 6, (f.radiusDeg || 2) * 1.6)
      );

      return {
        corridor,
        strictFlat: flat,
        nearbyFeatures,
        allFeaturesCount: allFeatures.length,
        routeGeometrySummary: {
          directDistanceKm,
          directDistanceMeters: Math.round(directDistanceKm * 1000),
          initialBearingDeg: this.bearingDeg(orig.lat, orig.lon, dest.lat, dest.lon),
          deltaLatDeg: Number((dest.lat - orig.lat).toFixed(4)),
          shortestDeltaLonDeg: dLonShort,
          crossesAntimeridian: rawDeltaLon > 180
        },
        terrainGrid: {
          width,
          height,
          indexing: "row-major: idx = y * width + x",
          coordinateMapping: "diagonal-corridor: u=(x+y)/(w+h-2), v=(x-y)/(w-1)",
          lateralFactor,
          stepMeters: Math.round(stepMeters),
          cellSizeMeters: corridor.cellSizeMeters,
          bounds: corridor.bounds,
          obstacleLegend: {
            0: "passable",
            1: "cliff_slope_gt_25deg",
            2: "acid_rain_zone",
            4: "dust_storm_zone",
            8: "radiation_zone"
          },
          gridFlatI32: Array.from(flat),
          elevMeters: Array.from(corridor.elevMeters, (v) => Math.round(v)),
          slopeDegs: Array.from(corridor.slopeDegs, (v) => Number(v.toFixed(1))),
          blockedMask: Array.from(blockedMask),
          lats: Array.from(corridor.lats, (v) => Number(v.toFixed(4))),
          lons: Array.from(corridor.lons, (v) => Number(v.toFixed(4)))
        }
      };
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
   - Satir 12-50: wrapLon, shortestDeltaLon, sphericalAngleDeg, haversineMarsKm ve bearingDeg (kuresel Mars mesafe/azimut matematigi).
   - Satir 52-149: gridCellToGeo ve sampleMolaCorridor; antimeridyen-guvenli koridor uzerinde 5-noktali egim ve metre bazli hucre olcegi orneklemesi.
   - Satir 151-211: evaluateGridAndMasks ve buildMolaRustGrid; tehlike bitmaskesi (egim/asit/firtina/radyasyon) ve i32 izgara uretimi.
   - Satir 213-269: buildRichTerrainPayload; HTTP /api/v1/route ve Rust A* icin tam terrainGrid, metre olcegi ve yakin krater katalogu uretir.
   - Satir 271-331: solvePathLocalAStar; file:// ortaminda WASM yuklenemezse Rust kurallariyla birebir calisan JS A* cozucusu.
   ========================================================================== */
