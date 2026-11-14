/**
 * @file MarsTileLoader.js
 * @description data/datasets/jpl_mars_trek_layers.json + data/tiles/manifest.json uzerinden
 * yerel (z=0..5) ve canli CORS destekli (z=3..7) 256x256 NASA karolarini LRU bellege alip
 * bilineer alt-piksel orneklemesi sunan yuksek cozunurluklu karo piramidi yoneticisi.
 */

import { DatasetLoader } from "./DatasetLoader.js";

export class MarsTileLoader {
  /**
   * MarsTileLoader yapici metodu
   * @param {Function} onTileReady - Karo cozumlendiginde cizimi tetikleyecek callback
   * @param {BackendApiService|null} backendApi - Opsiyonel /api/v1/tiles proxy istemcisi
   */
  constructor(onTileReady = null, backendApi = null) {
    this.datasetLoader = new DatasetLoader();
    this.onTileReady = onTileReady;
    this.backendApi = backendApi;

    this.layers = [];
    this.planetaryConstants = null;
    this.manifestSets = new Map();
    this.tileCache = new Map();
    this.maxCachedTiles = 220;

    this.scratchCanvas = document.createElement("canvas");
    this.scratchCanvas.width = 256;
    this.scratchCanvas.height = 256;
    this.scratchCtx = this.scratchCanvas.getContext("2d", { willReadFrequently: true });

    this.currentZoomLevel = 0;
    this.visibleRequested = 0;
    this.activeSourceTag = "./data/tiles";
  }

  /**
   * Katman katalogunu ve mevcut yerel data/tiles/manifest.json haritasini yukler
   */
  async initCatalog() {
    const [catalog, manifest] = await Promise.all([
      this.datasetLoader.getTileLayersCatalog(),
      this.datasetLoader.loadJson("./data/tiles/manifest.json")
    ]);

    if (!catalog || !Array.isArray(catalog.tile_layers)) {
      throw new Error("jpl_mars_trek_layers.json katalogu okunamadi.");
    }
    this.layers = catalog.tile_layers;
    this.planetaryConstants = catalog.planetary_constants || null;

    if (manifest && manifest.tiles) {
      Object.entries(manifest.tiles).forEach(([layerId, list]) => {
        this.manifestSets.set(layerId, new Set(list));
      });
    }
    return this.layers;
  }

  getLayers() {
    return this.layers;
  }

  getLayerById(layerId) {
    return this.layers.find((l) => l.id === layerId) || this.layers[0] || null;
  }

  hasLocalTile(layerId, z, y, x) {
    const set = this.manifestSets.get(layerId);
    return set ? set.has(`${z}/${y}/${x}`) : z <= 1;
  }

  /**
   * Karo adresini cozer: Oncelik 1) data/tiles/manifest, 2) Backend Proxy, 3) CORS NASA WMTS
   */
  resolveTileSource(layer, z, y, x) {
    if (this.hasLocalTile(layer.id, z, y, x)) {
      return {
        url: layer.local_template.replace("{z}", String(z)).replace("{y}", String(y)).replace("{x}", String(x)),
        sourceKind: "local-data",
        useCors: false
      };
    }

    if (this.backendApi?.hasBackend()) {
      return {
        url: this.backendApi.getTileProxyUrl(layer.id, z, y, x),
        sourceKind: "backend-proxy",
        useCors: true
      };
    }

    if (layer.cors_enabled && z <= (layer.max_remote_zoom ?? 7)) {
      return {
        url: layer.wmts_template.replace("{z}", String(z)).replace("{y}", String(y)).replace("{x}", String(x)),
        sourceKind: "nasa-wmts",
        useCors: true
      };
    }

    return null;
  }

  /**
   * Ekran yari-capina (radius px) gore 1:1 piksel kalitesi saglayacak karo duzeyini (z=0..7) secer
   */
  computeTargetZoom(viewState, layer) {
    if (!layer) return 0;
    const radiusPx = viewState.sphereRadiusPx || (400 * (viewState.zoom || 1));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const neededCircumference = 2 * Math.PI * radiusPx * dpr;

    let z = 2;
    while (z < 7 && (256 * Math.pow(2, z + 1)) < neededCircumference * 0.92) {
      z++;
    }
    if (viewState.progressiveLodRender === false) {
      z = Math.min(z, layer.max_local_zoom ?? 2);
    }
    const maxCap = (layer.cors_enabled || this.backendApi?.hasBackend())
      ? (layer.max_remote_zoom ?? 7)
      : (layer.max_crater_zoom ?? 5);
    return Math.min(z, maxCap);
  }

