/**
 * @file MarsTileLoader.js
 * @description data/datasets/jpl_mars_trek_layers.json katalogundan okunan katman
 * sablonlarini kullanarak data/tiles/ dizininden gercek Mars karolarini ceken motor.
 */

import { DatasetLoader } from "./DatasetLoader.js";

export class MarsTileLoader {
  /**
   * MarsTileLoader yapici metodu
   * @param {Function} onTileReady - Yeni bir yerel karo yuklendiginde tetiklenecek callback
   */
  constructor(onTileReady = null) {
    this.datasetLoader = new DatasetLoader();
    this.onTileReady = onTileReady;
    this.layers = [];
    this.planetaryConstants = null;
    this.tileImages = new Map();
    this.atlasMap = new Map();
    this.currentZoomLevel = 0;
    this.visibleRequested = 0;
  }

  /**
   * data/datasets/jpl_mars_trek_layers.json dosyasini yukler ve yerel katmanlari hazirlar
   */
  async initCatalog() {
    const catalog = await this.datasetLoader.getTileLayersCatalog();
    if (!catalog || !Array.isArray(catalog.tile_layers)) {
      throw new Error("jpl_mars_trek_layers.json katalogu okunamadi.");
    }
    this.layers = catalog.tile_layers;
    this.planetaryConstants = catalog.planetary_constants || null;
    return this.layers;
  }

  getLayers() {
    return this.layers;
  }

  getLayerById(layerId) {
    return this.layers.find((l) => l.id === layerId) || this.layers[0] || null;
  }

  /**
   * Katalogdaki local_template uzerinden ./data/tiles/<layer>/{z}/{y}/{x}.<ext> yolunu uretir
   */
  buildLocalTileUrl(layer, z, y, x) {
    return layer.local_template
      .replace("{z}", String(z))
      .replace("{y}", String(y))
      .replace("{x}", String(x));
  }

  /**
   * Zoom degerine gore hedeflenecek karo duzeyini (0..max_local_zoom) hesaplar
   */
  computeTargetZoom(zoom, layer, progressiveLod) {
    if (!layer) return 0;
    const maxZ = Math.min(layer.max_local_zoom ?? 2, 2);
    if (!progressiveLod) return maxZ;
    if (zoom < 0.92) return Math.min(1, maxZ);
    if (zoom < 1.38) return Math.min(1, maxZ);
    return maxZ;
  }

  /**
   * Katman icin 3D kure raycaster tarafindan orneklenecek equirectangular piksel tamponunu olusturur
   */
  ensureAtlas(layer) {
    if (this.atlasMap.has(layer.id)) {
      return this.atlasMap.get(layer.id);
    }
    const maxZ = Math.min(layer.max_local_zoom ?? 2, 2);
    const tilePx = layer.tile_size || 256;
    const w = Math.pow(2, maxZ + 1) * tilePx;
    const h = Math.pow(2, maxZ) * tilePx;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const entry = {
      layerId: layer.id,
      maxZ,
      width: w,
      height: h,
      canvas,
      ctx,
      imgData: null,
      dirty: false,
      loadedTiles: new Set(),
      highestTileZ: -1
    };
    this.atlasMap.set(layer.id, entry);
    return entry;
  }

  /**
   * Verilen gorunum alani (3D kure acisi veya 2D pan/zoom) icin yalnizca gorunur karolari ister
   */
  requestVisibleTiles(layerId, viewState) {
    const layer = this.getLayerById(layerId);
    if (!layer) return 0;
    const atlas = this.ensureAtlas(layer);
    const progressive = viewState.progressiveLodRender !== false;
    const targetZ = this.computeTargetZoom(viewState.zoom || 1, layer, progressive);
    this.currentZoomLevel = targetZ;

    // 1. Temel kaba kure dokusu eksik kalmasin diye z=0 karolarini her zaman hazirla
    this.enqueueTileRange(layer, atlas, 0, 0, 1, 0, 0);

    // 2. Z=1 karolarini gorunum olcegi z>=1 veya tam modda iste
    if (targetZ >= 1) {
      const cols1 = 4;
      const rows1 = 2;
      if (!progressive || (viewState.zoom || 1) < 1.38) {
        this.enqueueTileRange(layer, atlas, 1, 0, cols1 - 1, 0, rows1 - 1);
      } else {
        this.requestHemisphereRange(layer, atlas, 1, viewState);
      }
    }

    // 3. Z=2 detay karolarini yalnizca kameraya donuk / gorunur pencere icin iste
    if (targetZ >= 2) {
      if (progressive) {
        this.visibleRequested = this.requestHemisphereRange(layer, atlas, 2, viewState);
      } else {
        this.visibleRequested = this.enqueueTileRange(layer, atlas, 2, 0, 7, 0, 3);
      }
    } else {
      this.visibleRequested = targetZ === 0 ? 2 : 8;
    }

    return targetZ;
  }

