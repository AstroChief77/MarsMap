/**
 * @file BackendApiService.js
 * @description Backend pathfinding, canli cevresel tehlike, radyasyon, DEM yukseklik ve
 * yuksek cozunurluklu karo proxy endpoint'leri icin hazir HTTP istemci katmani.
 */

export const API_ENDPOINTS = {
  health: "/api/v1/health",
  craters: "/api/v1/craters",
  pathfindCompute: "/api/v1/pathfind/compute",
  hazardsLive: "/api/v1/hazards/live",
  radiationZones: "/api/v1/radiation/zones",
  elevationProbe: "/api/v1/telemetry/elevation",
  tileProxy: "/api/v1/tiles/{layer_id}/{z}/{y}/{x}"
};

export class BackendApiService {
  /**
   * BackendApiService yapici metodu
   * @param {string} baseUrl - Backend kok URL adresi (ornegin http://127.0.0.1:8000)
   */
  constructor(baseUrl = "") {
    this.baseUrl = this.resolveInitialBaseUrl(baseUrl);
    this.status = this.baseUrl ? "configured" : "standalone";
    this.lastHealth = null;
    this.lastError = null;
  }

  /**
   * Oncelik sirasina gore URL cozumu: ?api= parametresi > parametre > window.ASTROCHIEF_CONFIG
   */
  resolveInitialBaseUrl(fallbackUrl) {
    try {
      const params = new URLSearchParams(window.location.search);
      const qApi = params.get("api");
      if (qApi) return qApi.replace(/\/+$/, "");
    } catch {
      // Yoksay
    }
    const winCfg = window.ASTROCHIEF_CONFIG?.apiBaseUrl;
    const raw = fallbackUrl || winCfg || "";
    return raw ? String(raw).replace(/\/+$/, "") : "";
  }

  setBaseUrl(url) {
    this.baseUrl = url ? String(url).trim().replace(/\/+$/, "") : "";
    this.status = this.baseUrl ? "configured" : "standalone";
    this.lastError = null;
  }

  hasBackend() {
    return Boolean(this.baseUrl);
  }