  /**
   * Verilen kamera/gorunum penceresi icin gereken gorunur karolari talep eder
   */
  requestVisibleTiles(layerId, viewState) {
    const layer = this.getLayerById(layerId);
    if (!layer) return 0;

    const targetZ = this.computeTargetZoom(viewState, layer);
    this.currentZoomLevel = targetZ;

    // Kaba z=0 ve z=1 yerel tabani kure arka yuzunde bile bosluk kalmamasi icin hazir tut
    this.enqueueTileRange(layer, 0, 0, 1, 0, 0);
    this.enqueueTileRange(layer, 1, 0, 3, 0, 1);

    // Yakinlasildikca yalnizca gorunen pencere (rotLat/rotLon/zoom) karolarini yukle
    let totalReq = 0;
    if (targetZ >= 2) {
      const preloadPrev = Math.max(2, targetZ - 1);
      if (preloadPrev < targetZ) {
        this.requestWindowForZoom(layer, preloadPrev, viewState);
      }
      totalReq = this.requestWindowForZoom(layer, targetZ, viewState);
    } else {
      totalReq = targetZ === 0 ? 2 : 8;
    }

    this.visibleRequested = totalReq;
    return targetZ;
  }

  /**
   * Kuredeki veya 2D penceredeki gorus alanina giren (y, x) karo matrisini hesaplar
   */
  requestWindowForZoom(layer, z, viewState) {
    const cols = Math.pow(2, z + 1);
    const rows = Math.pow(2, z);
    const rotLat = viewState.rotLat ?? 0;
    const rotLon = viewState.rotLon ?? 0;
    const zoom = Math.max(viewState.zoom || 1, 0.55);

    const halfSpanLon = viewState.viewMode === "2d" ? Math.min(180, 115 / zoom) : Math.min(180, 78 / zoom);
    const halfSpanLat = viewState.viewMode === "2d" ? Math.min(90, 68 / zoom) : Math.min(90, 64 / zoom);

    let count = 0;
    let sourceLabel = "./data/tiles";
    for (let y = 0; y < rows; y++) {
      const latCenter = 90 - ((y + 0.5) / rows) * 180;
      if (Math.abs(latCenter - rotLat) > halfSpanLat + (180 / rows)) continue;

      const latCos = Math.max(0.22, Math.cos((latCenter * Math.PI) / 180));
      const adjLonSpan = Math.min(180, halfSpanLon / latCos);

      for (let x = 0; x < cols; x++) {
        const lonCenter = -180 + ((x + 0.5) / cols) * 360;
        let dLon = Math.abs(lonCenter - rotLon) % 360;
        if (dLon > 180) dLon = 360 - dLon;
        if (dLon <= adjLonSpan + (360 / cols)) {
          const rec = this.loadSingleTile(layer, z, y, x);
          if (rec && rec.sourceKind === "nasa-wmts") sourceLabel = "./data/tiles + NASA WMTS";
          if (rec && rec.sourceKind === "backend-proxy") sourceLabel = "Backend Proxy + data/tiles";
          count++;
        }
      }
    }
    this.activeSourceTag = sourceLabel;
    return count;
  }

