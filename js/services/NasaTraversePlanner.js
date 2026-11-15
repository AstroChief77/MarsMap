/**
 * @file NasaTraversePlanner.js
 * @description NASA/JPL rover navigasyonundan esinlenen maliyet-haritasi tabanli kuresel rota planlayici.
 *
 * Kaynak alinan yontemler:
 *  - GESTALT (MER/MSL AutoNav): Arazi hucrelere bolunur, her hucreye egim / puruzluluk / adim
 *    tehlikesinden turetilen bir "goodness" (iyilik) degeri atanir; tehlikeler rover yaricapi kadar buyutulur.
 *  - Field D* (MER kuresel planlayici, Ferguson & Stentz): Hucre maliyeti x katedilen gercek mesafe
 *    integrali minimize edilir; 45 derece kisitina takilmadan dogal (any-angle) yol uretilir.
 *  - ENav / ACE (Perseverance): Aday yollarin toplam maliyeti agirlikli faktorlerin toplamidir;
 *    gidilemez hucreler (lethal) kesinlikle reddedilir, guvenlik kontrolu yol uzerinde tekrar yapilir.
 *
 * Matematik (her hucre i icin):
 *   c_i = 1 + W_slope * (s_i / s_max)^2 + Σ tehlike_tampon_maliyeti + kucuk_krater_puruzlulugu
 *   s_i > s_max  veya  tehlike/buyuk krater cekirdegi icindeyse  ->  c_i = ∞ (LETHAL)
 *   Kenar maliyeti (a->b):  C_ab = Σ_k  L_k * c(k) * g(θ_k)   (L_k: alt-adim km, θ_k: yol boyu egim)
 *   g(θ) = 1 + W_up * (θ/θ_max)^2 (yokus yukari)  |  1 + W_down * (θ/θ_max)^2 (yokus asagi); θ > θ_max -> ∞
 *   A* sezgiseli: h = kalan Haversine-benzeri mesafe (km) * c_min(=1)  -> kabul edilebilir (admissible).
 *
 * Bu anizotropik egim terimi sayesinde dik yamaclarda yol kendiliginden "switchback" (zikzak) yapar,
 * duz arazide ise dogrudan duz cizgi kalir. Son adimda yol bosluk (clearance) haritasina gore
 * yumusatilir: genis alanda yumusak yay, dar gecitte keskin donus; asla tehlike icine girmez.
 */

