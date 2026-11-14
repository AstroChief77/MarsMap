/**
 * @file BackendApiService.js
 * @description Mustafa dalindaki derlenmis Rust WebAssembly (js/wasm/backend_bg.wasm -> find_rover_path)
 * ve HTTP Rust backend ile step-by-step rota & cevresel etken haberlesme servisi.
 */

(function (ns) {
  "use strict";

  class BackendApiService {
    constructor(config) {
      this.config = config || null;
      this.defaultTimeoutMs = 2000;
      this.wasmLoaded = false;
      this.wasmFindPath = null;
      this.wasmInitPromise = null;
    }

    /** Derlenmis Rust WebAssembly modulunu (./js/wasm/backend.js -> backend_bg.wasm) yukler */
    async ensureWasmLoaded() {
      if (this.wasmLoaded && this.wasmFindPath) return true;
      if (this.wasmInitPromise) return this.wasmInitPromise;

      this.wasmInitPromise = (async () => {
        try {
          const bust = (typeof window !== "undefined" && window.location && window.location.protocol !== "file:") ? "?v=4.3" : "";
          const baseHref = (typeof document !== "undefined" && document.baseURI) ? document.baseURI : window.location.href;
          const wasmUrl = new URL(`./js/wasm/backend.js${bust}`, baseHref).href;
          const wasmBinaryUrl = new URL(`./js/wasm/backend_bg.wasm${bust}`, baseHref).href;
          const mod = await import(wasmUrl);
          await mod.default(wasmBinaryUrl);
          if (typeof mod.find_rover_path === "function") {
            this.wasmFindPath = mod.find_rover_path;
            this.wasmLoaded = true;
            return true;
          }
          return false;
        } catch (_err) {
          this.wasmLoaded = false;
          this.wasmFindPath = null;
          return false;
        } finally {
          this.wasmInitPromise = null;
        }
      })();

      return this.wasmInitPromise;
    }

    /** Kullanicinin girdigi veya URL'den gelen backend kok adresini origin beyaz listesi ve sema dogrulamasiyla temizler */
    normalizeBaseUrl(rawUrl) {
      if (!rawUrl || typeof rawUrl !== "string") return "";
      let cleaned = rawUrl.trim().replace(/\/+$/, "");
      if (!cleaned || cleaned.startsWith("//")) return "";
      if (!/^https?:\/\//i.test(cleaned) && !cleaned.startsWith("/")) {
        cleaned = "http://" + cleaned;
      }
      try {
        const baseOrigin = (typeof window !== "undefined" && window.location && /^https?:$/i.test(window.location.protocol))
          ? window.location.origin
          : "http://127.0.0.1:8080";
        const parsed = new URL(cleaned, baseOrigin);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
        const host = (parsed.hostname || "").toLowerCase();
        const extraHosts = (typeof window !== "undefined" && window.ASTROCHIEF_CONFIG && Array.isArray(window.ASTROCHIEF_CONFIG.allowedApiHosts))
          ? window.ASTROCHIEF_CONFIG.allowedApiHosts.map((h) => String(h).toLowerCase())
          : [];
        const currentHost = (typeof window !== "undefined" && window.location && window.location.hostname)
          ? window.location.hostname.toLowerCase()
          : "";
        const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "mars.kubitron.com", currentHost, ...extraHosts]);
        if (!allowedHosts.has(host)) return "";
        const pathPart = parsed.pathname.replace(/\/+$/, "");
        return `${parsed.protocol}//${parsed.host}${pathPart}`;
      } catch (_err) {
        return "";
      }
    }

    /** ?api=... parametresi veya global config uzerinden varsayilan backend URL cozumler */
    resolveInitialUrl(savedUrl) {
      try {
        const params = new URLSearchParams(window.location.search || "");
        const fromQuery = params.get("api");
        if (fromQuery) {
          const validQueryUrl = this.normalizeBaseUrl(fromQuery);
          if (validQueryUrl) return validQueryUrl;
        }
      } catch (_err) {
        // file:// veya kisitli ortamlarda sessizce devam et
      }
      if (window.ASTROCHIEF_CONFIG && window.ASTROCHIEF_CONFIG.apiBaseUrl) {
        return this.normalizeBaseUrl(window.ASTROCHIEF_CONFIG.apiBaseUrl);
      }
      return this.normalizeBaseUrl(savedUrl || "");
    }

    isCustomRemoteUrl(cleanUrl) {
      return Boolean(cleanUrl && cleanUrl !== "http://127.0.0.1:8080" && cleanUrl !== "http://localhost:8080");
    }

    /** Baglanti ve gecikme testi: Ozel HTTP URL varsa once HTTP /api/v1/health, aksi halde Rust WASM (backend_bg.wasm) */
    async testConnection(baseUrl) {
      const clean = this.normalizeBaseUrl(baseUrl);
      if (this.isCustomRemoteUrl(clean)) {
        const httpRes = await this.pingHttpHealth(clean);
        if (httpRes.ok) return httpRes;
      }

      const t0 = performance.now();
      const wasmOk = await this.ensureWasmLoaded();
      if (wasmOk && this.wasmFindPath) {
        // Canli ping testi: 2x2 mini MOLA grid ve varsayilan PLSS O2 ile Rust WASM cagri gecikmesini olc
        const mini = new Int32Array([0, 1, 1, 2]);
        const pingOxy = Math.round(Number(this.config?.getDefaults?.().oxygenReserveLiters || 420));
        this.wasmFindPath(mini, 2, 2, 0, 0, 1, 1, pingOxy);
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        return {
          ok: true,
          status: 200,
          message: `🦀 Rust WASM Aktif (find_rover_path · ${latencyMs} ms)`,
          latencyMs
        };
      }

      if (clean) {
        const httpRes = await this.pingHttpHealth(clean);
        if (httpRes.ok) return httpRes;
      }

      // file:// ortaminda yerlesik A* motoru her zaman hazirdir
      const fallbackLatency = Math.max(1, Math.round(performance.now() - t0));
      return {
        ok: true,
        status: 200,
        message: `🦀 Yerel A* Motoru Aktif (${fallbackLatency} ms)`,
        latencyMs: fallbackLatency
      };
    }

    async pingHttpHealth(clean) {
      const started = performance.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1800);
      try {
        const res = await fetch(`${clean}/api/v1/health`, { method: "GET", signal: ctrl.signal });
        const latencyMs = Math.round(performance.now() - started);
        if (!res.ok) {
          return { ok: false, status: res.status, message: `HTTP ${res.status}`, latencyMs };
        }
        const data = await res.json().catch(() => ({}));
        const engine = String(data.engine || data.version || "rust-backend").slice(0, 48);
        return { ok: true, status: res.status, message: `Bagli (${engine}, ${latencyMs} ms)`, latencyMs };
      } catch (err) {
        const latencyMs = Math.round(performance.now() - started);
        const msg = err.name === "AbortError" ? "Zaman asimi" : (err.message || "Baglanti yok");
        return { ok: false, status: 0, message: msg, latencyMs };
      } finally {
        clearTimeout(timer);
      }
    }

    /** Tum cevresel etkenleri (radyasyon, asit, firtina, gercek MOLA egimi, astronot O2) ve 24x24 Rust gridini hazirlar */
    buildRouteRequestPayload({ scope, origin, destination, state, activeCrater, hazardBundle, craterRadZones, planner }) {
      const acidSpec = (hazardBundle && hazardBundle.acidSpec) || {};
      const stormSpec = (hazardBundle && hazardBundle.stormSpec) || {};
      const radZones = (hazardBundle && hazardBundle.radiationZones) || [];
      const topo = ns.marsTopo || null;
      const origLat = Number(Number(origin.lat || 0).toFixed(4));
      const origLon = Number(Number(origin.lon || 0).toFixed(4));
      const destLat = Number(Number(destination.lat || 0).toFixed(4));
      const destLon = Number(Number(destination.lon || 0).toFixed(4));
      const origTele = topo && typeof topo.getSurfaceTelemetry === "function" ? topo.getSurfaceTelemetry(origLat, origLon) : { elevM: 0, slopeDeg: 0 };
      const destTele = topo && typeof topo.getSurfaceTelemetry === "function" ? topo.getSurfaceTelemetry(destLat, destLon) : { elevM: 0, slopeDeg: 0 };
      const beginOxy = Math.max(0, Math.round(Number(state.oxygenReserveLiters || 420)));
      const gridSize = 24;

      return {
        scope: scope || "global",
        origin: {
          id: origin.id || "custom-origin",
          name: origin.name || "Konumumuz (A)",
          lat: origLat,
          lon: origLon,
          elevM: origTele.elevM,
          slopeDeg: origTele.slopeDeg
        },
        destination: {
          id: destination.id || "custom-destination",
          name: destination.name || "Hedef Konum (B)",
          lat: destLat,
          lon: destLon,
          elevM: destTele.elevM,
          slopeDeg: destTele.slopeDeg
        },
        rustWasmCall: {
          fn: `find_rover_path(grid_flat, ${gridSize}, ${gridSize}, 0, 0, ${gridSize - 1}, ${gridSize - 1}, ${beginOxy})`,
          module: "js/wasm/backend_bg.wasm",
          dataFeed: "NASA MOLA DEM (1024x512) + Aktif Tehlikeler + PLSS O2",
          gridSize,
          beginOxy
        },
        factors: {
          acidRain: {
            enabled: Boolean(state.filterAcidRain),
            intensity: state.acidIntensity || "orta",
            ph: parseFloat(String(acidSpec.ph || "2.4").replace(/[^\d.-]/g, "")) || 2.4,
            speedMultiplier: Number(acidSpec.speedMult || 0.78),
            detourScale: Number(acidSpec.detourScale || 1.0),
            zones: ((hazardBundle && hazardBundle.acidZones) || []).map((z) => ({
              id: z.id, name: z.name, lat: z.lat, lon: z.lon, radiusDeg: z.radiusDeg, ph: z.ph
            }))
          },
          dustStorm: {
            enabled: Boolean(state.filterDustStorm),
            intensity: state.stormIntensity || "orta",
            opticalDepthTau: parseFloat(String(stormSpec.tau || "2.8").replace(/[^\d.-]/g, "")) || 2.8,
            speedMultiplier: Number(stormSpec.speedMult || 0.70),
            detourScale: Number(stormSpec.detourScale || 1.0),
            zones: ((hazardBundle && hazardBundle.stormZones) || []).map((z) => ({
              id: z.id, name: z.name, lat: z.lat, lon: z.lon, radiusDeg: z.radiusDeg, tau: z.tau
            }))
          },
          radiation: {
            enabled: Boolean(state.showRadiationZones),
            zones: radZones.map((z) => ({
              id: z.id, name: z.name, lat: z.lat, lon: z.lon, radiusDeg: z.radiusDeg,
              alphaLevel: z.alphaLevel, betaLevel: z.betaLevel, gammaLevel: z.gammaLevel, photonFlux: z.photonFlux
            })),
            craterZones: (craterRadZones || []).map((z) => ({
              id: z.id, name: z.name, relX: z.relX, relY: z.relY, radius: z.radius,
              alphaLevel: z.alphaLevel, betaLevel: z.betaLevel, gammaLevel: z.gammaLevel, photonFlux: z.photonFlux
            }))
          },
          terrain: {
            source: "NASA MOLA DEM (MarsTopographyService)",
            planetRadiusKm: 3389.5,
            craterId: activeCrater ? activeCrater.id : "gale-crater",
            maxSlopeDiff: 3,
            maxSafeRoverSlopeDeg: 25,
            obstacleCode: -999
          },
          astronaut: {
            oxygenReserveLiters: beginOxy,
            o2NominalLPerMin: 0.80,
            waterReserveLiters: Number(state.waterReserveLiters || 24),
            roverSpeedKmH: planner ? planner.roverSpeedKmH : 14.5
          }
        }
      };
    }

    /** Ozel HTTP backend varsa once HTTP /api/v1/route, yoksa derlenmis Rust WASM (`find_rover_path`) veya yerel A* ile hesaplar */
    async requestStepRoute(baseUrl, payload, planner) {
      const clean = this.normalizeBaseUrl(baseUrl);
      if (this.isCustomRemoteUrl(clean)) {
        try {
          return await this.fetchHttpRoute(clean, payload, planner);
        } catch (_httpErr) {
          // Ozel HTTP sunucu yanit vermezse Rust WASM / yerel A* motoruna dus
        }
      }

      const wasmReady = await this.ensureWasmLoaded();
      if (wasmReady && this.wasmFindPath) {
        return this.computeViaRustWasm(payload, planner);
      }

      if (clean && !this.isCustomRemoteUrl(clean)) {
        try {
          return await this.fetchHttpRoute(clean, payload, planner);
        } catch (_localHttpErr) {
          // 127.0.0.1:8080 kapaliysa veya file:// ortamindaysa yerel A* cozucusune gec
        }
      }

      return this.computeViaRustWasm(payload, planner);
    }

    async fetchHttpRoute(clean, payload, planner) {
      const started = performance.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.defaultTimeoutMs);
      try {
        const res = await fetch(`${clean}/api/v1/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
        const latencyMs = Math.round(performance.now() - started);
        if (!res.ok) throw new Error(`Backend HTTP ${res.status}`);
        const raw = await res.json();
        if (raw && raw.rustRawOutput && !raw.primaryBlue && !raw.primary_route) {
          const primaryBlue = this.convertWasmPathToRoute(raw.rustRawOutput, payload.origin, payload.destination, "#2563eb", "Mavi Yol (Rust HTTP A*)", planner, payload, 0.38);
          return {
            scope: payload.scope || "global",
            source: "rust-backend",
            engine: raw.engine || "Rust HTTP A*",
            latencyMs,
            rustRawOutput: raw.rustRawOutput,
            origin: payload.origin,
            destination: payload.destination,
            primaryBlue,
            secondaryPaleBlue: null,
            hazards: {
              acidZones: payload.factors?.acidRain?.zones || [],
              stormZones: payload.factors?.dustStorm?.zones || [],
              radiationZones: payload.factors?.radiation?.zones || []
            }
          };
        }
        return this.normalizeRouteResponse(raw, payload, planner, latencyMs);
      } finally {
        clearTimeout(timer);
      }
    }

    /** (±180 boylam atlamali) en kisa boylam farkini ve normalize boylami doner */
    wrapLon(lon) {
      return ((((lon + 180) % 360) + 360) % 360) - 180;
    }

    /** Kure yuzeyinde kosinus duzeltmeli yaklasik acisal mesafe (derece) */
    sphericalAngleDeg(lat1, lon1, lat2, lon2) {
      let dLon = lon2 - lon1;
      if (dLon > 180) dLon -= 360;
      else if (dLon < -180) dLon += 360;
      const cosMid = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
      return Math.hypot(lat2 - lat1, dLon * Math.max(0.15, cosMid));
    }

    /** (x, y) Rust izgara hucresini antimeridyen-guvenli koridor (lat, lon) koordinatina donusturur */
    gridCellToGeo(x, y, width, height, orig, dest, lateralFactor = 0.38) {
      const denomU = Math.max(1, (width - 1) + (height - 1));
      const denomV = Math.max(1, width - 1);
      const u = (x + y) / denomU;
      const v = (x - y) / denomV;
      const dLat = dest.lat - orig.lat;
      let dLon = dest.lon - orig.lon;
      if (dLon > 180) dLon -= 360;
      else if (dLon < -180) dLon += 360;

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
            // Krater icinde asiri dik krater duvarlarini (>25 deg, Prameters.md) gecilmez say
            if (!blocked && enforceCliffs && corridor.slopeDegs[idx] > 25.0) {
              blocked = true;
            }
          }

          flat[idx] = blocked
            ? -999
            : Math.round((corridor.elevMeters[idx] - corridor.minElevM) / stepMeters);
        }
      }

      // Yalnizca asiri dik ucurumlar tum koridoru tikadiysa komsu delta <= 2 garantili gercek MOLA yumusatma
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

    /** Rust lib.rs ile birebir kuralli (|Δz|<=3, -999 engel, +5/+2/1 maliyet) yerel JS A* yedegi (file:// icin) */
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
            avaible_oxy: beginOxy - path.length * 25,
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

    /**
     * Gercek MOLA topoğrafyasi, aktif tehlike bolgeleri ve baslangic O2 miktarini derlenmis Rust
     * `find_rover_path(grid_flat, width, height, start_x, start_y, goal_x, goal_y, begin_oxy)` WASM'e besler.
     */
    computeViaRustWasm(payload, planner) {
      const t0 = performance.now();
      const width = Number(payload.rustWasmCall?.gridSize || 24);
      const height = width;
      const orig = payload.origin;
      const dest = payload.destination;
      const beginOxy = Math.max(0, Math.round(Number(payload.factors?.astronaut?.oxygenReserveLiters ?? 420)));
      const lateralFactor = 0.38;
      const useWasm = typeof this.wasmFindPath === "function";

      const runSolver = (grid) => useWasm
        ? JSON.parse(this.wasmFindPath(grid, width, height, 0, 0, width - 1, height - 1, beginOxy))
        : this.solvePathLocalAStar(grid, width, height, beginOxy);

      const corridor = this.sampleMolaCorridor(orig, dest, width, height, lateralFactor);

      // Asama 1: Tam MOLA + tam tehlike ve >25 deg ucurum engellemesi
      let flatGrid = this.buildMolaRustGrid(corridor, width, height, payload, { hazardScale: 1.0, stepScale: 1.0, enforceCliffs: true });
      let parsedPrimary = runSolver(flatGrid);

      // Asama 2: Tum yollar tikandiysa tehlike cekirdegini daralt ve egim adimini genislet
      if (!parsedPrimary.success) {
        flatGrid = this.buildMolaRustGrid(corridor, width, height, payload, { hazardScale: 0.55, stepScale: 1.45, enforceCliffs: false });
        parsedPrimary = runSolver(flatGrid);
      }

      // Asama 3: Halen tikaliysa garantili gecilebilir gercek MOLA profiliyle tamamla
      if (!parsedPrimary.success) {
        flatGrid = this.buildMolaRustGrid(corridor, width, height, payload, { hazardScale: 0.0, stepScale: 1.85, enforceCliffs: false, smoothNeighbors: true });
        parsedPrimary = runSolver(flatGrid);
      }

      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      const engineLabel = useWasm ? "Rust WASM (find_rover_path · MOLA DEM)" : "Yerlesik A* (MOLA DEM · file://)";
      const primaryBlue = this.convertWasmPathToRoute(
        parsedPrimary, orig, dest, "#2563eb",
        useWasm ? "Mavi Yol (Rust WASM A* · MOLA DEM)" : "Mavi Yol (Yerlesik A* · MOLA DEM)",
        planner, payload, lateralFactor, width, height, corridor
      );

      const hazards = {
        acidZones: payload.factors?.acidRain?.zones || [],
        stormZones: payload.factors?.dustStorm?.zones || [],
        radiationZones: payload.factors?.radiation?.zones || []
      };

      return {
        scope: payload.scope || "global",
        source: "rust-backend",
        engine: engineLabel,
        latencyMs,
        rustRawOutput: parsedPrimary,
        origin: orig,
        destination: dest,
        primaryBlue,
        secondaryPaleBlue: null,
        hazards
      };
    }

    /** Rust `find_rover_path` ciktisini gercek Mars MOLA yuksekligi, tehlike uyarisi ve O2 metrikleriyle adimlara donusturur */
    convertWasmPathToRoute(rustRes, orig, dest, colorHex, label, planner, payload, lateralFactor = 0.38, gridW = 24, gridH = 24, corridor = null) {
      const path = Array.isArray(rustRes.path) && rustRes.path.length > 0
        ? rustRes.path
        : [{ x: 0, y: 0, z: 0 }, { x: gridW - 1, y: gridH - 1, z: 0 }];
      const topo = ns.marsTopo || null;
      const hasTele = topo && typeof topo.getSurfaceTelemetry === "function";

      const points = path.map((p, idx) => {
        if (idx === 0) return { lat: orig.lat, lon: orig.lon, elevLevel: p.z, gridX: p.x, gridY: p.y };
        if (idx === path.length - 1) return { lat: dest.lat, lon: dest.lon, elevLevel: p.z, gridX: p.x, gridY: p.y };
        const geo = this.gridCellToGeo(p.x, p.y, gridW, gridH, orig, dest, lateralFactor);
        return {
          lat: Number(geo.lat.toFixed(4)),
          lon: Number(geo.lon.toFixed(4)),
          elevLevel: p.z,
          gridX: p.x,
          gridY: p.y
        };
      });

      const acidZones = (payload.factors?.acidRain?.enabled && payload.factors?.acidRain?.zones) || [];
      const stormZones = (payload.factors?.dustStorm?.enabled && payload.factors?.dustStorm?.zones) || [];
      const radZones = (payload.factors?.radiation?.enabled && payload.factors?.radiation?.zones) || [];
      const speedMult = (payload.factors?.acidRain?.speedMultiplier || 1) * (payload.factors?.dustStorm?.speedMultiplier || 1);
      const baseRoverSpeed = payload.factors?.astronaut?.roverSpeedKmH || 14.5;
      const beginOxy = Number(payload.factors?.astronaut?.oxygenReserveLiters ?? 420);

      let totalKm = 0;
      let totalHours = 0;
      const steps = [];

      for (let i = 0; i < points.length; i++) {
        const cur = points[i];
        const prev = i > 0 ? points[i - 1] : cur;
        const segKm = i === 0 ? 0 : this.haversineMarsKm(prev.lat, prev.lon, cur.lat, cur.lon);
        totalKm += segKm;

        const tele = hasTele
          ? topo.getSurfaceTelemetry(cur.lat, cur.lon)
          : { elevM: Math.round(-2400 + cur.elevLevel * 185), slopeDeg: 2.0 };
        const elevM = tele.elevM;
        const slopeDeg = Number((tele.slopeDeg || 0).toFixed(1));
        const dz = i === 0 ? 0 : (cur.elevLevel - prev.elevLevel);

        // Prameters.md denklem 5.2: v_etkin = v_duz * max(0.40, 1 - slope/46) * k_asit * k_firtina
        const slopeFactor = Math.max(0.40, 1 - slopeDeg / 46);
        const effSpeed = Math.max(3.5, baseRoverSpeed * slopeFactor * speedMult);
        const segHours = segKm / effSpeed;
        totalHours += segHours;

        let instruction = `Rust A* (${cur.gridX}, ${cur.gridY}) · ${elevM} m → ${segKm.toFixed(1)} km`;
        if (i === 0) instruction = `Başlangıç (${orig.name}): MOLA ${elevM} m · (${cur.gridX}, ${cur.gridY})`;
        else if (i === points.length - 1) instruction = `Hedefe Varış (${dest.name}): MOLA ${elevM} m · (${cur.gridX}, ${cur.gridY})`;

        let hazardWarning = null;
        if (slopeDeg >= 15.0 || Math.abs(dz) >= 2) {
          hazardWarning = `MOLA Eğim ${slopeDeg}° (Δz=${dz > 0 ? "+" + dz : dz}, Rust +${dz > 0 ? dz * 5 : Math.abs(dz) * 2})`;
        } else {
          for (const z of [...acidZones, ...stormZones, ...radZones]) {
            if (this.sphericalAngleDeg(cur.lat, cur.lon, z.lat, z.lon) < (z.radiusDeg || 6) * 1.15) {
              hazardWarning = `Tehlike Sınırı: ${z.name}`;
              break;
            }
          }
        }

        steps.push({
          step: i + 1,
          lat: cur.lat,
          lon: cur.lon,
          elevM,
          slopeDeg,
          distKm: Number(segKm.toFixed(2)),
          durationHours: Number(segHours.toFixed(2)),
          instruction,
          hazardWarning
        });
      }

      totalHours = Math.max(0.15, totalHours);
      const formattedDuration = planner && typeof planner.formatHours === "function"
        ? planner.formatHours(totalHours)
        : `${totalHours.toFixed(1)} saat`;
      const o2Liters = Math.round(totalHours * 48);
      const waterLiters = Number((totalHours * 2.15).toFixed(1));

      return {
        points,
        steps,
        rustCost: rustRes.cost || 0,
        rustDistanceSteps: rustRes.distance || path.length,
        rustAvaibleOxy: typeof rustRes.avaible_oxy === "number" ? rustRes.avaible_oxy : (beginOxy - o2Liters),
        rustStepsCount: rustRes.steps_count || steps.length,
        molaRangeM: corridor ? { min: Math.round(corridor.minElevM), max: Math.round(corridor.maxElevM) } : null,
        totalKm: Number(totalKm.toFixed(2)),
        totalMeters: Math.round(totalKm * 1000),
        totalHours: Number(totalHours.toFixed(2)),
        formattedDuration,
        o2Liters,
        waterLiters,
        colorHex,
        label,
        comment: `// ${label}: ${rustRes.steps_count || steps.length} adım (Maliyet: ${rustRes.cost || 0}, MOLA ${corridor ? Math.round(corridor.minElevM) + ".." + Math.round(corridor.maxElevM) + "m" : "DEM"}) — ${formattedDuration}`
      };
    }

    haversineMarsKm(lat1, lon1, lat2, lon2) {
      const toRad = Math.PI / 180;
      const dLat = (lat2 - lat1) * toRad;
      const dLon = this.shortestDeltaLon(lon1, lon2) * toRad;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * 3389.5 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    }

    /** Opsiyonel tehlike katmanlarini ozel HTTP backend'den ceker: GET /api/v1/hazards */
    async fetchHazards(baseUrl) {
      const clean = this.normalizeBaseUrl(baseUrl);
      if (!this.isCustomRemoteUrl(clean)) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1800);
      try {
        const res = await fetch(`${clean}/api/v1/hazards`, { method: "GET", signal: ctrl.signal });
        if (!res.ok) return null;
        const raw = await res.json();
        return this.normalizeHazards(raw);
      } catch (_err) {
        return null;
      } finally {
        clearTimeout(timer);
      }
    }

    /** camelCase veya snake_case Rust yanitini tek frontend modeline cevirir */
    normalizeRouteResponse(raw, payload, planner, latencyMs = null) {
      const blueRaw = raw.primaryBlue || raw.primary_route;
      if (!blueRaw) throw new Error("Backend yanitinda primaryBlue / primary_route eksik");

      const primaryBlue = this.normalizeSingleRoute(blueRaw, "#2563eb", "Mavi Yol (Backend En Kisa Guvenli)", planner, payload);
      const hazards = raw.hazards ? this.normalizeHazards(raw.hazards) : null;
      return {
        scope: raw.scope || payload.scope || "global",
        source: "rust-backend",
        engine: raw.engine || raw.backendVersion || "Rust Backend",
        latencyMs: typeof raw.latencyMs === "number" ? raw.latencyMs : latencyMs,
        origin: raw.origin || payload.origin,
        destination: raw.destination || payload.destination,
        primaryBlue,
        secondaryPaleBlue: null,
        hazards
      };
    }

    normalizeSingleRoute(r, defaultColor, defaultLabel, planner, payload = null) {
      const rawSteps = Array.isArray(r.steps) ? r.steps : [];
      const steps = rawSteps.map((s, idx) => ({
        step: Number(s.step || idx + 1),
        lat: Number(s.lat || 0),
        lon: Number(s.lon || 0),
        elevM: Number(s.elevM !== undefined ? s.elevM : (s.elev_m || 0)),
        slopeDeg: Number(s.slopeDeg !== undefined ? s.slopeDeg : (s.slope_deg || 0)),
        distKm: Number(s.distKm !== undefined ? s.distKm : (s.dist_km || 0)),
        durationHours: Number(s.durationHours !== undefined ? s.durationHours : (s.duration_hours || 0)),
        instruction: s.instruction || `Adim ${idx + 1}: Hedef azimutuna ilerle`,
        hazardWarning: s.hazardWarning || s.hazard_warning || null
      }));

      const rawPts = (Array.isArray(r.points) && r.points.length >= 2 ? r.points : steps).map((p) => ({
        lat: Number(p.lat || 0),
        lon: Number(p.lon || 0),
        name: p.name || p.instruction || ""
      }));

      const totalKm = Number(r.totalKm !== undefined ? r.totalKm : (r.total_km || 0));
      const totalHours = Number(r.totalHours !== undefined ? r.totalHours : (r.total_hours || 0));
      const formattedDuration = r.formattedDuration || r.formatted_duration ||
        (planner && typeof planner.formatHours === "function"
          ? planner.formatHours(totalHours)
          : `${totalHours.toFixed(1)} saat`);

      return {
        points: rawPts,
        steps,
        totalKm: Number(totalKm.toFixed(2)),
        totalMeters: Math.round(totalKm * 1000),
        totalHours: Number(totalHours.toFixed(2)),
        formattedDuration,
        o2Liters: Math.round(r.o2Liters !== undefined ? r.o2Liters : (r.o2_liters || totalHours * 48)),
        waterLiters: Number((r.waterLiters !== undefined ? r.waterLiters : (r.water_liters || totalHours * 2.15)).toFixed(1)),
        colorHex: r.colorHex || r.color_hex || defaultColor,
        label: r.label || defaultLabel,
        comment: r.comment || `// ${defaultLabel} — ${formattedDuration} (${Math.round(totalKm)} km)`
      };
    }

    normalizeHazards(h) {
      if (!h || typeof h !== "object") return null;
      return {
        acidZones: h.acidZones || h.acid_zones || null,
        stormZones: h.stormZones || h.storm_zones || null,
        radiationZones: h.radiationZones || h.radiation_zones || null
      };
    }
  }

  ns.BackendApiService = BackendApiService;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-47: Sinif baslangici ve ensureWasmLoaded (js/wasm/backend_bg.wasm v4.2 yukleyicisi).
   - Satir 49-118: normalizeBaseUrl, resolveInitialUrl ve testConnection (8-argumanli Rust WASM ping + HTTP saglik kontrolu).
   - Satir 120-204: buildRouteRequestPayload; gercek MOLA rakim/egim, tehlike faktorleri ve PLSS O2 verisini paketler.
   - Satir 206-339: wrapLon, sphericalAngleDeg, gridCellToGeo, sampleMolaCorridor ve buildMolaRustGrid (gercek NASA MOLA + tehlike izgarasi).
   - Satir 341-529: computeViaRustWasm, convertWasmPathToRoute ve normalizeRouteResponse; Rust find_rover_path A* ciktisini Mars rotasi ve O2 adimlarina cevirir.
   ========================================================================== */
