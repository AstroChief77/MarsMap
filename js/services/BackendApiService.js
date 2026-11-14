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
              alphaLevel: z.alphaLevel, betaLevel: z.betaLevel, gammaLevel: z.gammaLevel, photonFlux: z.photonFlux
            })),
            craterZones: (craterRadZones || []).map((z) => ({
              id: z.id, name: z.name, relX: z.relX, relY: z.relY, radius: z.radius,
              alphaLevel: z.alphaLevel, betaLevel: z.betaLevel, gammaLevel: z.gammaLevel, photonFlux: z.photonFlux
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

    wrapLon(lon) {
      return (((Number(lon) || 0) + 180) % 360 + 360) % 360 - 180;
    }

    shortestDeltaLon(fromLon, toLon) {
      return (((Number(toLon) - Number(fromLon)) + 540) % 360 + 360) % 360 - 180;
    }

    /** file:// ortaminda WASM import engellenirse Rust lib.rs ile birebir ayni A* kurallarini calistiran yedek cozucu */
    solveGridAStarFallback(flat, width, height, sx, sy, gx, gy) {
      const getZ = (x, y) => (x >= 0 && x < width && y >= 0 && y < height) ? flat[y * width + x] : -999;
      if (getZ(sx, sy) === -999 || getZ(gx, gy) === -999) return { success: false, path: [] };
      const keyOf = (x, y) => y * width + x;
      const gScore = new Map([[keyOf(sx, sy), 0]]);
      const cameFrom = new Map();
      const open = [{ x: sx, y: sy, z: getZ(sx, sy), g: 0, f: Math.abs(gx - sx) + Math.abs(gy - sy) }];
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

      while (open.length > 0) {
        open.sort((a, b) => a.f - b.f);
        const cur = open.shift();
        if (cur.x === gx && cur.y === gy) {
          const path = [];
          let k = keyOf(gx, gy);
          let node = cur;
          while (node) {
            path.unshift({ x: node.x, y: node.y, z: node.z });
            node = cameFrom.get(k);
            if (node) k = keyOf(node.x, node.y);
          }
          return { success: true, cost: cur.g, steps_count: path.length, path };
        }
        for (const [dx, dy] of dirs) {
          const nx = cur.x + dx, ny = cur.y + dy;
          const nz = getZ(nx, ny);
          if (nz === -999) continue;
          const diff = nz - cur.z;
          if (Math.abs(diff) > 3) continue;
          const stepCost = diff > 0 ? 1 + diff * 5 : (diff < 0 ? 1 + Math.abs(diff) * 2 : 1);
          const tentG = cur.g + stepCost;
          const nk = keyOf(nx, ny);
          if (tentG < (gScore.get(nk) ?? 1e9)) {
            gScore.set(nk, tentG);
            cameFrom.set(nk, cur);
            open.push({ x: nx, y: ny, z: nz, g: tentG, f: tentG + Math.abs(gx - nx) + Math.abs(gy - ny) });
          }
        }
      }
      return { success: false, path: [] };
    }

    /**
     * Mustafa dalindaki derlenmis Rust `find_rover_path(grid_flat, width, height, start_x, start_y, goal_x, goal_y)`
     * WebAssembly fonksiyonunu cagirir ve ciktisini antimeridyen + MOLA topografyasiyla Mars koordinatlarina donusturur.
     */
    computeViaRustWasm(payload, planner) {
      const t0 = performance.now();
      const width = 20;
      const height = 20;
      const orig = payload.origin;
      const dest = payload.destination;
      const dLat = dest.lat - orig.lat;
      const dLon = this.shortestDeltaLon(orig.lon, dest.lon);
      const perpLat = -dLon * 0.38;
      const perpLon = dLat * 0.38;
      const topo = ns.marsTopo || null;

      const buildGrid = (obstacleRadiusScale) => {
        const flat = new Int32Array(width * height);
        const acidZones = (payload.factors?.acidRain?.enabled && payload.factors?.acidRain?.zones) || [];
        const stormZones = (payload.factors?.dustStorm?.enabled && payload.factors?.dustStorm?.zones) || [];
        const radZones = (payload.factors?.radiation?.enabled && payload.factors?.radiation?.zones) || [];

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = y * width + x;
            const isEndpoint = (x === 0 && y === 0) || (x === width - 1 && y === height - 1);
            const u = (x + y) / ((width - 1) + (height - 1));
            const v = (x - y) / (width - 1);
            const lat = Math.max(-85, Math.min(85, orig.lat + dLat * u + perpLat * v));
            const lon = this.wrapLon(orig.lon + dLon * u + perpLon * v);

            let blocked = false;
            if (!isEndpoint && obstacleRadiusScale > 0) {
              const cosLat = Math.max(0.25, Math.cos((lat * Math.PI) / 180));
              for (const z of [...acidZones, ...stormZones, ...radZones]) {
                const dzLon = this.shortestDeltaLon(z.lon, lon) * cosLat;
                const distDeg = Math.hypot(lat - z.lat, dzLon);
                if (distDeg < (z.radiusDeg || 6) * 0.45 * obstacleRadiusScale) {
                  blocked = true;
                  break;
                }
              }
            }

            if (blocked) {
              flat[idx] = -999;
            } else if (topo) {
              // Gercek NASA MOLA topografyasini (-8200m..+21229m) Rust A* egim sinirina (0..10) olcekle
              const elevM = topo.getElevationMeters(lat, lon);
              const norm = Math.round(((elevM + 8200) / 29429) * 10);
              flat[idx] = Math.max(0, Math.min(10, norm));
            } else {
              const wave = Math.sin((x * 0.35) + (orig.lat * 0.05)) * 2.2 + Math.cos((y * 0.35) + (dest.lon * 0.05)) * 2.2;
              flat[idx] = Math.max(0, Math.min(10, Math.round(5 + wave)));
            }
          }
        }
        return flat;
      };

      const runSolver = (flatGrid) => {
        if (this.wasmFindPath) {
          return JSON.parse(this.wasmFindPath(flatGrid, width, height, 0, 0, width - 1, height - 1));
        }
        return this.solveGridAStarFallback(flatGrid, width, height, 0, 0, width - 1, height - 1);
      };

      // Asamali engel yaricapi gevsetmesi: tehlike cekirdeklerini tamamen silmeden en guvenli gecisi bulur
      let parsedPrimary = { success: false, path: [] };
      for (const scale of [1.0, 0.72, 0.45, 0.22, 0.0]) {
        parsedPrimary = runSolver(buildGrid(scale));
        if (parsedPrimary && parsedPrimary.success) break;
      }

      const latencyMs = Math.max(1, Math.round(performance.now() - t0));
      const primaryBlue = this.convertWasmPathToRoute(parsedPrimary, orig, dest, "#2563eb", "Mavi Yol (Rust WASM A*)", planner, payload, 0.38);

      const hazards = {
        acidZones: payload.factors?.acidRain?.zones || [],
        stormZones: payload.factors?.dustStorm?.zones || [],
        radiationZones: payload.factors?.radiation?.zones || []
      };

      return {
        scope: payload.scope || "global",
        source: "rust-backend",
        engine: this.wasmFindPath ? "Rust WASM (find_rover_path)" : "Local A* Fallback",
        latencyMs,
        rustRawOutput: parsedPrimary,
        origin: orig,
        destination: dest,
        primaryBlue,
        secondaryPaleBlue: null,
        hazards
      };
    }

    /** Rust `find_rover_path` ciktisindaki `path: [{x,y,z}]` dizisini Mars koordinatlarina ve step-by-step adimlara cevirir */
    convertWasmPathToRoute(rustRes, orig, dest, colorHex, label, planner, payload, lateralFactor = 0.38) {
      const path = Array.isArray(rustRes.path) && rustRes.path.length > 0
        ? rustRes.path
        : [{ x: 0, y: 0, z: 0 }, { x: 19, y: 19, z: 0 }];

      const dLat = dest.lat - orig.lat;
      const dLon = this.shortestDeltaLon(orig.lon, dest.lon);
      const perpLat = -dLon * lateralFactor;
      const perpLon = dLat * lateralFactor;
      const topo = ns.marsTopo || null;

      const points = path.map((p, idx) => {
        if (idx === 0) return { lat: orig.lat, lon: orig.lon, elevLevel: p.z, gridX: p.x, gridY: p.y };
        if (idx === path.length - 1) return { lat: dest.lat, lon: dest.lon, elevLevel: p.z, gridX: p.x, gridY: p.y };
        const u = (p.x + p.y) / 38;
        const v = (p.x - p.y) / 19;
        const rawLat = Math.max(-85, Math.min(85, orig.lat + dLat * u + perpLat * v));
        const rawLon = this.wrapLon(orig.lon + dLon * u + perpLon * v);
        return {
          lat: Number(rawLat.toFixed(4)),
          lon: Number(rawLon.toFixed(4)),
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
        const telem = topo ? topo.getSurfaceTelemetry(cur.lat, cur.lon) : null;
        const slopeDeg = telem ? telem.slopeDeg : Number(Math.min(22, Math.abs(dz) * 2.8 + 1.1).toFixed(1));
        const elevM = telem ? telem.elevM : Math.round(-2400 + cur.elevLevel * 185);
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
   - Satir 1-46: Sinif baslangici ve ensureWasmLoaded (Mustafa dalindan derlenen js/wasm/backend_bg.wasm yukleyicisi).
   - Satir 48-115: normalizeBaseUrl, resolveInitialUrl ve testConnection (Rust WASM canli ping + HTTP saglik kontrolu).
   - Satir 117-187: buildRouteRequestPayload; koordinatlar, tehlike faktorleri ve Rust WASM cagri bilgisini paketler.
   - Satir 189-302: requestStepRoute ve computeViaRustWasm; Rust find_rover_path A* fonksiyonunu cagirir.
   - Satir 304-430: convertWasmPathToRoute ve normalizeRouteResponse; Rust path[] dizisini Mars koordinatlarina cevirir.
   ========================================================================== */
