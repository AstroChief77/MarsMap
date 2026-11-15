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
      this.gridHelper = ns.MolaAStarGridHelper ? new ns.MolaAStarGridHelper() : null;
      this.budget = ns.MissionBudgetHelper ? new ns.MissionBudgetHelper() : null;
    }

    /** Derlenmis Rust WebAssembly modulunu (./js/wasm/backend.js -> backend_bg.wasm) yukler */
    async ensureWasmLoaded() {
      if (this.wasmLoaded && this.wasmFindPath) return true;
      if (this.wasmInitPromise) return this.wasmInitPromise;

      this.wasmInitPromise = (async () => {
        try {
          const bust = (typeof window !== "undefined" && window.location && window.location.protocol !== "file:") ? "?v=4.6" : "";
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
        // Canli ping testi: 2x2 mini MOLA grid ve referans PLSS O2 ile Rust WASM cagri gecikmesini olc
        const mini = new Int32Array([0, 1, 1, 2]);
        const pingOxy = Math.round(Number(this.config?.getFactoryDefaults?.().oxygenTankCapacityL || 420));
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

    /** Tum cevresel etkenleri (radyasyon, asit, firtina, gercek MOLA DEM matrisi, krater katalogu ve Prameters.md verisi) hazirlar */
    buildRouteRequestPayload({ scope, origin, destination, state, activeCrater, hazardBundle, craterRadZones, planner }) {
      const acidSpec = (hazardBundle && hazardBundle.acidSpec) || {};
      const stormSpec = (hazardBundle && hazardBundle.stormSpec) || {};
      const radZones = (hazardBundle && hazardBundle.radiationZones) || [];
      const topo = ns.marsTopo || null;
      const origLat = Number(Number(origin.lat || 0).toFixed(4));
      const origLon = Number(Number(origin.lon || 0).toFixed(4));
      const destLat = Number(Number(destination.lat || 0).toFixed(4));
      const destLon = Number(Number(destination.lon || 0).toFixed(4));
      const origTele = topo && typeof topo.getSurfaceTelemetry === "function" ? topo.getSurfaceTelemetry(origLat, origLon) : { elevM: 0, slopeDeg: 0, gx: 0, gy: 0 };
      const destTele = topo && typeof topo.getSurfaceTelemetry === "function" ? topo.getSurfaceTelemetry(destLat, destLon) : { elevM: 0, slopeDeg: 0, gx: 0, gy: 0 };

      const check = this.budget ? this.budget.validateMissionParams(state) : null;
      const modeId = check ? check.mode : "rover-crew";
      const beginOxy = Math.max(0, Math.round(check ? check.normalized.o2L : Number(state.oxygenReserveLiters || 0)));
      const energyKwh = check ? check.normalized.energyKwh : Number(state.energyReserveKwh || state.initialEnergyKwh || 0);
      const userSpeed = check ? check.normalized.speedKmH : Number(state.targetSpeedKmH || (planner ? planner.roverSpeedKmH : 14.5));
      const gridSize = 48;

      const factors = {
        expedition: {
          expeditionMode: modeId,
          roverPlusHumanTogether: true,
          targetSpeedKmH: userSpeed,
          oxygenReserveLiters: beginOxy,
          oxygenTankCapacityL: check ? check.normalized.o2CapL : Number(state.oxygenTankCapacityL || 420),
          energyReserveKwh: energyKwh,
          energyTankCapacityKwh: check ? check.normalized.energyCapKwh : Number(state.energyTankCapacityKwh || 75)
        },
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
          maxSafeAlphaMicroSvPerSec: 0.05,
          maxSafeBetaMsvPerHour: 1.00,
          maxSafeGammaMsvPerHour: 0.50,
          backgroundMsvPerDay: 0.64,
          careerLimitMsv: 600,
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
          demGridResolution: { width: 1024, height: 512, equatorPixelKm: 20.8 },
          planetRadiusKm: 3389.5,
          planetRadiusM: 3389500,
          gravityMs2: 3.721,
          craterId: activeCrater ? activeCrater.id : "gale-crater",
          craterName: activeCrater ? activeCrater.name : "Gale Krateri & Mount Sharp",
          maxSlopeDiff: 3,
          maxSafeRoverSlopeDeg: 25.0,
          maxSafeEvaSlopeDeg: 30.0,
          wheelSlipLimit: 0.40,
          rockRoughnessLimitCm: 30,
          obstacleCode: -999,
          nearbyFeatures: []
        },
        astronaut: {
          oxygenReserveLiters: beginOxy,
          walkbackReserveRatio: 0.25,
          minWalkbackO2Liters: Math.round(beginOxy * 0.25),
          o2NominalLPerMin: 0.80,
          o2ExploreLPerMin: 1.01,
          o2HeavyClimbLPerMin: 2.00,
          o2Peak10MinLPerMin: 2.52,
          o2MaxLPerMin: 4.00,
          o2LitersPerHour: 48.0,
          evaSpeedKmH: 3.6,
          evaSpeedMPerMin: 60.0,
          evaLongWalkKmH: 2.7
        },
        vehicleAndPhysics: {
          vehicleType: modeId,
          roverNominalSpeedKmH: 10.0,
          roverSpeedKmH: userSpeed,
          roverSpeedMPerMin: Number(((userSpeed * 1000) / 60).toFixed(1)),
          roverMaxSafeSpeedKmH: 19.0,
          roverBatteryKwh: energyKwh || 75.0,
          roverWalkbackBatteryRatio: 0.35,
          roverPropulsionWhPerMin: 166.7,
          roverHotelLoadWhPerMin: 30.0,
          roverScienceWhPerMin: 4.2,
          roverTotalDriveWhPerMin: 200.8,
          evaSuitBatteryKwh: 1.5,
          evaSuitPowerWhPerMin: 1.08,
          marsSolHours: 24.66,
          marsSolMinutes: 1479.59,
          surfacePressureMbar: 6.36,
          solarIrradianceWm2: 586.2,
          effectiveSpeedFormula: "v_eff = v_flat * max(0.40, 1 - slopeDeg / 46.0) * k_acid * k_storm"
        }
      };

      const origObj = {
        id: origin.id || "custom-origin",
        name: origin.name || "Konumumuz (A)",
        lat: origLat,
        lon: origLon,
        elevM: origTele.elevM,
        slopeDeg: origTele.slopeDeg,
        gradX: Number((origTele.gx || 0).toFixed(3)),
        gradY: Number((origTele.gy || 0).toFixed(3))
      };
      const destObj = {
        id: destination.id || "custom-destination",
        name: destination.name || "Hedef Konum (B)",
        lat: destLat,
        lon: destLon,
        elevM: destTele.elevM,
        slopeDeg: destTele.slopeDeg,
        gradX: Number((destTele.gx || 0).toFixed(3)),
        gradY: Number((destTele.gy || 0).toFixed(3))
      };

      const rich = this.gridHelper && typeof this.gridHelper.buildRichTerrainPayload === "function"
        ? this.gridHelper.buildRichTerrainPayload(origObj, destObj, factors, gridSize, gridSize, 0.38)
        : null;
      if (rich) {
        factors.terrain.nearbyFeatures = rich.nearbyFeatures;
        factors.terrain.demCatalogCount = rich.allFeaturesCount;
      }

      const payload = {
        apiVersion: "4.3.2",
        scope: scope || "global",
        origin: origObj,
        destination: destObj,
        routeGeometrySummary: rich ? rich.routeGeometrySummary : null,
        rustWasmCall: {
          fn: `find_rover_path(grid_flat, ${gridSize}, ${gridSize}, 0, 0, ${gridSize - 1}, ${gridSize - 1}, ${beginOxy})`,
          module: "js/wasm/backend_bg.wasm",
          dataFeed: "NASA MOLA DEM (48x48 koridor) + Aktif Tehlikeler + Krater Katalogu + Prameters.md",
          gridSize,
          beginOxy,
          start: { x: 0, y: 0 },
          goal: { x: gridSize - 1, y: gridSize - 1 }
        },
        terrainGrid: rich ? rich.terrainGrid : null,
        factors
      };

      if (rich) {
        Object.defineProperty(payload, "_corridorCache", {
          value: { width: gridSize, corridor: rich.corridor, strictFlat: rich.strictFlat },
          enumerable: false
        });
      }
      return payload;
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
          const gW = Number(raw.gridWidth || payload.terrainGrid?.width || payload.rustWasmCall?.gridSize || 48);
          const gH = Number(raw.gridHeight || payload.terrainGrid?.height || gW);
          const latF = Number(payload.terrainGrid?.lateralFactor || 0.38);
          const blueLabel = planner?.t?.("blueRouteTitle") || "Güvenli Rota";
          const primaryBlue = this.convertWasmPathToRoute(raw.rustRawOutput, payload.origin, payload.destination, "#2563eb", blueLabel, planner, payload, latF, gW, gH);
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

    /** (±180 boylam atlamali) normalize boylami ve en kisa boylam farkini MolaAStarGridHelper uzerinden doner */
    wrapLon(lon) {
      return this.gridHelper ? this.gridHelper.wrapLon(lon) : ((((Number(lon) || 0) + 180) % 360) + 360) % 360 - 180;
    }

    /** Iki boylam arasindaki (-180, 180] en kisa acisal farki hesaplar */
    shortestDeltaLon(fromLon, toLon) {
      return this.gridHelper ? this.gridHelper.shortestDeltaLon(fromLon, toLon) : ((((Number(toLon) - Number(fromLon)) + 540) % 360) + 360) % 360 - 180;
    }

    /** Kure yuzeyinde kosinus duzeltmeli yaklasik acisal mesafe (derece) */
    sphericalAngleDeg(lat1, lon1, lat2, lon2) {
      if (this.gridHelper) return this.gridHelper.sphericalAngleDeg(lat1, lon1, lat2, lon2);
      const cosMid = Math.cos(((lat1 + lat2) * 0.5 * Math.PI) / 180);
      return Math.hypot(lat2 - lat1, this.shortestDeltaLon(lon1, lon2) * Math.max(0.15, cosMid));
    }

    gridCellToGeo(x, y, width, height, orig, dest, lateralFactor = 0.38) {
      if (!this.gridHelper) throw new Error("MolaAStarGridHelper yuklenmedi");
      return this.gridHelper.gridCellToGeo(x, y, width, height, orig, dest, lateralFactor);
    }

    sampleMolaCorridor(orig, dest, width, height, lateralFactor = 0.38) {
      if (!this.gridHelper) throw new Error("MolaAStarGridHelper yuklenmedi");
      return this.gridHelper.sampleMolaCorridor(orig, dest, width, height, lateralFactor);
    }

    buildMolaRustGrid(corridor, width, height, payload, opts = {}) {
      if (!this.gridHelper) throw new Error("MolaAStarGridHelper yuklenmedi");
      return this.gridHelper.buildMolaRustGrid(corridor, width, height, payload, opts);
    }

    solvePathLocalAStar(flat, w, h, beginOxy) {
      if (!this.gridHelper) return { success: false };
      return this.gridHelper.solvePathLocalAStar(flat, w, h, beginOxy);
    }

    /**
     * Gercek MOLA topoğrafyasi, aktif tehlike bolgeleri ve baslangic O2 miktarini derlenmis Rust
     * `find_rover_path(grid_flat, width, height, start_x, start_y, goal_x, goal_y, begin_oxy)` WASM'e besler.
     */
    computeViaRustWasm(payload, planner) {
      const t0 = performance.now();
      const width = Number(payload.rustWasmCall?.gridSize || payload.terrainGrid?.width || 48);
      const height = width;
      const orig = payload.origin;
      const dest = payload.destination;
      const beginOxy = Math.max(0, Math.round(Number(payload.factors?.astronaut?.oxygenReserveLiters ?? 420)));
      const lateralFactor = Number(payload.terrainGrid?.lateralFactor || 0.38);
      const useWasm = typeof this.wasmFindPath === "function";
      const cache = payload._corridorCache;

      const runSolver = (grid) => useWasm
        ? JSON.parse(this.wasmFindPath(grid, width, height, 0, 0, width - 1, height - 1, beginOxy))
        : this.solvePathLocalAStar(grid, width, height, beginOxy);

      const corridor = cache && cache.width === width && cache.corridor
        ? cache.corridor
        : this.sampleMolaCorridor(orig, dest, width, height, lateralFactor);

      // Asama 0: NASA GESTALT maliyet haritasi + Field D* tarzi A* (birincil motor)
      const nasa = this.traversePlanner || (ns.NasaTraversePlanner ? (this.traversePlanner = new ns.NasaTraversePlanner(this.gridHelper)) : null);
      if (nasa) {
        const plan = nasa.plan(orig, dest, payload.factors || {});
        if (plan && plan.success) {
          const latencyMs = Math.max(1, Math.round(performance.now() - t0));
          const rawOut = { success: true, cost: plan.stats.pathCost, distance: plan.stats.rawCells, steps_count: plan.points.length, geoPoints: plan.points, path: [] };
          const blueLabel = planner?.t?.("blueRouteTitle") || "Güvenli Rota";
          const primaryBlue = this.convertWasmPathToRoute(rawOut, orig, dest, "#2563eb", blueLabel, planner, payload, lateralFactor, width, height, null);
          primaryBlue.fallbackStage = plan.stage;
          primaryBlue.plannerStats = plan.stats;
          if (plan.warning) {
            primaryBlue.fallbackWarning = plan.warning;
            primaryBlue.comment = `${primaryBlue.comment} [${plan.warning}]`;
          }
          const hazardZones = { acidZones: payload.factors?.acidRain?.zones || [], stormZones: payload.factors?.dustStorm?.zones || [], radiationZones: payload.factors?.radiation?.zones || [] };
          return { scope: payload.scope || "global", source: "nasa-costmap", engine: plan.stats.engine, latencyMs, fallbackStage: plan.stage, rustRawOutput: { success: true, cost: plan.stats.pathCost, steps_count: plan.points.length }, origin: orig, destination: dest, primaryBlue, secondaryPaleBlue: null, hazards: hazardZones };
        }
      }

      // Asama 1: Tam MOLA + tam tehlike ve >25 deg ucurum engellemesi
      let fallbackStage = 1;
      let flatGrid = cache && cache.width === width && cache.strictFlat
        ? cache.strictFlat
        : this.buildMolaRustGrid(corridor, width, height, payload, { hazardScale: 1.0, stepScale: 1.0, enforceCliffs: true });
      let parsedPrimary = runSolver(flatGrid);

      // Asama 2: Tum yollar tikandiysa tehlike cekirdegini daralt ve egim adimini genislet
      if (!parsedPrimary.success) {
        fallbackStage = 2;
        flatGrid = this.buildMolaRustGrid(corridor, width, height, payload, { hazardScale: 0.55, stepScale: 1.45, enforceCliffs: false });
        parsedPrimary = runSolver(flatGrid);
      }

      // Asama 3: Halen tikaliysa garantili gecilebilir gercek MOLA profiliyle tamamla
      if (!parsedPrimary.success) {
        fallbackStage = 3;
        flatGrid = this.buildMolaRustGrid(corridor, width, height, payload, { hazardScale: 0.0, stepScale: 1.85, enforceCliffs: false, smoothNeighbors: true });
        parsedPrimary = runSolver(flatGrid);
      }

      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      const engineLabel = useWasm ? "Rust WASM (find_rover_path · MOLA DEM)" : "Yerlesik A* (MOLA DEM · file://)";
      const primaryBlue = this.convertWasmPathToRoute(
        parsedPrimary, orig, dest, "#2563eb",
        planner?.t?.("blueRouteTitle") || "Güvenli Rota",
        planner, payload, lateralFactor, width, height, corridor
      );
      primaryBlue.fallbackStage = fallbackStage;
      if (fallbackStage >= 2) {
        primaryBlue.fallbackWarning = fallbackStage === 2
          ? "Uyari: Tum yollar tikandigi icin egim/tehlike esnetildi (Asama 2)"
          : "Uyari: Guvenli gecit bulunamadi, acil duzlestirilmis rota (Asama 3)";
        primaryBlue.comment = `${primaryBlue.comment} [${primaryBlue.fallbackWarning}]`;
      }

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
        fallbackStage,
        rustRawOutput: parsedPrimary,
        origin: orig,
        destination: dest,
        primaryBlue,
        secondaryPaleBlue: null,
        hazards
      };
    }

    /** Rust `find_rover_path` ciktisini gercek Mars MOLA yuksekligi, tehlike uyarisi ve O2 metrikleriyle adimlara donusturur */
    convertWasmPathToRoute(rustRes, orig, dest, colorHex, label, planner, payload, lateralFactor = 0.38, gridW = 48, gridH = 48, corridor = null) {
      const preGeo = Array.isArray(rustRes.geoPoints) && rustRes.geoPoints.length >= 2 ? rustRes.geoPoints : null;
      const path = Array.isArray(rustRes.path) && rustRes.path.length > 0
        ? rustRes.path
        : [{ x: 0, y: 0, z: 0 }, { x: gridW - 1, y: gridH - 1, z: 0 }];
      const topo = ns.marsTopo || null;
      const hasTele = topo && typeof topo.getSurfaceTelemetry === "function";

      const points = preGeo
        ? preGeo.map((p) => ({ lat: p.lat, lon: p.lon, elevLevel: 0, gridX: 0, gridY: 0 }))
        : path.map((p, idx) => {
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
      const exp = payload.factors?.expedition || {};
      const speedMult = (payload.factors?.acidRain?.speedMultiplier || 1) * (payload.factors?.dustStorm?.speedMultiplier || 1);
      const baseRoverSpeed = Number(exp.targetSpeedKmH || payload.factors?.vehicleAndPhysics?.roverSpeedKmH || 14.5);
      const beginOxy = Number(exp.oxygenReserveLiters ?? payload.factors?.astronaut?.oxygenReserveLiters ?? 0);

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

        const slopeFactor = Math.max(0.40, 1 - slopeDeg / 46);
        const effSpeed = Math.max(0.5, baseRoverSpeed * slopeFactor * speedMult);
        const segHours = segKm / effSpeed;
        totalHours += segHours;

        const cleanPlace = (s, fb) => String(s || fb).replace(/\s*\([^)]*°[^)]*\)\s*$/, "").trim() || fb;
        const tLoc = (k, fb) => (ns.i18n ? ns.i18n.t(k) : fb);
        let instruction = planner?.geo?.getCardinalDirectionTr
          ? planner.geo.getCardinalDirectionTr(prev.lat, prev.lon, cur.lat, cur.lon)
          : `${tLoc("stepWord", "Adım")} ${i + 1}`;
        if (i === 0) instruction = cleanPlace(orig.name, tLoc("originWord", "Başlangıç"));
        else if (i === points.length - 1) instruction = cleanPlace(dest.name, tLoc("arrivalWord", "Varış"));

        let hazardWarning = null;
        if (slopeDeg >= 15.0 || Math.abs(dz) >= 2) {
          hazardWarning = `${tLoc("slopeWord", "Eğim")} ${slopeDeg}°`;
        } else {
          for (const z of [...acidZones, ...stormZones, ...radZones]) {
            if (this.sphericalAngleDeg(cur.lat, cur.lon, z.lat, z.lon) < (z.radiusDeg || 6) * 1.15) {
              hazardWarning = z.name;
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

      const budget = this.computeRouteBudgetFromPayload(totalKm, totalHours, steps, payload, planner);
      const rustO2Used = typeof rustRes.consumed_oxy_liters === "number"
        ? rustRes.consumed_oxy_liters
        : (typeof rustRes.consumed_oxy === "number" ? rustRes.consumed_oxy : null);
      if (rustO2Used !== null && beginOxy > 0) {
        const usedL = Math.max(0, Number(rustO2Used.toFixed(2)));
        const remL = Math.max(0, Math.round(beginOxy - usedL));
        const remPct = Number(((remL / beginOxy) * 100).toFixed(1));
        budget.o2Liters = Math.round(usedL);
        budget.arrivalO2L = remL;
        budget.arrivalO2Pct = remPct;
        budget.o2DeficitL = Math.max(0, Math.round(usedL - beginOxy));
        budget.walkbackO2Alert = remPct < 20 || usedL > beginOxy;
      }
      return {
        ...budget,
        points,
        steps,
        rustCost: rustRes.cost || 0,
        rustDistanceSteps: rustRes.distance || path.length,
        rustAvaibleOxy: typeof rustRes.avaible_oxy === "number" ? rustRes.avaible_oxy : (beginOxy - budget.o2Liters),
        rustConsumedOxy: typeof rustRes.consumed_oxy === "number" ? rustRes.consumed_oxy : budget.o2Liters,
        rustConsumedWater: typeof rustRes.consumed_water_liters === "number" ? rustRes.consumed_water_liters : budget.waterLiters,
        rustAvailableWater: typeof rustRes.available_water_liters === "number" ? rustRes.available_water_liters : null,
        rustStepsCount: rustRes.steps_count || steps.length,
        molaRangeM: corridor ? { min: Math.round(corridor.minElevM), max: Math.round(corridor.maxElevM) } : null,
        colorHex,
        label,
        comment: planner?.formatDistance ? planner.formatDistance(totalKm) : (totalKm < 1 ? `${Math.round(totalKm * 1000)} m` : `${totalKm < 10 ? totalKm.toFixed(1) : Math.round(totalKm)} km`)
      };
    }

    computeRouteBudgetFromPayload(totalKm, fallbackHours, steps, payload, planner) {
      if (this.budget) {
        const exp = payload?.factors?.expedition || {};
        return this.budget.computeRouteBudget({
          totalKm,
          steps,
          acidEnabled: Boolean(payload?.factors?.acidRain?.enabled),
          stormEnabled: Boolean(payload?.factors?.dustStorm?.enabled),
          acidSpeedMult: Number(payload?.factors?.acidRain?.speedMultiplier || 0.78),
          stormSpeedMult: Number(payload?.factors?.dustStorm?.speedMultiplier || 0.70),
          params: {
            expeditionMode: exp.expeditionMode || payload?.factors?.vehicleAndPhysics?.vehicleType || "rover-crew",
            targetSpeedKmH: exp.targetSpeedKmH || payload?.factors?.vehicleAndPhysics?.roverSpeedKmH || 14.5,
            oxygenReserveLiters: exp.oxygenReserveLiters ?? payload?.factors?.astronaut?.oxygenReserveLiters ?? 0,
            oxygenTankCapacityL: exp.oxygenTankCapacityL || exp.oxygenReserveLiters || 0,
            energyReserveKwh: exp.energyReserveKwh ?? payload?.factors?.vehicleAndPhysics?.roverBatteryKwh ?? 0,
            energyTankCapacityKwh: exp.energyTankCapacityKwh || 75
          },
          formatHoursFn: planner?.formatHours ? (h) => planner.formatHours(h) : null
        });
      }
      const h = Math.max(0.15, fallbackHours || 0);
      return {
        totalKm: Number(totalKm.toFixed(2)),
        totalMeters: Math.round(totalKm * 1000),
        totalHours: Number(h.toFixed(2)),
        totalMinutes: Math.max(1, Math.round(h * 60)),
        formattedDuration: planner?.formatHours ? planner.formatHours(h) : `${h.toFixed(1)} saat`,
        o2Liters: Math.round(h * 48)
      };
    }

    haversineMarsKm(lat1, lon1, lat2, lon2) {
      if (this.gridHelper) return this.gridHelper.haversineMarsKm(lat1, lon1, lat2, lon2);
      const toRad = Math.PI / 180;
      const dLat = (lat2 - lat1) * toRad;
      const dLon = this.shortestDeltaLon(lon1, lon2) * toRad;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
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

      const primaryBlue = this.normalizeSingleRoute(blueRaw, "#2563eb", ns.i18n ? ns.i18n.t("blueRouteTitle") : "Güvenli Rota", planner, payload);
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
      const budget = this.computeRouteBudgetFromPayload(totalKm, totalHours, steps, payload, planner);
      return {
        ...budget,
        points: rawPts,
        steps,
        colorHex: r.colorHex || r.color_hex || defaultColor,
        label: r.label || defaultLabel,
        comment: planner?.formatDistance ? planner.formatDistance(budget.totalKm) : (budget.totalKm < 1 ? `${Math.round(budget.totalKm * 1000)} m` : `${budget.totalKm < 10 ? budget.totalKm.toFixed(1) : Math.round(budget.totalKm)} km`)
      };
    }

    normalizeHazards(h) {
      if (!h || typeof h !== "object") return null;
      return { acidZones: h.acidZones || h.acid_zones || null, stormZones: h.stormZones || h.storm_zones || null, radiationZones: h.radiationZones || h.radiation_zones || null };
    }
  }

  ns.BackendApiService = BackendApiService;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-50: Sinif baslangici, MolaAStarGridHelper/MissionBudgetHelper baglantilari ve ensureWasmLoaded.
   - Satir 52-164: normalizeBaseUrl, resolveInitialUrl, testConnection ve pingHttpHealth (Rust WASM ping + HTTP saglik kontrolu).
   - Satir 165-412: buildRouteRequestPayload (birlesik Rover+Insan sefer faktorleri), requestStepRoute ve fetchHttpRoute.
   - Satir 414-449: MolaAStarGridHelper delegasyonlari (wrapLon, shortestDeltaLon, sphericalAngleDeg, gridCellToGeo, sampleMolaCorridor, buildMolaRustGrid, solvePathLocalAStar).
   - Satir 452-776: computeViaRustWasm (NASA costmap Stage 0 + MOLA WASM/A* Stage 1-3), convertWasmPathToRoute, computeRouteBudgetFromPayload, fetchHazards ve normalizeRouteResponse.
   ========================================================================== */