  enqueueTileRange(layer, z, x0, x1, y0, y1) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.loadSingleTile(layer, z, y, x);
      }
    }
  }

  evictIfNeeded() {
    if (this.tileCache.size <= this.maxCachedTiles) return;
    for (const [k, rec] of this.tileCache.entries()) {
      if (rec.z >= 2 && rec.status !== "loading") {
        this.tileCache.delete(k);
        if (this.tileCache.size <= this.maxCachedTiles - 25) break;
      }
    }
  }

  /**
   * Tek bir 256x256 karoyu yukler ve piksel tamponunu (Uint8ClampedArray) bellege cikarir
   */
  loadSingleTile(layer, z, y, x) {
    const key = `${layer.id}:${z}/${y}/${x}`;
    const existing = this.tileCache.get(key);
    if (existing) {
      this.tileCache.delete(key);
      this.tileCache.set(key, existing);
      return existing;
    }

    const resolved = this.resolveTileSource(layer, z, y, x);
    if (!resolved) return null;

    this.evictIfNeeded();
    const img = new Image();
    if (resolved.useCors) img.crossOrigin = "anonymous";

    const record = {
      img, z, y, x,
      layerId: layer.id,
      status: "loading",
      sourceKind: resolved.sourceKind,
      pixels: null
    };
    this.tileCache.set(key, record);

    img.onload = () => {
      try {
        this.scratchCtx.clearRect(0, 0, 256, 256);
        this.scratchCtx.drawImage(img, 0, 0, 256, 256);
        record.pixels = this.scratchCtx.getImageData(0, 0, 256, 256).data;
        record.status = "ready";
      } catch {
        record.status = "cors-tainted";
        return;
      }
      this.onTileReady?.(layer.id, z, y, x);
    };

    img.onerror = () => {
      record.status = "error";
    };

    img.src = resolved.url;
    return record;
  }

  /**
   * 3D piksel tarayicisi icin (u, v) koordinatinda targetZ'den 0'a inerek en keskin hazir karoyu ornekler
   */
  sampleBilinearRGB(layerId, maxZ, u, v, outRgb) {
    for (let z = maxZ; z >= 0; z--) {
      const cols = 1 << (z + 1);
      const rows = 1 << z;
      const gx = u * cols;
      const gy = v * rows;
      const tx = Math.min(cols - 1, gx | 0);
      const ty = Math.min(rows - 1, gy | 0);
      const rec = this.tileCache.get(`${layerId}:${z}/${ty}/${tx}`);
      if (!rec || rec.status !== "ready" || !rec.pixels) continue;

      const fx = (gx - tx) * 255.0;
      const fy = (gy - ty) * 255.0;
      const px0 = fx | 0;
      const py0 = fy | 0;
      const px1 = px0 < 255 ? px0 + 1 : 255;
      const py1 = py0 < 255 ? py0 + 1 : 255;
      const dx = fx - px0;
      const dy = fy - py0;
      const odx = 1 - dx;
      const ody = 1 - dy;

      const d = rec.pixels;
      const i00 = ((py0 << 8) + px0) << 2;
      const i10 = ((py0 << 8) + px1) << 2;
      const i01 = ((py1 << 8) + px0) << 2;
      const i11 = ((py1 << 8) + px1) << 2;

      const w00 = odx * ody;
      const w10 = dx * ody;
      const w01 = odx * dy;
      const w11 = dx * dy;

      outRgb[0] = d[i00] * w00 + d[i10] * w10 + d[i01] * w01 + d[i11] * w11;
      outRgb[1] = d[i00 + 1] * w00 + d[i10 + 1] * w10 + d[i01 + 1] * w01 + d[i11 + 1] * w11;
      outRgb[2] = d[i00 + 2] * w00 + d[i10 + 2] * w10 + d[i01 + 2] * w01 + d[i11 + 2] * w11;
      return true;
    }
    return false;
  }

  hasAnyReadyTile(layerId) {
    for (const rec of this.tileCache.values()) {
      if (rec.layerId === layerId && rec.status === "ready") return true;
    }
    return false;
  }

  getTileImage(layerId, z, y, x) {
    const rec = this.tileCache.get(`${layerId}:${z}/${y}/${x}`);
    return rec && rec.status === "ready" ? rec.img : null;
  }

  getLayerStats(layerId) {
    const layer = this.getLayerById(layerId);
    if (!layer) return { name: "Yukleniyor", zoom: 0, loaded: 0, sourceLabel: "./data/tiles" };
    let readyAtActive = 0;
    for (const rec of this.tileCache.values()) {
      if (rec.layerId === layer.id && rec.status === "ready") readyAtActive++;
    }
    return {
      id: layer.id,
      name: layer.name,
      zoom: this.currentZoomLevel,
      loaded: readyAtActive,
      visibleRequested: this.visibleRequested,
      sourceLabel: this.activeSourceTag
    };
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-8: JSDoc hibrit yerel + NASA WMTS/Backend LRU karo piramidi tanimi.
   - Satir 10-58: constructor & initCatalog; manifest.json ve jpl_mars_trek_layers.json yukler.
   - Satir 60-115: hasLocalTile, resolveTileSource, computeTargetZoom; ekran piksel yogunluguna gore z=0..7 duzeyini belirler.
   - Satir 117-179: requestVisibleTiles & requestWindowForZoom; yalnizca gorunur penceredeki karolari talep eder.
   - Satir 181-225: evictIfNeeded & loadSingleTile; 256x256 karolarin ham piksel tamponlarini LRU bellege alir.
   - Satir 227-264: sampleBilinearRGB, hasAnyReadyTile, getTileImage ve getLayerStats metodlari.
   ========================================================================== */