(function (ns) {
  "use strict";

  /**
   * Her tehlike / arazi turu icin atanan degiskenler (kullanici istegi: "hepsine bir deger ata").
   *  lethal   : normalize mesafe (d / r) bu degerin altindaysa hucre GECILEMEZ.
   *  buffer   : lethal..buffer arasi yumusak tampon; maliyet kenara yaklastikca karesel artar.
   *  bufferCost: tampon icindeki en yuksek ek maliyet (lethal sinirinda).
   *  softCore : son care (hicbir guvenli yol yoksa) cekirdek icin kullanilan sonlu ceza.
   */
  const TRAVERSE_COST_TABLE = {
    slope: { maxSlopeDeg: 25.0, weight: 3.0 },
    climb: { maxGradeDeg: 20.0, upWeight: 4.0, downWeight: 1.5 },
    acidRain: { lethal: 1.00, buffer: 1.18, bufferCost: 5.0, softCore: 25 },
    dustStorm: { lethal: 1.00, buffer: 1.25, bufferCost: 7.0, softCore: 35 },
    radiation: { lethal: 1.00, buffer: 1.15, bufferCost: 5.0, softCore: 30 },
    // TUM kraterler (kucuk dahil) gecilemez: kenar (rim) + %8 guvenlik payi lethal, 1.30r'ye kadar tampon.
    crater: { lethal: 1.08, buffer: 1.30, bufferCost: 4.0, stormLethalBoost: 0.10, softCore: 60, emergencySoftMaxDiamKm: 25 }
  };

  const TAG = { SLOPE: 1, ACID: 2, STORM: 4, RAD: 8, CRATER: 16, SMALL_CRATER: 32 };
  const KM_PER_DEG = 59.16; // Mars: 2*pi*3389.5 / 360

  class MinHeap {
    constructor() { this.idx = []; this.key = []; }
    get size() { return this.idx.length; }
    push(i, k) {
      const a = this.idx; const b = this.key;
      a.push(i); b.push(k);
      let n = a.length - 1;
      while (n > 0) {
        const p = (n - 1) >> 1;
        if (b[p] <= b[n]) break;
        [a[p], a[n]] = [a[n], a[p]]; [b[p], b[n]] = [b[n], b[p]];
        n = p;
      }
    }
    pop() {
      const a = this.idx; const b = this.key;
      const top = a[0];
      const li = a.pop(); const lk = b.pop();
      if (a.length > 0) {
        a[0] = li; b[0] = lk;
        let n = 0;
        for (;;) {
          const l = 2 * n + 1; const r = l + 1; let m = n;
          if (l < a.length && b[l] < b[m]) m = l;
          if (r < a.length && b[r] < b[m]) m = r;
          if (m === n) break;
          [a[m], a[n]] = [a[n], a[m]]; [b[m], b[n]] = [b[n], b[m]];
          n = m;
        }
      }
      return top;
    }
  }

  class NasaTraversePlanner {
    constructor(gridHelper, table = TRAVERSE_COST_TABLE) {
      this.geo = gridHelper || (ns.MolaAStarGridHelper ? new ns.MolaAStarGridHelper() : null);
      this.table = table;
      this.maxCellsLongSide = 240;
      this.craterBins = null;
    }

    /* ---------------- Projeksiyon (yerel esdikdortgen, antimeridyen guvenli) ---------------- */
    makeFrame(orig, dest) {
      const dLon = this.geo.shortestDeltaLon(orig.lon, dest.lon);
      const lat0 = (orig.lat + dest.lat) / 2;
      const lon0 = this.geo.wrapLon(orig.lon + dLon / 2);
      const cos0 = Math.max(0.2, Math.cos((lat0 * Math.PI) / 180));
      return {
        lat0, lon0, cos0,
        toXY: (lat, lon) => ({ x: this.geo.shortestDeltaLon(lon0, lon) * cos0 * KM_PER_DEG, y: (lat - lat0) * KM_PER_DEG }),
        toGeo: (x, y) => ({
          lat: Math.max(-89.5, Math.min(89.5, lat0 + y / KM_PER_DEG)),
          lon: this.geo.wrapLon(lon0 + x / (cos0 * KM_PER_DEG))
        })
      };
    }

    /** Aktif tehlikeleri ve kraterleri tek tip "engel" listesine cevirir */
    collectObstacles(orig, dest, factors) {
      const g = this.geo;
      const T = this.table;
      const obs = [];
      const endpointInside = (lat, lon, rDeg) => (
        g.sphericalAngleDeg(orig.lat, orig.lon, lat, lon) < rDeg || g.sphericalAngleDeg(dest.lat, dest.lon, lat, lon) < rDeg
      );
      const addZones = (zones, kind, tag) => {
        for (const z of zones || []) {
          const r = Number(z.radiusDeg) || 6;
          obs.push({ kind, tag, lat: z.lat, lon: z.lon, r, spec: T[kind], name: z.name, soft: endpointInside(z.lat, z.lon, r * T[kind].lethal) });
        }
      };
      if (factors?.acidRain?.enabled) addZones(factors.acidRain.zones, "acidRain", TAG.ACID);
      if (factors?.dustStorm?.enabled) addZones(factors.dustStorm.zones, "dustStorm", TAG.STORM);
      if (factors?.radiation?.enabled) addZones(factors.radiation.zones, "radiation", TAG.RAD);

      this.hazardsCache = obs.slice();
      const craters = typeof g.getKnownCraters === "function" ? g.getKnownCraters() : [];
      for (const c of craters) {
        obs.push(this.makeCraterObstacle(c.lat, c.lon, c.radDeg, c.name, orig, dest, Math.round(c.radDeg * 2 * KM_PER_DEG)));
      }
      return obs;
    }

    /** Krateri engel nesnesine cevirir; baslangic/hedef icindeyse yumusak, firtina yakinindaysa genis marjli */
    makeCraterObstacle(lat, lon, rDeg, name, orig, dest, diamKm) {
      const g = this.geo; const T = this.table.crater;
      const soft = g.sphericalAngleDeg(orig.lat, orig.lon, lat, lon) < rDeg * T.lethal
        || g.sphericalAngleDeg(dest.lat, dest.lon, lat, lon) < rDeg * T.lethal;
      const stormy = (this.hazardsCache || []).some((h) => g.sphericalAngleDeg(lat, lon, h.lat, h.lon) < h.r + rDeg);
      const spec = stormy ? { ...T, lethal: T.lethal + T.stormLethalBoost, buffer: T.buffer + 0.1 } : T;
      return { kind: "crater", tag: TAG.CRATER, lat, lon, r: rDeg, spec, name: name || "Krater", soft, diamKm };
    }

    /** NASA/USGS Robbins katalogunu 5x5 derecelik kovalara indeksler (bir kez) */
    getCraterBins() {
      if (this.craterBins) return this.craterBins;
      const arr = ns.ROBBINS_CRATERS;
      const bins = new Map();
      if (arr) {
        for (let i = 0; i < arr.length; i += 3) {
          const key = `${Math.floor((arr[i] + 90) / 5)}:${Math.floor((((arr[i + 1] + 180) % 360) + 360) % 360 / 5)}`;
          if (!bins.has(key)) bins.set(key, []);
          bins.get(key).push(i);
        }
      }
      this.craterBins = bins;
      return bins;
    }

    /** Planlama kutusundaki Robbins kraterlerini engel olarak ekler */
    addCatalogCraters(frame, bounds, obstacles, orig, dest) {
      const arr = ns.ROBBINS_CRATERS;
      if (!arr) return obstacles;
      const bins = this.getCraterBins();
      let minLat = 90; let maxLat = -90; let minDl = 360; let maxDl = -360;
      for (let t = 0; t <= 20; t++) {
        const fx = bounds.minX + (bounds.maxX - bounds.minX) * t / 20;
        const fy = bounds.minY + (bounds.maxY - bounds.minY) * t / 20;
        for (const [x, y] of [[fx, bounds.minY], [fx, bounds.maxY], [bounds.minX, fy], [bounds.maxX, fy]]) {
          const gp = frame.toGeo(x, y); const dl = this.geo.shortestDeltaLon(frame.lon0, gp.lon);
          minLat = Math.min(minLat, gp.lat); maxLat = Math.max(maxLat, gp.lat); minDl = Math.min(minDl, dl); maxDl = Math.max(maxDl, dl);
        }
      }
      const out = obstacles.slice();
      const seen = new Set();
      for (let la = Math.floor((minLat - 2 + 90) / 5); la <= Math.floor((maxLat + 2 + 90) / 5); la++) {
        for (let dl = minDl - 5; dl <= maxDl + 5; dl += 5) {
          const lonB = Math.floor((((frame.lon0 + dl + 180) % 360) + 360) % 360 / 5);
          const key = `${la}:${lonB}`;
          if (seen.has(key)) continue;
          seen.add(key);
          for (const i of bins.get(key) || []) {
            const lat = arr[i]; const lon = arr[i + 1]; const diam = arr[i + 2];
            const p = frame.toXY(lat, lon); const rKm = diam / 2 * 1.4;
            if (p.x < bounds.minX - rKm || p.x > bounds.maxX + rKm || p.y < bounds.minY - rKm || p.y > bounds.maxY + rKm) continue;
            out.push(this.makeCraterObstacle(lat, lon, diam / 2 / KM_PER_DEG, `Krater (${diam.toFixed(0)} km)`, orig, dest, diam));
          }
        }
      }
      return out;
    }

    /** A-B dogrusunu tikayan engelleri de kapsayan planlama kutusu */
    computeBounds(frame, a, b, obstacles, padScale) {
      const D = Math.hypot(b.x - a.x, b.y - a.y);
      const pad = Math.max(40, D * 0.22) * padScale;
      let minX = Math.min(a.x, b.x) - pad; let maxX = Math.max(a.x, b.x) + pad;
      let minY = Math.min(a.y, b.y) - pad; let maxY = Math.max(a.y, b.y) + pad;
      const segDist = (p) => {
        const vx = b.x - a.x; const vy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / (vx * vx + vy * vy || 1)));
        return Math.hypot(a.x + vx * t - p.x, a.y + vy * t - p.y);
      };
      for (const o of obstacles) {
        if (o.soft) continue;
        const c = frame.toXY(o.lat, o.lon);
        const rKm = o.r * KM_PER_DEG * o.spec.buffer;
        if (segDist(c) < rKm + pad) {
          const m = rKm + Math.max(30, rKm * 0.25) * padScale;
          minX = Math.min(minX, c.x - m); maxX = Math.max(maxX, c.x + m);
          minY = Math.min(minY, c.y - m); maxY = Math.max(maxY, c.y + m);
        }
      }
      // Asiri genis kutulari sinirla (en fazla A-B mesafesinin ~3 kati + 1500 km)
      const cap = D * 1.5 + 1500 * padScale;
      const cx = (a.x + b.x) / 2; const cy = (a.y + b.y) / 2;
      minX = Math.max(minX, cx - cap); maxX = Math.min(maxX, cx + cap);
      minY = Math.max(minY, cy - cap); maxY = Math.min(maxY, cy + cap);
      minY = Math.max(minY, (-89 - frame.lat0) * KM_PER_DEG);
      maxY = Math.min(maxY, (89 - frame.lat0) * KM_PER_DEG);
      return { minX, maxX, minY, maxY };
    }

    /** GESTALT benzeri hucre maliyet haritasi: her hucreye egim, tehlike ve krater degeri atanir */
    /** GESTALT benzeri hucre maliyet haritasi: her hucreye egim, tehlike ve krater degeri atanir */
    buildCostMap(frame, bounds, obstacles, softenLevel) {
      const T = this.table;
      const g = this.geo;
      const spanX = bounds.maxX - bounds.minX; const spanY = bounds.maxY - bounds.minY;
      const cellKm = Math.max(spanX, spanY) / this.maxCellsLongSide;
      const nx = Math.max(16, Math.ceil(spanX / cellKm) + 1);
      const ny = Math.max(16, Math.ceil(spanY / cellKm) + 1);
      const N = nx * ny;
      const cost = new Float32Array(N);
      const elev = new Float32Array(N);
      const tags = new Uint8Array(N);
      const lethal = new Uint8Array(N);
      const rowScale = new Float32Array(ny);
      const cellLat = new Float32Array(N);
      const cellLon = new Float32Array(N);
      const topo = ns.marsTopo || null;
      const hasTele = topo && typeof topo.getSurfaceTelemetry === "function";

      for (let j = 0; j < ny; j++) {
        const lat = frame.toGeo(0, bounds.minY + j * cellKm).lat;
        rowScale[j] = Math.max(0.05, Math.cos((lat * Math.PI) / 180)) / frame.cos0;
      }

      // 1) Arazi: egim maliyeti ve > s_max lethal (GESTALT egim kriteri)
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const { lat, lon } = frame.toGeo(bounds.minX + i * cellKm, bounds.minY + j * cellKm);
          cellLat[k] = lat; cellLon[k] = lon;
          const tele = hasTele ? topo.getSurfaceTelemetry(lat, lon) : { elevM: 0, slopeDeg: 1 };
          elev[k] = tele.elevM || 0;
          const s = tele.slopeDeg || 0;
          if (s > T.slope.maxSlopeDeg) { lethal[k] = 1; tags[k] |= TAG.SLOPE; }
          cost[k] = 1 + T.slope.weight * (s / T.slope.maxSlopeDeg) ** 2;
        }
      }

      // 2) Engeller: her engel yalnizca kendi kutusundaki hucrelere rasterlanir.
      //    Ihtiyatli rasterlama: krater icin hucre yari-kosegeni kadar ek pay -> kucuk krater hucre arasina kacamaz.
      // Kraterler hucre merkezine gore TAM olarak rasterlanir (sisirme yok); hucreden kucuk kraterler
      // ayrica her yol parcasinda kesin cember-dogru kesisim testiyle (segmentHitsCrater) engellenir.
      const halfDiagDeg = 0;
      const circles = [];
      for (const o of obstacles) {
        const sp = o.spec;
        const isCrater = o.kind === "crater";
        const soften = o.soft
          || (softenLevel >= 1 && !isCrater)
          || (softenLevel >= 1 && isCrater && o.diamKm <= T.crater.emergencySoftMaxDiamKm)
          || softenLevel >= 2;
        const c = frame.toXY(o.lat, o.lon);
        if (isCrater && !soften) {
          const cjr = Math.max(0, Math.min(ny - 1, Math.round((c.y - bounds.minY) / cellKm)));
          circles.push({ x: (c.x - bounds.minX) / cellKm, y: (c.y - bounds.minY) / cellKm, kx: rowScale[cjr], R: (o.r * sp.lethal * KM_PER_DEG) / cellKm });
        }
        const reachCells = (o.r * sp.buffer * KM_PER_DEG) / cellKm + 1.5;
        const cj = (c.y - bounds.minY) / cellKm;
        const ci = (c.x - bounds.minX) / cellKm;
        const j0 = Math.max(0, Math.floor(cj - reachCells)); const j1 = Math.min(ny - 1, Math.ceil(cj + reachCells));
        for (let j = j0; j <= j1; j++) {
          const wx = reachCells / Math.max(0.05, rowScale[j]);
          const i0 = Math.max(0, Math.floor(ci - wx)); const i1 = Math.min(nx - 1, Math.ceil(ci + wx));
          for (let i = i0; i <= i1; i++) {
            const k = j * nx + i;
            const dDeg = g.sphericalAngleDeg(cellLat[k], cellLon[k], o.lat, o.lon);
            const d = dDeg / o.r;
            const dLethal = isCrater ? (dDeg - halfDiagDeg) / o.r : d;
            if (dLethal < sp.lethal) {
              tags[k] |= o.tag;
              if (soften) cost[k] += sp.softCore * Math.max(0.5, 1 - 0.5 * Math.max(0, d) / sp.lethal);
              else lethal[k] = 1;
            } else if (d < sp.buffer) {
              const t = (sp.buffer - d) / (sp.buffer - sp.lethal);
              cost[k] += sp.bufferCost * t * t;
            }
          }
        }
      }
      // Kesin geometri icin krater cemberleri 2x2 hucrelik kovalara indekslenir
      const BS = 2; const bw = Math.ceil(nx / BS) + 1; const bh = Math.ceil(ny / BS) + 1;
      const buckets = new Array(bw * bh);
      circles.forEach((cc, ci) => {
        const rx = cc.R / Math.max(0.05, cc.kx);
        const x0 = Math.max(0, Math.floor((cc.x - rx) / BS)); const x1 = Math.min(bw - 1, Math.floor((cc.x + rx) / BS));
        const y0 = Math.max(0, Math.floor((cc.y - cc.R) / BS)); const y1 = Math.min(bh - 1, Math.floor((cc.y + cc.R) / BS));
        for (let by = y0; by <= y1; by++) for (let bx = x0; bx <= x1; bx++) (buckets[by * bw + bx] || (buckets[by * bw + bx] = [])).push(ci);
      });
      return { nx, ny, cellKm, cost, elev, tags, lethal, rowScale, bounds, frame, circles, buckets, BS, bw, bh, stamp: new Uint32Array(circles.length), stampId: 0 };
    }

    /** Bilinear rakim (m) */
    elevAt(m, x, y) {
      const i0 = Math.max(0, Math.min(m.nx - 1, Math.floor(x))); const j0 = Math.max(0, Math.min(m.ny - 1, Math.floor(y)));
      const i1 = Math.min(m.nx - 1, i0 + 1); const j1 = Math.min(m.ny - 1, j0 + 1);
      const fx = Math.max(0, Math.min(1, x - i0)); const fy = Math.max(0, Math.min(1, y - j0));
      const e = m.elev;
      const top = e[j0 * m.nx + i0] * (1 - fx) + e[j0 * m.nx + i1] * fx;
      const bot = e[j1 * m.nx + i0] * (1 - fx) + e[j1 * m.nx + i1] * fx;
      return top * (1 - fy) + bot * fy;
    }

    /** Dogru parcasi herhangi bir (sert) krater cemberine giriyor mu? Baslangici zaten iceride olan cember yok sayilir (cikisa izin). */
    segmentHitsCrater(m, x0, y0, x1, y1) {
      if (!m.circles || m.circles.length === 0) return false;
      const BS = m.BS;
      const bx0 = Math.max(0, Math.floor(Math.min(x0, x1) / BS)); const bx1 = Math.min(m.bw - 1, Math.floor(Math.max(x0, x1) / BS));
      const by0 = Math.max(0, Math.floor(Math.min(y0, y1) / BS)); const by1 = Math.min(m.bh - 1, Math.floor(Math.max(y0, y1) / BS));
      const id = ++m.stampId;
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const list = m.buckets[by * m.bw + bx];
          if (!list) continue;
          for (const ci of list) {
            if (m.stamp[ci] === id) continue;
            m.stamp[ci] = id;
            const c = m.circles[ci];
            const ax = (x0 - c.x) * c.kx; const ay = y0 - c.y;
            const R2 = c.R * c.R;
            if (ax * ax + ay * ay < R2) continue; // baslangic iceride: disari cikis serbest
            const vx = (x1 - x0) * c.kx; const vy = y1 - y0;
            const L2 = vx * vx + vy * vy || 1e-12;
            const t = Math.max(0, Math.min(1, -(ax * vx + ay * vy) / L2));
            const px = ax + vx * t; const py = ay + vy * t;
            if (px * px + py * py < R2) return true;
          }
        }
      }
      return false;
    }

    /**
     * Field D* tarzi cizgi integrali: (x0,y0)->(x1,y1) dogru parcasinin maliyeti.
     * Lethal hucreye degerse veya yol boyu egim limiti asilirsa Infinity doner.
     */
    segmentCost(m, x0, y0, x1, y1) {
      const T = this.table;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len === 0) return 0;
      if (this.segmentHitsCrater(m, x0, y0, x1, y1)) return Infinity;
      const steps = Math.max(1, Math.ceil(len / 0.5));
      const maxGrade = Math.tan((T.climb.maxGradeDeg * Math.PI) / 180);
      let total = 0;
      let px = x0; let py = y0; let pe = this.elevAt(m, x0, y0);
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const qx = x0 + (x1 - x0) * t; const qy = y0 + (y1 - y0) * t;
        const mx = (px + qx) / 2; const my = (py + qy) / 2;
        const ci = Math.round(mx); const cj = Math.round(my);
        if (ci < 0 || cj < 0 || ci >= m.nx || cj >= m.ny) return Infinity;
        const k = cj * m.nx + ci;
        if (m.lethal[k]) return Infinity;
        const sx = (qx - px) * m.rowScale[cj]; const sy = qy - py;
        const lenKm = Math.hypot(sx, sy) * m.cellKm;
        const qe = this.elevAt(m, qx, qy);
        const grade = lenKm > 0 ? (qe - pe) / (lenKm * 1000) : 0;
        const ratio = Math.abs(grade) / maxGrade;
        if (ratio > 1) return Infinity;
        const gm = 1 + (grade > 0 ? T.climb.upWeight : T.climb.downWeight) * ratio * ratio;
        total += lenKm * m.cost[k] * gm;
        px = qx; py = qy; pe = qe;
      }
      return total;
    }

    /** 16 yonlu A* (kucuk hucre acilarinda bile merdiven etkisini azaltir) */
    search(m, si, sj, gi, gj) {
      const N = m.nx * m.ny;
      const gScore = new Float64Array(N).fill(Infinity);
      const parent = new Int32Array(N).fill(-1);
      const closed = new Uint8Array(N);
      const start = sj * m.nx + si; const goal = gj * m.nx + gi;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
        [2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
      const h = (i, j) => Math.hypot((gi - i) * m.rowScale[j], gj - j) * m.cellKm;
      const heap = new MinHeap();
      gScore[start] = 0;
      heap.push(start, h(si, sj));
      while (heap.size) {
        const cur = heap.pop();
        if (closed[cur]) continue;
        if (cur === goal) break;
        closed[cur] = 1;
        const ci = cur % m.nx; const cj = (cur / m.nx) | 0;
        for (const [di, dj] of dirs) {
          const ni = ci + di; const nj = cj + dj;
          if (ni < 0 || nj < 0 || ni >= m.nx || nj >= m.ny) continue;
          const nk = nj * m.nx + ni;
          if (closed[nk] || m.lethal[nk]) continue;
          const ec = this.segmentCost(m, ci, cj, ni, nj);
          if (!Number.isFinite(ec)) continue;
          const tg = gScore[cur] + ec;
          if (tg < gScore[nk]) {
            gScore[nk] = tg; parent[nk] = cur;
            heap.push(nk, tg + h(ni, nj));
          }
        }
      }
      if (!Number.isFinite(gScore[goal])) return null;
      const cells = [];
      for (let c = goal; c !== -1; c = parent[c]) cells.push({ x: c % m.nx, y: (c / m.nx) | 0, g: gScore[c] });
      cells.reverse();
      return { cells, cost: gScore[goal] };
    }

    /**
     * Maliyet-bilincli ip germe (string pulling / Theta* sonrasi): Bir capa noktasindan, duz cizgi
     * maliyeti ızgara yolunun maliyetini %3'ten fazla asmayan en uzak noktaya kadar duz git.
     * Sonuc: acik arazide tek duz cizgi, engel etrafinda yalnizca gerekli donus noktalari.
     */
    pullString(m, cells) {
      if (cells.length <= 2) return cells.slice();
      const out = [cells[0]];
      let a = 0;
      while (a < cells.length - 1) {
        let best = a + 1; let fails = 0;
        for (let b = a + 2; b < cells.length; b++) {
          const lc = this.segmentCost(m, cells[a].x, cells[a].y, cells[b].x, cells[b].y);
          if (Number.isFinite(lc) && lc <= (cells[b].g - cells[a].g) * 1.03 + 1e-6) { best = b; fails = 0; } else if (++fails > 12) break;
        }
        out.push(cells[best]);
        a = best;
      }
      return out;
    }

    /** Geri donen sivri uclari / kucuk ilmekleri temizler (yalnizca kestirme guvenliyse) */
    removeSpikes(m, pts) {
      let P = pts.slice();
      for (let pass = 0; pass < 4; pass++) {
        let changed = false;
        const out = [P[0]];
        for (let i = 1; i < P.length - 1; i++) {
          const A = out[out.length - 1]; const B = P[i]; const C = P[i + 1];
          const ux = B.x - A.x; const uy = B.y - A.y; const vx = C.x - B.x; const vy = C.y - B.y;
          const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
          if (cos < -0.2 && Number.isFinite(this.segmentCost(m, A.x, A.y, C.x, C.y))) { changed = true; continue; }
          out.push(B);
        }
        out.push(P[P.length - 1]);
        P = out;
        if (!changed) break;
      }
      return P;
    }

    /** Lethal hucrelere olan uzaklik (hucre) — iki gecisli chamfer mesafe donusumu */
    clearanceMap(m) {
      const N = m.nx * m.ny; const d = new Float32Array(N);
      for (let k = 0; k < N; k++) d[k] = m.lethal[k] ? 0 : 1e6;
      const W = m.nx; const D1 = 1; const D2 = Math.SQRT2;
      for (let j = 0; j < m.ny; j++) for (let i = 0; i < W; i++) {
        const k = j * W + i; let v = d[k];
        if (i > 0) v = Math.min(v, d[k - 1] + D1);
        if (j > 0) { v = Math.min(v, d[k - W] + D1); if (i > 0) v = Math.min(v, d[k - W - 1] + D2); if (i < W - 1) v = Math.min(v, d[k - W + 1] + D2); }
        d[k] = v;
      }
      for (let j = m.ny - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
        const k = j * W + i; let v = d[k];
        if (i < W - 1) v = Math.min(v, d[k + 1] + D1);
        if (j < m.ny - 1) { v = Math.min(v, d[k + W] + D1); if (i < W - 1) v = Math.min(v, d[k + W + 1] + D2); if (i > 0) v = Math.min(v, d[k + W - 1] + D2); }
        d[k] = v;
      }
      return d;
    }

    /**
     * Bosluk-uyarlamali kose yuvarlama:
     *  - Dar gecit / engele yakin donus  -> kucuk yay (gerektigi yerde keskin, zikzak korunur)
     *  - Genis acik alan                 -> daha yumusak yay, ama bacak boyunun %40'i ile sinirli (asiri oval yok)
     *  - 100 dereceden keskin (switchback) donuslerde yay %15 ile sinirlanir.
     *  Her egri ornegi tekrar lethal kontrolunden gecer; tehlikeye giriyorsa yay yarilanir.
     */
    smooth(m, verts) {
      if (verts.length <= 2) return verts.map((v) => ({ x: v.x, y: v.y }));
      const clr = this.clearanceMap(m);
      const clrAt = (x, y) => clr[Math.max(0, Math.min(m.ny - 1, Math.round(y))) * m.nx + Math.max(0, Math.min(m.nx - 1, Math.round(x)))];
      const ok = (x, y) => {
        const i = Math.round(x); const j = Math.round(y);
        return i >= 0 && j >= 0 && i < m.nx && j < m.ny && !m.lethal[j * m.nx + i];
      };
      const out = [{ x: verts[0].x, y: verts[0].y }];
      for (let k = 1; k < verts.length - 1; k++) {
        const P = out[out.length - 1]; const V = verts[k]; const Q = verts[k + 1];
        const ix = V.x - P.x; const iy = V.y - P.y; const ox = Q.x - V.x; const oy = Q.y - V.y;
        const li = Math.hypot(ix, iy) || 1; const lo = Math.hypot(ox, oy) || 1;
        const cosT = Math.max(-1, Math.min(1, (ix * ox + iy * oy) / (li * lo)));
        const turn = Math.acos(cosT); // 0 = duz
        if (turn < 0.05) { out.push({ x: V.x, y: V.y }); continue; }
        const legFrac = turn > (100 * Math.PI) / 180 ? 0.15 : 0.40;
        const clearanceLimit = (1.2 * Math.max(0.6, clrAt(V.x, V.y))) / Math.max(0.2, Math.sin(turn / 2));
        let t = Math.min(li * legFrac, lo * legFrac, clearanceLimit, 10);
        let pts = null;
        for (let attempt = 0; attempt < 5 && t > 0.2; attempt++, t *= 0.5) {
          const ax = V.x - (ix / li) * t; const ay = V.y - (iy / li) * t;
          const bx = V.x + (ox / lo) * t; const by = V.y + (oy / lo) * t;
          const n = Math.max(3, Math.ceil(turn / 0.17));
          const cand = [];
          let safe = true;
          let prevPt = out[out.length - 1];
          for (let s = 0; s <= n; s++) {
            const u = s / n; const w = 1 - u;
            const x = w * w * ax + 2 * w * u * V.x + u * u * bx;
            const y = w * w * ay + 2 * w * u * V.y + u * u * by;
            if (!ok(x, y) || this.segmentHitsCrater(m, prevPt.x, prevPt.y, x, y)) { safe = false; break; }
            cand.push({ x, y });
            prevPt = { x, y };
          }
          if (safe && this.segmentHitsCrater(m, prevPt.x, prevPt.y, Q.x, Q.y)) safe = false;
          if (safe) { pts = cand; break; }
        }
        if (pts) out.push(...pts); else out.push({ x: V.x, y: V.y });
      }
      const L = verts[verts.length - 1];
      out.push({ x: L.x, y: L.y });
      return out;
    }

    /**
     * Ana giris: A (orig) -> B (dest) icin NASA tarzi rota.
     * @returns {{success:boolean, points:Array, stage:number, warning:string|null, stats:Object}}
     */
    plan(orig, dest, factors = {}) {
      if (!this.geo) return { success: false };
      const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const frame = this.makeFrame(orig, dest);
      const a = frame.toXY(orig.lat, orig.lon); const b = frame.toXY(dest.lat, dest.lon);
      const obstacles = this.collectObstacles(orig, dest, factors);
      const stages = [
        { pad: 1.0, soften: 0 },
        { pad: 2.2, soften: 0 },
        { pad: 2.2, soften: 1 },
        { pad: 2.2, soften: 2 }
      ];
      for (let si = 0; si < stages.length; si++) {
        const st = stages[si];
        const bounds = this.computeBounds(frame, a, b, obstacles, st.pad);
        const allObs = this.addCatalogCraters(frame, bounds, obstacles, orig, dest);
        const m = this.buildCostMap(frame, bounds, allObs, st.soften);
        const toCell = (p) => ({
          i: Math.max(0, Math.min(m.nx - 1, Math.round((p.x - bounds.minX) / m.cellKm))),
          j: Math.max(0, Math.min(m.ny - 1, Math.round((p.y - bounds.minY) / m.cellKm)))
        });
        const sc = toCell(a); const gc = toCell(b);
        // Baslangic/hedef hucresi her zaman gecilebilir kabul edilir
        m.lethal[sc.j * m.nx + sc.i] = 0; m.lethal[gc.j * m.nx + gc.i] = 0;
        const res = this.search(m, sc.i, sc.j, gc.i, gc.j);
        if (!res) continue;
        const pulled = this.pullString(m, res.cells);
        const smoothed = this.smooth(m, pulled);
        // Harita cizicisi noktalar arasini duz ciziyor; planlanan geometriyi birebir korumak icin ~1 hucrede bir nokta
        const curve = [smoothed[0]];
        for (let q = 1; q < smoothed.length; q++) {
          const p0 = smoothed[q - 1]; const p1 = smoothed[q];
          const nSeg = Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y)));
          for (let r2 = 1; r2 <= nSeg; r2++) curve.push({ x: p0.x + (p1.x - p0.x) * r2 / nSeg, y: p0.y + (p1.y - p0.y) * r2 / nSeg });
        }
        const safeCurve = this.removeSpikes(m, curve);
        const points = safeCurve.map((p, idx) => {
          if (idx === 0) return { lat: orig.lat, lon: orig.lon };
          if (idx === safeCurve.length - 1) return { lat: dest.lat, lon: dest.lon };
          const geo = frame.toGeo(bounds.minX + p.x * m.cellKm, bounds.minY + p.y * m.cellKm);
          return { lat: Number(geo.lat.toFixed(4)), lon: Number(geo.lon.toFixed(4)) };
        });
        let exposedTags = 0;
        for (const c of res.cells) exposedTags |= m.tags[c.y * m.nx + c.x];
        return {
          success: true,
          stage: si + 1,
          warning: st.soften === 1
            ? "Uyari: Tamamen guvenli gecit yok; afet maruziyeti en aza indirildi (25 km alti kraterler yumusatildi)"
            : (st.soften === 2 ? "Uyari: Acil durum rotasi; engeller yalnizca maliyet olarak sayildi" : null),
          points,
          stats: {
            engine: "NASA GESTALT maliyet haritasi + Field D* tarzi A* + ip germe + bosluk-uyarlamali yumusatma",
            grid: `${m.nx}x${m.ny}`,
            cellKm: Number(m.cellKm.toFixed(2)),
            rawCells: res.cells.length,
            turnVertices: pulled.length - 2,
            pathCost: Number(res.cost.toFixed(1)),
            obstacleCount: allObs.length,
            craterCount: allObs.filter((o) => o.kind === "crater").length,
            exposedTags,
            ms: Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0)
          }
        };
      }
      return { success: false };
    }
  }

  ns.TRAVERSE_COST_TABLE = TRAVERSE_COST_TABLE;
  ns.NasaTraversePlanner = NasaTraversePlanner;
})(typeof window !== "undefined" ? (window.AstroChief = window.AstroChief || {}) : (globalThis.AstroChief = globalThis.AstroChief || {}));

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-23: NASA GESTALT / Field D* / ENav-ACE kaynakli yontem ve maliyet matematigi aciklamasi.
   - Satir 28-46: TRAVERSE_COST_TABLE; her tehlike/arazi turu icin lethal, tampon ve maliyet degiskenleri.
   - Satir 48-80: MinHeap; A* acik listesi icin ikili yigin.
   - Satir 82-110: makeFrame ve collectObstacles; yerel projeksiyon, tehlike + buyuk/kucuk krater siniflandirmasi.
   - Satir 112-140: computeBounds; A-B hattini tikayan engelleri kapsayan uyarlamali planlama kutusu.
   - Satir 142-190: buildCostMap; her hucreye egim, tehlike tamponu, krater ve lethal degeri atanmasi.
   - Satir 192-235: elevAt ve segmentCost; bilinear rakim ve anizotropik egimli Field D* cizgi integrali.
   - Satir 237-275: search; 16 yonlu ikili-yiginli A*.
   - Satir 277-295: pullString; maliyet-bilincli ip germe (gereksiz zikzaklari siler).
   - Satir 297-315: clearanceMap; lethal hucrelere chamfer mesafe donusumu.
   - Satir 317-360: smooth; bosluk-uyarlamali kose yuvarlama (dar yerde keskin, genis yerde yumusak, asiri oval yok).
   - Satir 362-415: plan; 3 asamali (normal / genis kutu / son care maruziyet-minimum) ana planlama girisi.
   ========================================================================== */