  /**
   * Kamera merkez koordinatlarina gore yalnizca ekrana bakan (gorunur) karo indislerini secer
   */
  requestHemisphereRange(layer, atlas, z, viewState) {
    const cols = Math.pow(2, z + 1);
    const rows = Math.pow(2, z);
    const rotLat = viewState.rotLat ?? 0;
    const rotLon = viewState.rotLon ?? 0;
    const halfSpanLon = viewState.viewMode === "2d" ? Math.min(180, 120 / Math.max(viewState.zoom, 0.7)) : 82;
    const halfSpanLat = viewState.viewMode === "2d" ? Math.min(90, 68 / Math.max(viewState.zoom, 0.7)) : 68;

    let count = 0;
    for (let y = 0; y < rows; y++) {
      const latCenter = 90 - ((y + 0.5) / rows) * 180;
      if (Math.abs(latCenter - rotLat) > halfSpanLat + (180 / rows)) continue;

      const latCos = Math.max(0.25, Math.cos((latCenter * Math.PI) / 180));
      const adjustedLonSpan = Math.min(180, halfSpanLon / latCos);

      for (let x = 0; x < cols; x++) {
        const lonCenter = -180 + ((x + 0.5) / cols) * 360;
        let dLon = Math.abs(lonCenter - rotLon) % 360;
        if (dLon > 180) dLon = 360 - dLon;
        if (dLon <= adjustedLonSpan + (360 / cols)) {
          this.loadSingleTile(layer, atlas, z, y, x);
          count++;
        }
      }
    }
    return count;
  }

  enqueueTileRange(layer, atlas, z, x0, x1, y0, y1) {
    let count = 0;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        this.loadSingleTile(layer, atlas, z, y, x);
        count++;
      }
    }
    return count;
  }

  /**
   * Tek bir yerel karoyu ./data/tiles/ yolundan yukler ve mozaik tamponuna isler
   */
  loadSingleTile(layer, atlas, z, y, x) {
    const key = `${layer.id}:${z}/${y}/${x}`;
    const cached = this.tileImages.get(key);
    if (cached) return cached;

    const url = this.buildLocalTileUrl(layer, z, y, x);
    const img = new Image();
    const record = { img, status: "loading", z, y, x, url };
    this.tileImages.set(key, record);

    img.onload = () => {
      record.status = "ready";
      const cols = Math.pow(2, z + 1);
      const rows = Math.pow(2, z);
      const dw = atlas.width / cols;
      const dh = atlas.height / rows;
      atlas.ctx.drawImage(img, x * dw, y * dh, dw, dh);
      atlas.loadedTiles.add(`${z}/${y}/${x}`);
      atlas.highestTileZ = Math.max(atlas.highestTileZ, z);
      atlas.dirty = true;
      this.onTileReady?.(layer.id, z, y, x);
    };

    img.onerror = () => {
      record.status = "error";
    };

    img.src = url;
    return record;
  }

  /**
   * 2D gorunumde doğrudan karo cizimi icin hazir img nesnesini doner
   */
  getTileImage(layerId, z, y, x) {
    const rec = this.tileImages.get(`${layerId}:${z}/${y}/${x}`);
    return rec && rec.status === "ready" ? rec.img : null;
  }

  /**
   * 3D kure piksel tarayicisi icin guncel equirectangular piksel verisini doner
   */
  getAtlasPixels(layerId) {
    const layer = this.getLayerById(layerId);
    if (!layer) return null;
    const atlas = this.ensureAtlas(layer);
    if (atlas.dirty || (!atlas.imgData && atlas.loadedTiles.size > 0)) {
      atlas.imgData = atlas.ctx.getImageData(0, 0, atlas.width, atlas.height).data;
      atlas.dirty = false;
    }
    return atlas.imgData ? { width: atlas.width, height: atlas.height, data: atlas.imgData } : null;
  }

  /**
   * Telemetri etiketi icin aktif katman ve data/tiles karo sayisini raporlar
   */
  getLayerStats(layerId) {
    const layer = this.getLayerById(layerId);
    if (!layer) return { name: "Yukleniyor", zoom: 0, loaded: 0, sourceDir: "./data/tiles" };
    const atlas = this.atlasMap.get(layer.id);
    return {
      id: layer.id,
      name: layer.name,
      zoom: this.currentZoomLevel,
      loaded: atlas ? atlas.loadedTiles.size : 0,
      visibleRequested: this.visibleRequested,
      sourceDir: `./data/tiles/${layer.id}`
    };
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc data/tiles karo piramidi yoneticisi tanimi.
   - Satir 8-22: MarsTileLoader constructor; DatasetLoader baglantisi ve karo/atlas onbellegini kurar.
   - Satir 24-49: initCatalog ve buildLocalTileUrl; data/datasets/jpl_mars_trek_layers.json sablonlarindan yerel ./data/tiles/ adreslerini uretir.
   - Satir 51-130: ensureAtlas, computeTargetZoom, requestVisibleTiles ve requestHemisphereRange; yakinlastikca yalnizca kameraya donuk karolari Progressive LOD olarak yukler.
   - Satir 132-194: loadSingleTile, getTileImage, getAtlasPixels ve getLayerStats; yuklenen JPG/PNG karolarini atlas tamponuna isler.
   ========================================================================== */
