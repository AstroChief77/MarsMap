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

    /** Mars uzerinde tanimli tum krater ve dev havzalari dondurur */
    getKnownCraters() {
      const craters = [];
      const addCrater = (id, name, lat, lon, radDeg, depthM = null) => {
        if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
        const normLon = this.wrapLon(lon);
        const normLat = Math.max(-89.5, Math.min(89.5, Number(lat)));
        const r = Math.max(0.5, Number(radDeg) || 1.5);
        if (!craters.some((c) => c.id === id || this.sphericalAngleDeg(c.lat, c.lon, normLat, normLon) < 0.6)) {
          craters.push({ id, name: name || id, lat: normLat, lon: normLon, radDeg: r, depthM: Number.isFinite(depthM) ? depthM : null });
        }
      };

      if (Array.isArray(ns.CRATERS_DATA)) {
        for (const c of ns.CRATERS_DATA) {
          const rDeg = c.diameter_km ? (c.diameter_km / (2 * 59.16)) * 1.25 : 1.5;
          addCrater(c.id, c.name, c.coordinates?.lat, c.coordinates?.lon, rDeg, Number(c.depth_m));
        }
      }

      const topoFeatures = ns.marsTopo && typeof ns.marsTopo.getDemFeaturesCatalog === "function"
        ? ns.marsTopo.getDemFeaturesCatalog()
        : [];
      for (const f of topoFeatures) {
        if (f.shape === "crater" || f.shape === "basin" || (f.dh && f.dh < -1500)) {
          addCrater(f.id, f.name, f.lat, f.lon, (f.radiusDeg || f.rad || 1.5) * 1.15, f.reliefM ? Math.abs(f.reliefM) : null);
        }
      }

      // USGS & IAU Kuresel Mars Buyuk Carparma Kraterleri Katalogu
      const usgsMajorCraters = [
        { id: "schiaparelli-crater", name: "Schiaparelli Krateri", lat: -2.7, lon: 16.7, radDeg: 3.9 },
        { id: "huygens-crater", name: "Huygens Krateri", lat: -14.0, lon: 55.6, radDeg: 4.0 },
        { id: "cassini-crater", name: "Cassini Krateri", lat: 23.8, lon: 32.1, radDeg: 3.5 },
        { id: "antoniadi-crater", name: "Antoniadi Krateri", lat: 21.5, lon: 60.8, radDeg: 3.3 },
        { id: "tikhonravov-crater", name: "Tikhonravov Krateri", lat: 13.5, lon: 35.8, radDeg: 3.2 },
        { id: "newton-crater", name: "Newton Krateri", lat: -40.5, lon: 158.1, radDeg: 2.6 },
        { id: "copernicus-crater", name: "Copernicus Krateri", lat: -49.2, lon: 169.2, radDeg: 2.5 },
        { id: "holden-crater", name: "Holden Krateri", lat: -26.4, lon: -34.0, radDeg: 1.4 },
        { id: "eberswalde-crater", name: "Eberswalde Krateri", lat: -23.9, lon: -33.3, radDeg: 0.9 },
        { id: "kaiser-crater", name: "Kaiser Krateri", lat: -46.6, lon: 18.9, radDeg: 1.8 },
        { id: "lowell-crater", name: "Lowell Krateri", lat: -52.3, lon: -81.4, radDeg: 1.8 },
        { id: "maraldi-crater", name: "Maraldi Krateri", lat: -62.2, lon: 32.0, radDeg: 1.2 },
        { id: "kovalsky-crater", name: "Koval'sky Krateri", lat: -30.2, lon: -141.5, radDeg: 2.6 },
        { id: "secchi-crater", name: "Secchi Krateri", lat: -58.3, lon: 101.9, radDeg: 2.0 },
        { id: "hadley-crater", name: "Hadley Krateri", lat: -19.5, lon: 156.9, radDeg: 1.1 },
        { id: "pettit-crater", name: "Pettit Krateri", lat: 10.8, lon: -174.0, radDeg: 0.9 },
        { id: "nicholson-crater", name: "Nicholson Krateri", lat: 0.2, lon: -164.6, radDeg: 1.0 },
        { id: "henry-crater", name: "Henry Krateri", lat: 10.9, lon: 23.3, radDeg: 1.5 },
        { id: "arago-crater", name: "Arago Krateri", lat: 10.2, lon: 29.8, radDeg: 1.4 },
        { id: "gusev-crater", name: "Gusev Krateri", lat: -14.57, lon: 175.47, radDeg: 2.0 }
      ];
      for (const cr of usgsMajorCraters) {
        addCrater(cr.id, cr.name, cr.lat, cr.lon, cr.radDeg);
      }

      return craters;
    }

    /**
     * MOLA DEM Yükseklik Matrisi üzerinden Görsel/Topografik Krater ve Çanak Algılama (DEM Visual Detection)
     * Rota koridoru boyunca dairesel çöküntü çanağı ve yükseltilmiş halka kenarları tespit eder.
     */
    detectVisualCratersFromDem(corridor, width, height) {
      if (!corridor || !corridor.elevMeters) return [];
      const detected = [];
      const elev = corridor.elevMeters;
      const lats = corridor.lats;
      const lons = corridor.lons;
      const checkedCells = new Uint8Array(width * height);

      // Koridor boyunca potansiyel krater çanaklarını tara
      for (let y = 3; y < height - 3; y += 2) {
        for (let x = 3; x < width - 3; x += 2) {
          const idx = y * width + x;
          if (checkedCells[idx]) continue;

          const centerElev = elev[idx];

          // 4 farklı yarıçapta (R = 2..8 hücre) dairesel çanak ve kenar yükseltisi testi
          for (const r of [2, 4, 6, 8]) {
            if (x - r < 0 || x + r >= width || y - r < 0 || y + r >= height) continue;

            // 8 yönde kenar (rim) yüksekliklerini örnekle
            const rDiag = Math.round(r * 0.7);
            const samples = [
              elev[y * width + (x + r)],
              elev[y * width + (x - r)],
              elev[(y + r) * width + x],
              elev[(y - r) * width + x],
              elev[(y + rDiag) * width + (x + rDiag)],
              elev[(y + rDiag) * width + (x - rDiag)],
              elev[(y - rDiag) * width + (x + rDiag)],
              elev[(y - rDiag) * width + (x - rDiag)]
            ];

            const avgRimElev = samples.reduce((a, b) => a + b, 0) / 8;
            const depressionDepth = avgRimElev - centerElev;

            // Çanak kriteri: Kenarlar merkeze göre en az 180m yüksekte ve en az 6 yönde yükseliyor olmalı
            const higherCount = samples.filter((s) => s > centerElev + 120).length;
            if (depressionDepth >= 180 && higherCount >= 6) {
              const cLat = lats[idx];
              const cLon = lons[idx];
              const rimLat = lats[y * width + (x + r)];
              const rimLon = lons[y * width + (x + r)];
              const radDeg = Math.max(0.6, this.sphericalAngleDeg(cLat, cLon, rimLat, rimLon));

              if (!detected.some((d) => this.sphericalAngleDeg(d.lat, d.lon, cLat, cLon) < radDeg * 0.8)) {
                detected.push({
                  id: `dem-crater-${Math.round(cLat * 10)}-${Math.round(cLon * 10)}`,
                  name: `Görsel DEM Krateri (${Math.round(depressionDepth)}m çanak)`,
                  lat: Number(cLat.toFixed(3)),
                  lon: Number(cLon.toFixed(3)),
                  radDeg: Number(radDeg.toFixed(3)),
                  depthM: Math.round(depressionDepth),
                  detectedFromDem: true
                });

                for (let dy = -r; dy <= r; dy++) {
                  for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy <= r * r) {
                      checkedCells[(y + dy) * width + (x + dx)] = 1;
                    }
                  }
                }
              }
              break;
            }
          }
        }
      }
      return detected;
    }

    /** Gercek MOLA verisi + aktif tehlikeler + krater kacınma maskesinden Rust i32 izgarasi ve bitmaske uretir */
    evaluateGridAndMasks(corridor, width, height, payload, opts = {}) {
      const { hazardScale = 1.0, stepScale = 1.0, enforceCliffs = true, smoothNeighbors = false } = opts;
      const flat = new Int32Array(width * height);
      const blockedMask = new Uint8Array(width * height);
      const acidZones = (payload.factors?.acidRain?.enabled && payload.factors?.acidRain?.zones) || [];
      const stormZones = (payload.factors?.dustStorm?.enabled && payload.factors?.dustStorm?.zones) || [];
      const radZones = (payload.factors?.radiation?.enabled && payload.factors?.radiation?.zones) || [];
      const activeHazards = [...acidZones, ...stormZones, ...radZones];

      const orig = payload.origin || { lat: corridor.lats[0], lon: corridor.lons[0] };
      const dest = payload.destination || { lat: corridor.lats[width * height - 1], lon: corridor.lons[width * height - 1] };
      
      // Bilinen katalog kraterleri + MOLA DEM görsel çanak analiziyle tespit edilen kraterler
      const visualCraters = this.detectVisualCratersFromDem(corridor, width, height);
      const allCraters = [...this.getKnownCraters(), ...visualCraters];

      // Rota baslangic ve hedefi haricinde kalan ara kraterler: Rota ASLA bu kraterlerin ustunden gecemez!
      const intermediateCraters = allCraters.filter((c) => {
        const dOrig = this.sphericalAngleDeg(orig.lat, orig.lon, c.lat, c.lon);
        const dDest = this.sphericalAngleDeg(dest.lat, dest.lon, c.lat, c.lon);
        return dOrig >= c.radDeg * 0.90 && dDest >= c.radDeg * 0.90;
      });

      // Her ara krater icin aktif firtina/kasirga, asit ve radyasyon durumunu hesapla
      const getCraterHazardThreat = (cr) => {
        let maxThreat = 0;
        let threatHazard = null;
        for (const hz of activeHazards) {
          const d = this.sphericalAngleDeg(cr.lat, cr.lon, hz.lat, hz.lon);
          const reach = (hz.radiusDeg || 6) + cr.radDeg * 0.85;
          if (d < reach) {
            const threat = Math.max(0, (reach - d) / reach);
            if (threat > maxThreat) {
              maxThreat = threat;
              threatHazard = hz;
            }
          }
        }
        return { hasHazard: maxThreat > 0, threat: maxThreat, hazard: threatHazard };
      };

      // NASA Traversability Kriteri:
      // Küçük / sığ kraterler (radDeg < 0.75° ve derinlik < 300m): Rover doğrudan üzerinden/içinden geçebilir!
      // Yalnızca hafif yuvarlanma/pürüzlülük direnci maliyeti eklenir (+2..+3).
      // Büyük çarpma kraterleri (radDeg >= 0.75° veya dik yamaçlı çanaklar): Devrilme riski nedeniyle kenardan güvenle dolanılır.
      const isTraversableSmallCrater = (cr) => {
        const threatInfo = getCraterHazardThreat(cr);
        if (threatInfo.threat > 0.4) return false;
        const isSmallRadius = (cr.radDeg || 1.5) < 0.75;
        const isShallowDepth = !cr.depthM || cr.depthM < 300;
        return isSmallRadius && isShallowDepth;
      };

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
            if (enforceCliffs && corridor.slopeDegs[idx] > 24.2) mask |= 1;
            if (inZone(acidZones, lat, lon)) mask |= 2;
            if (inZone(stormZones, lat, lon)) mask |= 4;
            if (inZone(radZones, lat, lon)) mask |= 8;

            // Kraterden kaçınma (NASA GESTALT & Traversability prensipleri):
            // 1. KÜÇÜK KRATERLER (r < 0.75°): Rover doğrudan içinden/üzerinden geçebilir! mask |= 16 konulmaz (-999 yapılmaz).
            // 2. BÜYÜK KRATERLER (r >= 0.75° veya derin çanaklar): Dik yamaç uçurumları nedeniyle etrafından dolaşılır.
            for (const cr of intermediateCraters) {
              if (isTraversableSmallCrater(cr)) {
                // Küçük kraterler engellenmez! Rover üzerinden geçebilir.
                continue;
              }
              const dCr = this.sphericalAngleDeg(lat, lon, cr.lat, cr.lon);
              const threatInfo = getCraterHazardThreat(cr);
              // Fırtına/tehlike varsa güvenli marj genişler (1.10x), normalde krater kenarını sıkıca takip eder (1.04x)
              const blockRadius = threatInfo.hasHazard
                ? cr.radDeg * (1.08 + threatInfo.threat * 0.15) * hazardScale
                : cr.radDeg * 1.04 * hazardScale;

              if (dCr < blockRadius) {
                mask |= 16;
                break;
              }
            }
          }

          let craterProximityCost = 0;
          if (mask === 0 && hazardScale > 0) {
            for (const cr of intermediateCraters) {
              const dCr = this.sphericalAngleDeg(lat, lon, cr.lat, cr.lon);
              const isSmall = isTraversableSmallCrater(cr);

              if (isSmall) {
                // Küçük kraterin içinden geçerken hafif regolit pürüzlülük / yuvarlanma maliyeti (+2)
                // Rover üzerinden doğrudan geçebilir, gereksiz yöne saptırılmaz!
                if (dCr < cr.radDeg) {
                  craterProximityCost = Math.max(craterProximityCost, 2);
                }
              } else {
                const threatInfo = getCraterHazardThreat(cr);
                if (threatInfo.hasHazard) {
                  // Fırtına veya ek tehlike varsa tampon marj
                  const outerBuff = cr.radDeg * (1.18 + threatInfo.threat * 0.18);
                  if (dCr >= cr.radDeg && dCr < outerBuff) {
                    const proxFactor = (outerBuff - dCr) / (outerBuff - cr.radDeg);
                    craterProximityCost = Math.max(craterProximityCost, Math.round(proxFactor * 10));
                  }
                } else {
                  // Büyük krater kenarı: Akıcı, abartısız teğet tamponu (1.12x, aşırı ovalleşmeyi önler)
                  const outerBuff = cr.radDeg * 1.12;
                  if (dCr >= cr.radDeg && dCr < outerBuff) {
                    const proxFactor = (outerBuff - dCr) / (outerBuff - cr.radDeg);
                    craterProximityCost = Math.max(craterProximityCost, Math.round(proxFactor * 6));
                  }
                }
              }
            }
          }

          blockedMask[idx] = mask;
          flat[idx] = mask !== 0
            ? -999
            : Math.round((corridor.elevMeters[idx] - corridor.minElevM) / stepMeters) + craterProximityCost;
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
        return { flat: clamped, blockedMask, stepMeters, intermediateCraters };
      }

      return { flat, blockedMask, stepMeters, intermediateCraters };
    }

    /** Gercek MOLA verisi + aktif tehlikelerden Rust `find_rover_path` i32 izgarasi uretir (-999 = engel) */
    buildMolaRustGrid(corridor, width, height, payload, opts = {}) {
      return this.evaluateGridAndMasks(corridor, width, height, payload, opts).flat;
    }

    /** Backend `/api/v1/route` ve Rust A* icin tam cozunurluklu koridor DEM + engel + geometri paketi uretir */
    buildRichTerrainPayload(orig, dest, factors, width = 48, height = 48, lateralFactor = 0.38) {
      const corridor = this.sampleMolaCorridor(orig, dest, width, height, lateralFactor);
      const { flat, blockedMask, stepMeters, intermediateCraters } = this.evaluateGridAndMasks(
        corridor, width, height, { factors, origin: orig, destination: dest }, { hazardScale: 1.0, stepScale: 1.0, enforceCliffs: true }
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
        intermediateCraters,
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
            8: "radiation_zone",
            16: "crater_avoidance_zone"
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

    /** 8-Yonlu (ortogonal + diyagonal) ve Octile sezgisel fonksiyonlu akilli A* cozucusu (Zig-zag merdivenini onler) */
    solvePathLocalAStar(flat, w, h, beginOxy) {
      const total = w * h;
      const gScore = new Float32Array(total).fill(1e9);
      const cameFrom = new Int32Array(total).fill(-1);
      const closed = new Uint8Array(total);
      const inOpen = new Uint8Array(total);
      gScore[0] = 0;
      const open = [0];
      inOpen[0] = 1;
      const goalIdx = total - 1;
      const gx = w - 1;
      const gy = h - 1;

      // 8 Yon: 4 Ortogonal (maliyet 1.0) + 4 Diyagonal (maliyet 1.414)
      const dirs = [
        [ 1,  0, 1.0], [-1,  0, 1.0], [ 0,  1, 1.0], [ 0, -1, 1.0],
        [ 1,  1, 1.414], [-1, -1, 1.414], [ 1, -1, 1.414], [-1,  1, 1.414]
      ];

      const getH = (idx) => {
        const x = idx % w;
        const y = (idx / w) | 0;
        const dx = Math.abs(gx - x);
        const dy = Math.abs(gy - y);
        return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
      };

      while (open.length > 0) {
        let bestPos = 0;
        let bestF = gScore[open[0]] + getH(open[0]);
        for (let i = 1; i < open.length; i++) {
          const idx = open[i];
          const f = gScore[idx] + getH(idx);
          if (f < bestF) { bestF = f; bestPos = i; }
        }
        const cur = open.splice(bestPos, 1)[0];
        inOpen[cur] = 0;

        if (cur === goalIdx) {
          const path = [];
          let c = cur;
          while (c !== -1) {
            path.push({ x: c % w, y: (c / w) | 0, z: flat[c] });
            c = cameFrom[c];
          }
          path.reverse();
          const consumedOxy = path.length * 25;
          const availableOxy = Math.max(0, beginOxy - consumedOxy);
          const consumedWater = Number((consumedOxy * (2.15 / 48.0)).toFixed(2));
          const availableWater = Number(Math.max(0, 24.0 - consumedWater).toFixed(2));
          return {
            success: true,
            cost: Math.round(gScore[goalIdx] * 10),
            distance: path.length,
            avaible_oxy: availableOxy,
            available_oxy: availableOxy,
            consumed_oxy: consumedOxy,
            consumed_water_liters: consumedWater,
            available_water_liters: availableWater,
            estimated_water_liters: consumedWater,
            harcanan_su: consumedWater,
            harcanan_oksijen: consumedOxy,
            steps_count: path.length,
            path
          };
        }

        closed[cur] = 1;
        const cx = cur % w;
        const cy = (cur / w) | 0;
        const cz = flat[cur];

        for (const [dx, dy, baseDist] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const nIdx = ny * w + nx;
          if (closed[nIdx]) continue;
          const nz = flat[nIdx];
          if (nz === -999) continue;

          // Diyagonal adimda kose kesme (corner-cutting) kontrolu
          if (dx !== 0 && dy !== 0) {
            const adj1 = flat[cy * w + nx];
            const adj2 = flat[ny * w + cx];
            if (adj1 === -999 || adj2 === -999) continue;
          }

          if (Math.abs(nz - cz) > 3) continue;
          const dz = nz - cz;
          const slopeCost = dz > 0 ? dz * 5.0 : (dz < 0 ? Math.abs(dz) * 2.0 : 0);
          const tentative = gScore[cur] + baseDist + slopeCost;
          if (tentative < gScore[nIdx]) {
            cameFrom[nIdx] = cur;
            gScore[nIdx] = tentative;
            if (!inOpen[nIdx]) {
              open.push(nIdx);
              inOpen[nIdx] = 1;
            }
          }
        }
      }
      return { success: false };
    }

    /** Izgara uzerinde iki nokta arasinda gorus hatti (Line of Sight) olup olmadigini raycast ve topografi ile kontrol eder */
    hasLineOfSight(p1, p2, flat, w, h, corridor = null) {
      let x0 = p1.x;
      let y0 = p1.y;
      const x1 = p2.x;
      const y1 = p2.y;
      const dx = Math.abs(x1 - x0);
      const dy = Math.abs(y1 - y0);
      const sx = x0 < x1 ? 1 : -1;
      const sy = y0 < y1 ? 1 : -1;
      let err = dx - dy;
      let prevZ = flat[y0 * w + x0];

      const elevs = corridor ? corridor.elevMeters : null;
      const slopes = corridor ? corridor.slopeDegs : null;
      const totalSteps = Math.max(1, Math.hypot(x1 - x0, y1 - y0));
      let step = 0;
      const startElev = (corridor && elevs) ? elevs[y0 * w + x0] : 0;
      const endElev = (corridor && elevs) ? elevs[y1 * w + x1] : 0;

      while (true) {
        const idx = y0 * w + x0;
        const curZ = flat[idx];
        if (curZ === -999) return false;
        if (Math.abs(curZ - prevZ) > 3) return false;
        prevZ = curZ;

        // Topografik krater/çanak ve dik yamaç kontrolü:
        // Eğer doğru hat bir krater çanağının içine dalıyorsa kestirme yapılamaz!
        if (corridor && elevs) {
          const t = step / totalSteps;
          const expectedElev = startElev * (1 - t) + endElev * t;
          const actualElev = elevs[idx];
          if (expectedElev - actualElev > 180 || (slopes && slopes[idx] > 24.2)) {
            return false;
          }
        }

        if (x0 === x1 && y0 === y1) break;
        const e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
        step++;
      }
      return true;
    }

    /** Merdiven basamagi seklindeki gereksiz ara adimlari gorus hatti kisayolu ile budar */
    pruneGridPath(path, flat, w, h, corridor = null) {
      if (!Array.isArray(path) || path.length <= 2) return path || [];
      const pruned = [path[0]];
      let curIdx = 0;
      while (curIdx < path.length - 1) {
        let furthest = curIdx + 1;
        for (let test = path.length - 1; test > curIdx + 1; test--) {
          if (this.hasLineOfSight(path[curIdx], path[test], flat, w, h, corridor)) {
            furthest = test;
            break;
          }
        }
        pruned.push(path[furthest]);
        curIdx = furthest;
      }
      return pruned;
    }

    /**
     * NASA Yol Düzeltme & Eğrilik Yumuşatma (Adaptive Fillet & Spline Transitions):
     * - Sürekli merdiven basamağı zig-zag çizilmesini line-of-sight ile budar.
     * - Dik dağ/yamaç tırmanışlarında (switchback zikzak): Keskin dönüşleri korur (filletRatio ~0.10..0.12).
     * - Düz arazide büyük engel/fırtına etrafından geçerken: Yumuşak akıcı yay çizer (filletRatio ~0.26..0.30).
     * - Aşırı balonlaşmış, yapay elips oval dönüşlerin oluşmasını engeller.
     */
    filletTurns(waypoints, samplesPerCorner = 8, filletRatio = 0.28) {
      if (!Array.isArray(waypoints) || waypoints.length <= 2) return waypoints || [];
      const curvePoints = [];
      curvePoints.push(waypoints[0]);

      for (let i = 1; i < waypoints.length - 1; i++) {
        const prev = waypoints[i - 1];
        const cur = waypoints[i];
        const next = waypoints[i + 1];

        const vInX = cur.x - prev.x;
        const vInY = cur.y - prev.y;
        const vOutX = next.x - cur.x;
        const vOutY = next.y - cur.y;
        const dIn = Math.hypot(vInX, vInY) || 1;
        const dOut = Math.hypot(vOutX, vOutY) || 1;

        // Vektörler arası iç çarpım ile dönüş açısı kosinüsü:
        const dot = (vInX * vOutX + vInY * vOutY) / (dIn * dOut);
        const dzIn = Math.abs((cur.z || 0) - (prev.z || 0));
        const dzOut = Math.abs((next.z || 0) - (cur.z || 0));
        const isSteepClimb = dzIn >= 2 || dzOut >= 2;

        let cornerRatio;
        if (isSteepClimb || dot < -0.15) {
          // 1. ZİKZAK (Switchback) Gereken Yer:
          // Dik yamaç tırmanışı veya keskin saç tokası dönüşü (> 98°).
          // Burada zikzak tırmanış geometrisini korumak için köşe dar tutulur!
          cornerRatio = 0.12;
        } else if (dot > 0.70) {
          // 2. Neredeyse düz hat (< 45° sapma): Çok hafif geçiş
          cornerRatio = 0.18;
        } else {
          // 3. OVALLEŞME Gereken Yer:
          // Düz/orta arazide krater veya fırtınanın etrafından dolaşırken akıcı ve doğal kavis.
          // Ne gereksiz ızgara basamağı ne de aşırı şişik bir balon oval; dengeli (%28) doğal yay.
          cornerRatio = Math.max(0.20, Math.min(0.32, filletRatio));
        }

        const r = Math.min(dIn * cornerRatio, dOut * cornerRatio);
        const pStartX = cur.x - (vInX / dIn) * r;
        const pStartY = cur.y - (vInY / dIn) * r;
        const pEndX = cur.x + (vOutX / dOut) * r;
        const pEndY = cur.y + (vOutY / dOut) * r;

        curvePoints.push({ x: pStartX, y: pStartY, z: cur.z });

        for (let s = 1; s < samplesPerCorner; s++) {
          const t = s / samplesPerCorner;
          const oneMinusT = 1 - t;
          const bx = oneMinusT * oneMinusT * pStartX + 2 * oneMinusT * t * cur.x + t * t * pEndX;
          const by = oneMinusT * oneMinusT * pStartY + 2 * oneMinusT * t * cur.y + t * t * pEndY;
          curvePoints.push({ x: bx, y: by, z: cur.z });
        }

        curvePoints.push({ x: pEndX, y: pEndY, z: cur.z });
      }

      curvePoints.push(waypoints[waypoints.length - 1]);
      return curvePoints;
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
   - Satir 271-344: solvePathLocalAStar; file:// ortaminda WASM yuklenemezse Rust kurallariyla birebir calisan O2 ve su hesabi iceren JS A* cozucusu.
   ========================================================================== */
