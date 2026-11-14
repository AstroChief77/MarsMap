/**
 * @file MarsTileLoader.js
 * @description data/tiles/ dizinindeki gercek NASA Mars Trek karolarini yalnizca gorunur olcek
 * penceresi icin kademeli (Progressive LOD) yukleyen karo piramidi yoneticisi.
 * Factory kurali: Harita olcegi yaklastikca render edilir, tamami ayni anda render edilmez.
 */

(function (ns) {
  "use strict";
  const { DatasetLoader } = ns;

  class MarsTileLoader {
    /**
     * MarsTileLoader yapici metodu
     * @param {Function} onTileReady - Yeni karo hazir oldugunda cagrilacak callback
     */
    constructor(onTileReady = null) {
      this.datasetLoader = new DatasetLoader();
      this.onTileReady = onTileReady;
      this.layers = [];
      this.planetaryConstants = null;
      this.tileImages = new Map();
      this.atlasMap = new Map();
      this.currentLodZoom = 0;
      this.visibleRequested = 0;
    }

    /**
     * Katalog JSON dosyasini yukleyip yerel karo katmanlarini hazirlar
     */
    async initCatalog() {
      const catalog = await this.datasetLoader.getTileLayersCatalog();
      if (!catalog || !Array.isArray(catalog.tile_layers)) {
        throw new Error("Karo katman katalogu (jpl_mars_trek_layers.json) yuklenemedi.");
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

    buildLocalTileUrl(layer, z, y, x) {
      return layer.local_template
        .replace("{z}", String(z))
        .replace("{y}", String(y))
        .replace("{x}", String(x));
    }

    /**
     * Yaklastirma olcegine gore hedef karo cozunurluk seviyesini belirler
     */
    computeTargetZoom(zoom, layer, progressiveLod) {
      if (!layer) return 0;
      const maxZ = Math.min(layer.max_local_zoom ?? 2, 2);
      if (!progressiveLod) return maxZ;
      if (zoom < 0.90) return 0;
      if (zoom < 1.40) return Math.min(1, maxZ);
      return maxZ;
    }

    /**
     * 3D kure doku orneklemesi icin birlestirilmis offscreen mozaik tamponunu hazirlar
     */
    ensureAtlas(layer) {
      if (this.atlasMap.has(layer.id)) return this.atlasMap.get(layer.id);
      const maxZ = Math.min(layer.max_local_zoom ?? 2, 2);
      const tilePx = layer.tile_size || 256;
      const width = Math.pow(2, maxZ + 1) * tilePx;
      const height = Math.pow(2, maxZ) * tilePx;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const entry = {
        layerId: layer.id,
        width,
        height,
        canvas,
        ctx,
        imgData: null,
        dirty: false,
        loadedTiles: new Set()
      };
      this.atlasMap.set(layer.id, entry);
      return entry;
    }

    /**
     * Yalnizca aktif kamera penceresi ve zoom kademesine dusen karolari yukler
     */
    requestVisibleTiles(layerId, viewState) {
      const layer = this.getLayerById(layerId);
      if (!layer) return 0;
      const atlas = this.ensureAtlas(layer);
      const progressive = viewState.progressiveLodRender !== false;
      const targetZ = this.computeTargetZoom(viewState.zoom || 1, layer, progressive);
      this.currentLodZoom = targetZ;

      // 1. Uzak olcek (z=0): Temel yuzey dokusunu eksik birakmaz (2 karo)
      let requested = this.enqueueRange(layer, atlas, 0, 0, 1, 0, 0);

      // 2. Orta olcek (z=1): Yakinlasinca veya progressive kapaliysa yuklenir
      if (targetZ >= 1) {
        if (!progressive) {
          requested = this.enqueueRange(layer, atlas, 1, 0, 3, 0, 1);
        } else {
          requested = this.requestViewportWindow(layer, atlas, 1, viewState);
        }
      }

      // 3. Yuksek olcek (z=2): Sadece kameranin gordugu bolge karolari yuklenir
      if (targetZ >= 2) {
        if (!progressive) {
          requested = this.enqueueRange(layer, atlas, 2, 0, 7, 0, 3);
        } else {
          requested = this.requestViewportWindow(layer, atlas, 2, viewState);
        }
      }

      this.visibleRequested = requested;
      return targetZ;
    }

    /**
     * Kamera merkez koordinatina gore yalnizca gorunur alana giren karo indislerini secer
     */
    requestViewportWindow(layer, atlas, z, viewState) {
      const cols = Math.pow(2, z + 1);
      const rows = Math.pow(2, z);
      const rotLat = viewState.rotLat ?? 0;
      const rotLon = viewState.rotLon ?? 0;
      const zoom = Math.max(viewState.zoom || 1, 0.65);

      const halfLonSpan = viewState.viewMode === "2d" ? Math.min(180, 118 / zoom) : 82;
      const halfLatSpan = viewState.viewMode === "2d" ? Math.min(90, 64 / zoom) : 68;

      let count = 0;
      for (let y = 0; y < rows; y++) {
        const latCenter = 90 - ((y + 0.5) / rows) * 180;
        if (Math.abs(latCenter - rotLat) > halfLatSpan + (180 / rows)) continue;

        const latCos = Math.max(0.25, Math.cos((latCenter * Math.PI) / 180));
        const adjLonSpan = Math.min(180, halfLonSpan / latCos);

        for (let x = 0; x < cols; x++) {
          const lonCenter = -180 + ((x + 0.5) / cols) * 360;
          let dLon = Math.abs(lonCenter - rotLon) % 360;
          if (dLon > 180) dLon = 360 - dLon;
          if (dLon <= adjLonSpan + (360 / cols)) {
            this.loadTile(layer, atlas, z, y, x);
            count++;
          }
        }
      }
      return count;
    }

    enqueueRange(layer, atlas, z, x0, x1, y0, y1) {
      let count = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          this.loadTile(layer, atlas, z, y, x);
          count++;
        }
      }
      return count;
    }

    loadTile(layer, atlas, z, y, x) {
      const key = `${layer.id}:${z}/${y}/${x}`;
      const existing = this.tileImages.get(key);
      if (existing) return existing;

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
        atlas.dirty = true;
        this.onTileReady?.(layer.id, z, y, x);
      };

      img.onerror = () => {
        record.status = "error";
      };

      img.src = url;
      return record;
    }

    getTileImage(layerId, z, y, x) {
      const rec = this.tileImages.get(`${layerId}:${z}/${y}/${x}`);
      return rec && rec.status === "ready" ? rec.img : null;
    }

    getAtlasPixels(layerId) {
      const layer = this.getLayerById(layerId);
      if (!layer) return null;
      const atlas = this.ensureAtlas(layer);
      if (atlas.tainted) return null;
      if (atlas.dirty || (!atlas.imgData && atlas.loadedTiles.size > 0)) {
        try {
          atlas.imgData = atlas.ctx.getImageData(0, 0, atlas.width, atlas.height).data;
          atlas.dirty = false;
        } catch (err) {
          atlas.tainted = true;
          return null;
        }
      }
      return atlas.imgData ? { width: atlas.width, height: atlas.height, data: atlas.imgData } : null;
    }

    isAtlasTainted(layerId) {
      const layer = this.getLayerById(layerId);
      if (!layer) return false;
      const atlas = this.atlasMap.get(layer.id);
      return Boolean(atlas && atlas.tainted);
    }

    getLayerStats(layerId) {
      const layer = this.getLayerById(layerId);
      if (!layer) return { id: "", name: "Yükleniyor", zoom: 0, loaded: 0, sourceDir: "./data/tiles" };
      const atlas = this.atlasMap.get(layer.id);
      return {
        id: layer.id,
        name: layer.name,
        zoom: this.currentLodZoom,
        loaded: atlas ? atlas.loadedTiles.size : 0,
        visibleRequested: this.visibleRequested,
        sourceDir: `./data/tiles/${layer.id}`
      };
    }
  }

  ns.MarsTileLoader = MarsTileLoader;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc Progressive LOD yerel karo piramidi yoneticisi tanimi.
   - Satir 8-22: constructor; DatasetLoader baglantisi, karo ve mozaik onbellek haritalarini baslatir.
   - Satir 24-58: initCatalog, getLayers, buildLocalTileUrl ve computeTargetZoom (yakinlasma olcegine gore z=0..2 secimi).
   - Satir 60-115: ensureAtlas ve requestVisibleTiles; yalnizca gorunur kamera penceresindeki karolari yukler.
   - Satir 117-161: requestViewportWindow ve enqueueRange; viewport kirpma mantigiyla gorunmeyen karolari atlar.
   - Satir 163-218: loadTile, getTileImage, getAtlasPixels ve getLayerStats metodlari.
   ========================================================================== */
