/**
 * @file BackendApiService.js
 * @description Rust backend ile step-by-step rota ve cevresel etken (radyasyon, asit, firtina, egim) haberlesme servisi.
 */

(function (ns) {
  "use strict";

  class BackendApiService {
    constructor(config) {
      this.config = config || null;
      this.defaultTimeoutMs = 3500;
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

    /** Baglanti testi: GET /api/v1/health */
    async testConnection(baseUrl) {
      const clean = this.normalizeBaseUrl(baseUrl);
      if (!clean) {
        return { ok: false, status: 0, message: "URL bos (Yerel mod aktif)", latencyMs: 0 };
      }
      const started = performance.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
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
        const msg = err.name === "AbortError" ? "Zaman asimi (2.5s)" : (err.message || "Erisim hatasi");
        return { ok: false, status: 0, message: msg, latencyMs };
      } finally {
        clearTimeout(timer);
      }
    }

    /** Tum cevresel etkenleri (radyasyon, asit, firtina, egim, astronot) tek JSON paketinde toplar */
    buildRouteRequestPayload({ scope, origin, destination, state, activeCrater, hazardBundle, craterRadZones, planner }) {
      const acidSpec = (hazardBundle && hazardBundle.acidSpec) || {};
      const stormSpec = (hazardBundle && hazardBundle.stormSpec) || {};
      const radZones = (hazardBundle && hazardBundle.radiationZones) || [];
      return {
        scope: scope || "global",
        origin: {
          id: origin.id || "custom-origin",
          name: origin.name || "Mevcut Konum (A)",
          lat: Number(Number(origin.lat || 0).toFixed(4)),
          lon: Number(Number(origin.lon || 0).toFixed(4))
        },
        destination: {
          id: destination.id || "custom-destination",
          name: destination.name || "Varis Noktasi (B)",
          lat: Number(Number(destination.lat || 0).toFixed(4)),
          lon: Number(Number(destination.lon || 0).toFixed(4))
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
            maxSafeAlphaMicroSvPerSec: 0.05,
            maxSafeBetaMsvPerHour: 1.0,
            maxSafeGammaMsvPerHour: 0.5,
            zones: radZones.map((z) => ({
              id: z.id, name: z.name, lat: z.lat, lon: z.lon, radiusDeg: z.radiusDeg,
              alphaLevel: z.alphaLevel, betaLevel: z.betaLevel, gammaLevel: z.gammaLevel, photonFlux: z.photonFlux
            })),
            craterZones: (craterRadZones || []).map((z) => ({
              id: z.id, name: z.name, relX: z.relX, relY: z.relY, radius: z.radius,
              alphaLevel: z.alphaLevel, betaLevel: z.betaLevel, gammaLevel: z.gammaLevel
            }))
          },
          terrain: {
            planetRadiusKm: 3389.5,
            craterId: activeCrater ? activeCrater.id : "gale-crater",
            craterName: activeCrater ? activeCrater.name : "Gale Crater",
            maxSlopeDeg: 22.0,
            preferLowElevation: true,
            stepResolutionKm: scope === "crater" ? 0.45 : 140.0
          },
          astronaut: {
            oxygenReserveLiters: Number(state.oxygenReserveLiters || 420),
            waterReserveLiters: Number(state.waterReserveLiters || 24),
            evaSpeedKmH: planner ? planner.evaSpeedKmH : 3.6,
            roverSpeedKmH: planner ? planner.roverSpeedKmH : 14.5,
            o2LitersPerHour: planner ? planner.o2LitersPerHour : 48.0,
            waterLitersPerHour: planner ? planner.waterLitersPerHour : 2.15
          }
        }
      };
    }

    /** Rust backend'e POST /api/v1/route istegi atar ve yaniti frontend formatina normalize eder */
    async requestStepRoute(baseUrl, payload, planner) {
      const clean = this.normalizeBaseUrl(baseUrl);
      if (!clean) throw new Error("Backend URL tanimli degil");

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.defaultTimeoutMs);
      try {
        const res = await fetch(`${clean}/api/v1/route`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
        if (!res.ok) {
          throw new Error(`Backend HTTP ${res.status}`);
        }
        const raw = await res.json();
        return this.normalizeRouteResponse(raw, payload, planner);
      } finally {
        clearTimeout(timer);
      }
    }

    /** Opsiyonel tehlike katmanlarini backend'den ceker: GET /api/v1/hazards */
    async fetchHazards(baseUrl) {
      const clean = this.normalizeBaseUrl(baseUrl);
      if (!clean) return null;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2500);
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
    normalizeRouteResponse(raw, payload, planner) {
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

      const originRef = payload && payload.origin ? payload.origin : null;
      const isCrater = payload && payload.scope === "crater" && originRef;
      const rawPts = (Array.isArray(r.points) && r.points.length >= 2 ? r.points : steps).map((p) => {
        const out = { lat: Number(p.lat || 0), lon: Number(p.lon || 0), name: p.name || p.instruction || "" };
        if (p.relX !== undefined && p.relY !== undefined) {
          out.relX = p.relX;
          out.relY = p.relY;
        } else if (isCrater) {
          out.relX = (out.lon - originRef.lon) / 0.008;
          out.relY = (originRef.lat - out.lat) / 0.008;
        }
        return out;
      });

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
   - Satir 1-14: Sinif baslangici ve varsayilan 3.5s HTTP zaman asimi ayari.
   - Satir 16-39: normalizeBaseUrl ve ?api= / global config URL cozumleyicisi.
   - Satir 41-63: testConnection; GET /api/v1/health ile Rust backend saglik testi.
   - Satir 65-128: buildRouteRequestPayload; koordinatlar ile radyasyon, asit, firtina, egim ve astronot parametrelerini JSON'a paketler.
   - Satir 130-166: requestStepRoute ve fetchHazards; Rust API'ye POST/GET cagrilari yapar.
   - Satir 168-235: normalizeRouteResponse / normalizeSingleRoute / normalizeHazards; camelCase & snake_case yanitlari steps[] ve tehlike katmanlarina donusturur.
   ========================================================================== */