  buildUrl(endpointPath, queryParams = null) {
    if (!this.baseUrl) return null;
    const url = new URL(`${this.baseUrl}${endpointPath}`);
    if (queryParams) {
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
      });
    }
    return url.toString();
  }

  /**
   * Backend tile proxy adresi (/api/v1/tiles/{layer_id}/{z}/{y}/{x}) uretir
   */
  getTileProxyUrl(layerId, z, y, x) {
    if (!this.baseUrl) return null;
    const path = API_ENDPOINTS.tileProxy
      .replace("{layer_id}", encodeURIComponent(layerId))
      .replace("{z}", String(z))
      .replace("{y}", String(y))
      .replace("{x}", String(x));
    return `${this.baseUrl}${path}`;
  }

  /**
   * Zaman asimli genel JSON fetch sarmalayicisi
   */
  async fetchJson(url, options = {}, timeoutMs = 8000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} (${resp.statusText})`);
      }
      return await resp.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * GET /api/v1/health - Backend saglik ve hazirlik kontrolu
   */
  async checkHealth() {
    const url = this.buildUrl(API_ENDPOINTS.health);
    if (!url) {
      this.status = "standalone";
      return { ok: false, reason: "Backend URL tanimlanmadi" };
    }
    try {
      const data = await this.fetchJson(url, { method: "GET" }, 4000);
      this.status = "connected";
      this.lastHealth = data;
      this.lastError = null;
      return { ok: true, data };
    } catch (err) {
      this.status = "error";
      this.lastError = err.message;
      return { ok: false, reason: err.message };
    }
  }

  /**
   * Backend /api/v1/pathfind/compute endpoint'i icin tam standart istek govdesini olusturur
   */
  buildPathfindPayload(startPoint, goalPoint, appState) {
    return {
      crater_id: appState.craterId || "gale-crater",
      start: { lat: Number(startPoint.lat.toFixed(5)), lon: Number(startPoint.lon.toFixed(5)) },
      goal: { lat: Number(goalPoint.lat.toFixed(5)), lon: Number(goalPoint.lon.toFixed(5)) },
      filters: {
        avoid_acid_rain: Boolean(appState.filterAcidRain),
        acid_rain_intensity: appState.acidIntensity || "moderate",
        avoid_dust_storm: Boolean(appState.filterDustStorm),
        dust_storm_intensity: appState.stormIntensity || "moderate",
        avoid_radiation_hotspots: Boolean(appState.showRadiationZones)
      },
      astronaut_params: {
        suit_o2_reserve_liters: appState.oxygenReserveLiters ?? 420,
        suit_water_reserve_liters: appState.waterReserveLiters ?? 24.0,
        max_safe_slope_deg: 24,
        units: {
          distance: "km/m",
          duration: "hours",
          volume: "liters",
          radiation: "alpha/beta/gamma"
        }
      }
    };
  }

  /**
   * POST /api/v1/pathfind/compute - Backend rota hesaplama istegi
   */
  async requestPathfind(startPoint, goalPoint, appState) {
    const payload = this.buildPathfindPayload(startPoint, goalPoint, appState);
    const url = this.buildUrl(API_ENDPOINTS.pathfindCompute);
    if (!url) {
      return { ok: false, offlineContract: payload, reason: "Backend URL ayarlanmadi (Ayarlar -> Backend API URL)" };
    }
    try {
      const data = await this.fetchJson(url, {
        method: "POST",
        body: JSON.stringify(payload)
      }, 15000);
      this.status = "connected";
      window.dispatchEvent(new CustomEvent("astrochief:backend-route-ready", { detail: data }));
      return { ok: true, data, payload };
    } catch (err) {
      this.lastError = err.message;
      return { ok: false, payload, reason: err.message };
    }
  }

  /**
   * GET /api/v1/hazards/live - Bolge cevresel tehlike katmanlarini ceker
   */
  async fetchLiveHazards(lat, lon, radiusKm = 250) {
    const url = this.buildUrl(API_ENDPOINTS.hazardsLive, { lat: lat.toFixed(3), lon: lon.toFixed(3), radius_km: radiusKm });
    if (!url) return null;
    try {
      return await this.fetchJson(url, { method: "GET" }, 5000);
    } catch {
      return null;
    }
  }

  /**
   * GET /api/v1/radiation/zones - Alfa/Beta/Gama ve foton bombardimani bolgelerini ceker
   */
  async fetchRadiationZones(craterId, lat, lon) {
    const url = this.buildUrl(API_ENDPOINTS.radiationZones, { crater_id: craterId, lat: lat.toFixed(3), lon: lon.toFixed(3) });
    if (!url) return null;
    try {
      return await this.fetchJson(url, { method: "GET" }, 5000);
    } catch {
      return null;
    }
  }

  /**
   * GET /api/v1/telemetry/elevation - Tek nokta MOLA DEM yukseklik & egim sorgusu
   */
  async fetchElevation(lat, lon) {
    const url = this.buildUrl(API_ENDPOINTS.elevationProbe, { lat: lat.toFixed(4), lon: lon.toFixed(4) });
    if (!url) return null;
    try {
      return await this.fetchJson(url, { method: "GET" }, 3500);
    } catch {
      return null;
    }
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-15: JSDoc ve API_ENDPOINTS sabit sozlugu (/api/v1/* backend adresleri).
   - Satir 17-59: BackendApiService constructor, URL cozumleme (?api=, ASTROCHIEF_CONFIG, ayarlardan URL).
   - Satir 61-106: getTileProxyUrl, fetchJson zaman asimli istemcisi ve checkHealth kontrolu.
   - Satir 108-156: buildPathfindPayload ve requestPathfind (Asit, Firtina, Litre, km/m, Saat, Alfa/Beta/Gama parametreleriyle POST gonderimi).
   - Satir 158-193: fetchLiveHazards, fetchRadiationZones ve fetchElevation telemetri sorgu metodlari.
   ========================================================================== */
