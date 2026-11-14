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
          const wasmUrl = new URL("./js/wasm/backend.js", window.location.href).href;
          const wasmBinaryUrl = new URL("./js/wasm/backend_bg.wasm", window.location.href).href;
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

    /** Kullanicinin girdigi veya URL'den gelen backend kok adresini temizler */
    normalizeBaseUrl(rawUrl) {
      if (!rawUrl || typeof rawUrl !== "string") return "";
      let cleaned = rawUrl.trim().replace(/\/+$/, "");
      if (!cleaned) return "";
      if (!/^https?:\/\//i.test(cleaned) && !cleaned.startsWith("/")) {
        cleaned = "http://" + cleaned;
      }
      return cleaned;
    }

    /** ?api=... parametresi veya global config uzerinden varsayilan backend URL cozumler */
    resolveInitialUrl(savedUrl) {
      try {
        const params = new URLSearchParams(window.location.search || "");
        const fromQuery = params.get("api");
        if (fromQuery) return this.normalizeBaseUrl(fromQuery);
      } catch (_err) {
        // file:// veya kisitli ortamlarda sessizce devam et
      }
      if (window.ASTROCHIEF_CONFIG && window.ASTROCHIEF_CONFIG.apiBaseUrl) {
        return this.normalizeBaseUrl(window.ASTROCHIEF_CONFIG.apiBaseUrl);
      }
      return this.normalizeBaseUrl(savedUrl || "");
    }

    /** Baglanti ve gecikme testi: Once Rust WASM (backend_bg.wasm), varsa HTTP /api/v1/health */
    async testConnection(baseUrl) {
      const t0 = performance.now();
      const wasmOk = await this.ensureWasmLoaded();
      if (wasmOk && this.wasmFindPath) {
        // Canli ping testi: 2x2 mini grid ile Rust WASM cagri gecikmesini olc
        const mini = new Int32Array([0, 1, 1, 2]);
        this.wasmFindPath(mini, 2, 2, 0, 0, 1, 1);
        const latencyMs = Math.max(1, Math.round(performance.now() - t0));
        return {
          ok: true,
          status: 200,
          message: `🦀 Rust WASM Aktif (find_rover_path · ${latencyMs} ms)`,
          latencyMs
        };
      }

      const clean = this.normalizeBaseUrl(baseUrl);
      if (!clean) {
        return { ok: false, status: 0, message: "Rust WASM / HTTP bekleniyor", latencyMs: 0 };
      }
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
        const engine = data.engine || data.version || "rust-backend";
        return { ok: true, status: res.status, message: `Bagli (${engine}, ${latencyMs} ms)`, latencyMs };
      } catch (err) {
        const latencyMs = Math.round(performance.now() - started);
        const msg = err.name === "AbortError" ? "Zaman asimi" : (err.message || "Baglanti yok");
        return { ok: false, status: 0, message: msg, latencyMs };
      } finally {
        clearTimeout(timer);
      }
    }

    /** Tum cevresel etkenleri (radyasyon, asit, firtina, egim, astronot) ve 20x20 Rust gridini hazirlar */
    buildRouteRequestPayload({ scope, origin, destination, state, activeCrater, hazardBundle, craterRadZones, planner }) {
      const acidSpec = (hazardBundle && hazardBundle.acidSpec) || {};
      const stormSpec = (hazardBundle && hazardBundle.stormSpec) || {};
      const radZones = (hazardBundle && hazardBundle.radiationZones) || [];
      return {
        scope: scope || "global",
        origin: {
          id: origin.id || "custom-origin",
          name: origin.name || "Konumumuz (A)",
          lat: Number(Number(origin.lat || 0).toFixed(4)),
          lon: Number(Number(origin.lon || 0).toFixed(4))
        },
        destination: {
          id: destination.id || "custom-destination",
          name: destination.name || "Hedef Konum (B)",
          lat: Number(Number(destination.lat || 0).toFixed(4)),
          lon: Number(Number(destination.lon || 0).toFixed(4))
        },
        rustWasmCall: {
          fn: "find_rover_path(grid_flat, 20, 20, 0, 0, 19, 19)",
          module: "js/wasm/backend_bg.wasm"
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
              alphaLevel: z.alphaLevel, betaLevel: z.betaLevel, gammaLevel: z.gammaLevel
            })),
            craterZones: (craterRadZones || []).map((z) => ({
              id: z.id, name: z.name, relX: z.relX, relY: z.relY, radius: z.radius
            }))
          },
          terrain: {
            planetRadiusKm: 3389.5,
            craterId: activeCrater ? activeCrater.id : "gale-crater",
            maxSlopeDiff: 3,
            obstacleCode: -999
          },
          astronaut: {
            oxygenReserveLiters: Number(state.oxygenReserveLiters || 420),
            waterReserveLiters: Number(state.waterReserveLiters || 24),
            roverSpeedKmH: planner ? planner.roverSpeedKmH : 14.5
          }
        }
      };
    }

    /** Derlenmis Rust WASM (`find_rover_path`) uzerinden A* rotasini hesaplar */
    async requestStepRoute(baseUrl, payload, planner) {
      const wasmReady = await this.ensureWasmLoaded();
      if (wasmReady && this.wasmFindPath) {
        return this.computeViaRustWasm(payload, planner);
      }

      const clean = this.normalizeBaseUrl(baseUrl);
      if (!clean) throw new Error("Rust WASM veya HTTP Backend aktif degil");

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
        return this.normalizeRouteResponse(raw, payload, planner, latencyMs);
      } finally {
        clearTimeout(timer);
      }
    }

    /**
     * Mustafa dalindaki derlenmis Rust `find_rover_path(grid_flat, width, height, start_x, start_y, goal_x, goal_y)`
     * WebAssembly fonksiyonunu cagirir ve ciktisini Mars kuresi koordinatlarina donusturur.
     */
    computeViaRustWasm(payload, planner) {
      const t0 = performance.now();
      const width = 20;
      const height = 20;
      const orig = payload.origin;
      const dest = payload.destination;

      const buildGrid = (obstacleRadiusScale) => {
        const flat = new Int32Array(width * height);
        const acidZones = (payload.factors?.acidRain?.enabled && payload.factors?.acidRain?.zones) || [];
        const stormZones = (payload.factors?.dustStorm?.enabled && payload.factors?.dustStorm?.zones) || [];
        const radZones = (payload.factors?.radiation?.enabled && payload.factors?.radiation?.zones) || [];

        const dLat = dest.lat - orig.lat;
        const dLon = dest.lon - orig.lon;
        const perpLat = -dLon * 0.38;
        const perpLon = dLat * 0.38;

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const isEndpoint = (x === 0 && y === 0) || (x === width - 1 && y === height - 1);
            const u = (x + y) / ((width - 1) + (height - 1));
            const v = (x - y) / (width - 1);
            const lat = orig.lat + dLat * u + perpLat * v;
            const lon = orig.lon + dLon * u + perpLon * v;

            // Engeller (-999): Asit yagmuru, firtina veya radyasyon cekirdegi
            let blocked = false;
            if (!isEndpoint && obstacleRadiusScale > 0) {
              for (const z of [...acidZones, ...stormZones, ...radZones]) {
                const distDeg = Math.hypot(lat - z.lat, lon - z.lon);
                if (distDeg < (z.radiusDeg || 6) * 0.42 * obstacleRadiusScale) {
                  blocked = true;
                  break;
                }
              }
              // Diyagonal uzerinde ornek krater/kaya engelleri (Mustafa main.rs stili)
              if (!blocked && ((x === 5 && y >= 4 && y <= 7) || (x === 10 && y >= 9 && y <= 12) || (x === 14 && y >= 13 && y <= 15))) {
                blocked = true;
              }
            }

            if (blocked) {
              flat[idx] = -999;
            } else {
              // Rust lib.rs: slope_diff.abs() <= 3 kuralina uygun puruzsuz Mars topoğrafyasi (0..10)
              const wave = Math.sin((x * 0.35) + (orig.lat * 0.05)) * 2.2 + Math.cos((y * 0.35) + (dest.lon * 0.05)) * 2.2;
              flat[idx] = Math.max(0, Math.min(10, Math.round(5 + wave)));
            }
          }
        }
        return flat;
      };

      // 1. Birincil Mavi Yol: Rust WASM find_rover_path cagrisi
      let flatGrid = buildGrid(1.0);
      let rawJsonStr = this.wasmFindPath(flatGrid, width, height, 0, 0, width - 1, height - 1);
      let parsedPrimary = JSON.parse(rawJsonStr);
      if (!parsedPrimary.success) {
        flatGrid = buildGrid(0.0);
        rawJsonStr = this.wasmFindPath(flatGrid, width, height, 0, 0, width - 1, height - 1);
        parsedPrimary = JSON.parse(rawJsonStr);
      }

      // 2. Alternatif Soluk Mavi Yol: Orta bolgeyi (-999) kapatarak Rust A*'in ikinci guvenli koridoru bulmasini sagla
      const altGrid = new Int32Array(flatGrid);
      for (let m = 7; m <= 12; m++) {
        altGrid[m * width + m] = -999;
      }
      let altJsonStr = this.wasmFindPath(altGrid, width, height, 0, 0, width - 1, height - 1);
      let parsedSecondary = JSON.parse(altJsonStr);
      if (!parsedSecondary.success) parsedSecondary = parsedPrimary;

      const latencyMs = Math.max(1, Math.round(performance.now() - t0));

      const primaryBlue = this.convertWasmPathToRoute(parsedPrimary, orig, dest, "#2563eb", "Mavi Yol (Rust WASM A*)", planner, payload, 0.38);
      const secondaryPaleBlue = this.convertWasmPathToRoute(parsedSecondary, orig, dest, "#93c5fd", "Soluk Mavi (Rust WASM Alternatif)", planner, payload, -0.46);

      // Aktif tehlike bolgelerini haritada cizilmek uzere hazirla
      const hazards = {
        acidZones: payload.factors?.acidRain?.zones || [],
        stormZones: payload.factors?.dustStorm?.zones || [],
        radiationZones: payload.factors?.radiation?.zones || []
      };

      return {
        scope: payload.scope || "global",
        source: "rust-backend",
        engine: "Rust WASM (find_rover_path)",
        latencyMs,
        rustRawOutput: parsedPrimary,
        origin: orig,
        destination: dest,
        primaryBlue,
        secondaryPaleBlue,
        hazards
      };
    }

    /** Rust `find_rover_path` ciktisindaki `path: [{x,y,z}]` dizisini Mars koordinatlarina ve step-by-step adimlara cevirir */
    convertWasmPathToRoute(rustRes, orig, dest, colorHex, label, planner, payload, lateralFactor = 0.38) {
      const path = Array.isArray(rustRes.path) && rustRes.path.length > 0
        ? rustRes.path
        : [{ x: 0, y: 0, z: 0 }, { x: 19, y: 19, z: 0 }];

      const dLat = dest.lat - orig.lat;
      const dLon = dest.lon - orig.lon;
      const perpLat = -dLon * lateralFactor;
      const perpLon = dLat * lateralFactor;

      const points = path.map((p, idx) => {
        if (idx === 0) return { lat: orig.lat, lon: orig.lon, elevLevel: p.z, gridX: p.x, gridY: p.y };
        if (idx === path.length - 1) return { lat: dest.lat, lon: dest.lon, elevLevel: p.z, gridX: p.x, gridY: p.y };
        const u = (p.x + p.y) / 38;
        const v = (p.x - p.y) / 19;
        return {
          lat: Number((orig.lat + dLat * u + perpLat * v).toFixed(4)),
          lon: Number((orig.lon + dLon * u + perpLon * v).toFixed(4)),
          elevLevel: p.z,
          gridX: p.x,
          gridY: p.y
        };
      });

      const speedMult = (payload.factors?.acidRain?.speedMultiplier || 1) * (payload.factors?.dustStorm?.speedMultiplier || 1);
      const roverSpeed = Math.max(4.5, (payload.factors?.astronaut?.roverSpeedKmH || 14.5) * speedMult);
      let totalKm = 0;
      const steps = [];

      for (let i = 0; i < points.length; i++) {
        const cur = points[i];
        const prev = i > 0 ? points[i - 1] : cur;
        const segKm = i === 0 ? 0 : this.haversineMarsKm(prev.lat, prev.lon, cur.lat, cur.lon);
        totalKm += segKm;
        const dz = i === 0 ? 0 : (cur.elevLevel - prev.elevLevel);
        const slopeDeg = Number(Math.min(22, Math.abs(dz) * 2.8 + 1.1).toFixed(1));
        const elevM = Math.round(-2400 + cur.elevLevel * 185);
        const segHours = segKm / roverSpeed;

        let instruction = `Rust A* Hücre (${cur.gridX}, ${cur.gridY}) → ${segKm.toFixed(1)} km ilerle`;
        if (i === 0) {
          instruction = `Başlangıç (${orig.name}): Rust A* Hücre (0, 0)`;
        } else if (i === points.length - 1) {
          instruction = `Hedefe Varış (${dest.name}): Rust A* Hücre (${cur.gridX}, ${cur.gridY})`;
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
          hazardWarning: Math.abs(dz) >= 2 ? `Eğim farkı Δz=${dz} (Rust A* maliyet +${dz > 0 ? dz * 5 : Math.abs(dz) * 2})` : null
        });
      }

      const totalHours = Math.max(0.2, totalKm / roverSpeed);
      const formattedDuration = planner && typeof planner.formatHours === "function"
        ? planner.formatHours(totalHours)
        : `${totalHours.toFixed(1)} saat`;

      return {
        points,
        steps,
        rustCost: rustRes.cost || 0,
        rustStepsCount: rustRes.steps_count || steps.length,
        totalKm: Number(totalKm.toFixed(2)),
        totalMeters: Math.round(totalKm * 1000),
        totalHours: Number(totalHours.toFixed(2)),
        formattedDuration,
        o2Liters: Math.round(totalHours * 48),
        waterLiters: Number((totalHours * 2.15).toFixed(1)),
        colorHex,
        label,
        comment: `// ${label}: ${rustRes.steps_count || steps.length} adım (Maliyet: ${rustRes.cost || 0}) — ${formattedDuration} (${Math.round(totalKm)} km)`
      };
    }

    haversineMarsKm(lat1, lon1, lat2, lon2) {
      const toRad = Math.PI / 180;
      const dLat = (lat2 - lat1) * toRad;
      const dLon = (lon2 - lon1) * toRad;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * 3389.5 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
    }

    /** Opsiyonel tehlike katmanlarini backend'den ceker: GET /api/v1/hazards */
    async fetchHazards(baseUrl) {
      const clean = this.normalizeBaseUrl(baseUrl);
      if (!clean) return null;
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
      const paleRaw = raw.secondaryPaleBlue || raw.alternative_route || raw.secondary_route;
      if (!blueRaw) throw new Error("Backend yanitinda primaryBlue / primary_route eksik");

      const primaryBlue = this.normalizeSingleRoute(blueRaw, "#2563eb", "Mavi Yol (Backend En Kisa Guvenli)", planner, payload);
      const secondaryPaleBlue = paleRaw
        ? this.normalizeSingleRoute(paleRaw, "#93c5fd", "Soluk Mavi (Backend Guvenli Uzun)", planner, payload)
        : primaryBlue;

      const hazards = raw.hazards ? this.normalizeHazards(raw.hazards) : null;
      return {
        scope: raw.scope || payload.scope || "global",
        source: "rust-backend",
        engine: raw.engine || raw.backendVersion || "Rust Backend",
        latencyMs: typeof raw.latencyMs === "number" ? raw.latencyMs : latencyMs,
        origin: raw.origin || payload.origin,
        destination: raw.destination || payload.destination,
        primaryBlue,
        secondaryPaleBlue,
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
   - Satir 1-46: Sinif baslangici ve ensureWasmLoaded (Mustafa dalindan derlenen js/wasm/backend_bg.wasm yukleyicisi).
   - Satir 48-115: normalizeBaseUrl, resolveInitialUrl ve testConnection (Rust WASM canli ping + HTTP saglik kontrolu).
   - Satir 117-187: buildRouteRequestPayload; koordinatlar, tehlike faktorleri ve Rust WASM cagri bilgisini paketler.
   - Satir 189-302: requestStepRoute ve computeViaRustWasm; Rust find_rover_path A* fonksiyonunu cagirir.
   - Satir 304-430: convertWasmPathToRoute ve normalizeRouteResponse; Rust path[] dizisini Mars koordinatlarina cevirir.
   ========================================================================== */
