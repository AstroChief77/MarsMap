/**
 * @file MarsTileLoader.js
 * @description data/tiles/ yerel (z=0..5) ve cevrime acik NASA Mars Trek WMTS (z=3..7+)
 * karolarini gorunur olcek penceresi icin kademeli (Progressive LOD) yukleyen,
 * LRU bellekli ve 3D hizli tamsayi karo erisimli yuksek cozunurluklu karo piramidi yoneticisi.
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
      this.manifestSets = new Map();
      this.tileCache = new Map();
      this.fastGrid = new Map();
      this.atlasMap = new Map();
      this.maxCachedTiles = 360;
      this.currentLodZoom = 0;
      this.visibleRequested = 0;
      this.taintedOrigin = false;
      this.remoteConsecutiveErrors = 0;
      this.remoteBlockedUntil = 0;

      this.scratchCanvas = document.createElement("canvas");
      this.scratchCanvas.width = 256;
      this.scratchCanvas.height = 256;
      this.scratchCtx = this.scratchCanvas.getContext("2d", { willReadFrequently: true });
    }

    /**
     * Katalog ve yerel manifest.json haritasini paralel yukler
     */
    async initCatalog() {
      const [catalog, manifest] = await Promise.all([
        this.datasetLoader.getTileLayersCatalog(),
        this.datasetLoader.loadJson("./data/tiles/manifest.json")
      ]);
      if (!catalog || !Array.isArray(catalog.tile_layers)) {
        throw new Error("Karo katman katalogu (jpl_mars_trek_layers.json) yuklenemedi.");
      }
      this.layers = catalog.tile_layers;
      this.planetaryConstants = catalog.planetary_constants || null;

      if (manifest && manifest.tiles) {
        Object.entries(manifest.tiles).forEach(([layerId, list]) => {
          this.manifestSets.set(layerId, new Set(list));
        });
      }
      for (const layer of this.layers) {
        this.ensureFastLevels(layer.id);
      }
      return this.layers;
    }

    ensureFastLevels(layerId) {
      if (!this.fastGrid.has(layerId)) {
        const levels = [];
        for (let z = 0; z <= 10; z++) levels.push(new Map());
        this.fastGrid.set(layerId, levels);
      }
      return this.fastGrid.get(layerId);
    }

    getLayerFastTables(layerId) {
      return this.fastGrid.get(layerId) || this.ensureFastLevels(layerId);
    }

    getLayers() {
      return this.layers;
    }

    getLayerById(layerId) {
      return this.layers.find((l) => l.id === layerId) || this.layers[0] || null;
    }

    hasLocalTile(layerId, z, y, x) {
      const set = this.manifestSets.get(layerId);
      return set ? set.has(`${z}/${y}/${x}`) : z <= 2;
    }

    isRemoteBlocked() {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
      return Date.now() < this.remoteBlockedUntil;
    }

    buildLocalTileUrl(layer, z, y, x) {
      return layer.local_template
        .replace("{z}", String(z))
        .replace("{y}", String(y))
        .replace("{x}", String(x));
    }

    buildRemoteTileUrl(layer, z, y, x) {
      return layer.wmts_template
        .replace("{z}", String(z))
        .replace("{y}", String(y))
        .replace("{x}", String(x));
    }

    /**
     * Karo kaynagini cozer: Oncelik 1) Yerel data/tiles (manifest), 2) CORS NASA WMTS
     */
    resolveTileSource(layer, z, y, x) {
      if (this.hasLocalTile(layer.id, z, y, x)) {
        return { url: this.buildLocalTileUrl(layer, z, y, x), sourceKind: "local", useCors: false };
      }
      if (layer.cors_enabled && layer.wmts_template && z <= (layer.max_remote_zoom ?? 7) && !this.isRemoteBlocked()) {
        return { url: this.buildRemoteTileUrl(layer, z, y, x), sourceKind: "wmts", useCors: true };
      }
      return null;
    }

    /**
     * Ekran piksel yogunluguna (HiDPI dahil) gore 1:1 netlik saglayacak hedef karo seviyesini belirler
     */
    computeTargetZoom(viewStateOrZoom, layer, progressiveLodArg) {
      if (!layer) return 0;
      const vs = (typeof viewStateOrZoom === "object" && viewStateOrZoom !== null)
        ? viewStateOrZoom
        : { zoom: viewStateOrZoom || 1, progressiveLodRender: progressiveLodArg };

      const progressiveLod = vs.progressiveLodRender !== false;
      if (!progressiveLod) return Math.min(2, layer.max_local_zoom ?? 2);

      const dpr = Math.min(vs.dpr || (typeof window !== "undefined" ? window.devicePixelRatio : 1) || 1, 2);
      const zoom = Math.max(vs.zoom || 1, 0.55);
      let neededWidthPx;

      if (vs.viewMode === "3d" || vs.sphereRadiusPx) {
        const radiusPx = vs.sphereRadiusPx || (Math.min(vs.viewportW || 1280, vs.viewportH || 720) * 0.41 * zoom);
        neededWidthPx = 2 * Math.PI * radiusPx * dpr;
      } else {
        const mapW = vs.mapWidthPx || (Math.max((vs.viewportW || 1280) * 0.86, 620) * zoom);
        neededWidthPx = mapW * dpr;
      }

      const maxLocal = layer.max_crater_zoom ?? 5;
      const maxCap = (layer.cors_enabled && !this.isRemoteBlocked())
        ? Math.max(maxLocal, layer.max_remote_zoom ?? 7)
        : maxLocal;

      let z = 1;
      while (z < maxCap && (256 * Math.pow(2, z + 1)) < neededWidthPx * 1.04) {
        z++;
      }
      return Math.min(z, maxCap);
    }

    /**
     * Yalnizca aktif kamera penceresi ve olcege dusen karolari O(gorunur) hizinda talep eder
     */
    requestVisibleTiles(layerId, viewState) {
      const layer = this.getLayerById(layerId);
      if (!layer) return 0;

      const progressive = viewState.progressiveLodRender !== false;
      const targetZ = this.computeTargetZoom(viewState, layer);
      this.currentLodZoom = targetZ;

      // 1. Uzak taban (z=0 ve z=1): Gecislerde hic bosluk kalmamasi icin sicak tutulur (10 karo)
      this.enqueueRange(layer, 0, 0, 1, 0, 0);
      this.enqueueRange(layer, 1, 0, 3, 0, 1);

      let requested = 10;
      if (!progressive) {
        requested = this.enqueueRange(layer, 2, 0, 7, 0, 3);
      } else if (targetZ >= 2) {
        // 2. Yakinlasildikca z=2..targetZ ata yedek piramidini gorunur pencerede sicak tut
        for (let lz = 2; lz <= targetZ; lz++) {
          requested = this.requestViewportWindow(layer, lz, viewState);
        }
      }

      this.visibleRequested = requested;
      return targetZ;
    }

    /**
     * Kamera merkezine ve olcegine gore dogrudan gorunur (y, x) indis araligini hesaplar
     */
    requestViewportWindow(layer, z, viewState) {
      const cols = 1 << (z + 1);
      const rows = 1 << z;
      const rotLat = viewState.rotLat ?? 0;
      const rotLon = viewState.rotLon ?? 0;
      const zoom = Math.max(viewState.zoom || 1, 0.55);
      const vw = viewState.viewportW || (typeof window !== "undefined" ? window.innerWidth : 1280);
      const vh = viewState.viewportH || (typeof window !== "undefined" ? window.innerHeight : 720);

      if (viewState.viewMode === "2d") {
        const mapW = viewState.mapWidthPx || (Math.max(vw * 0.86, 620) * zoom);
        const mapH = mapW * 0.5;
        const halfLon = Math.min(180, (vw * 0.5 / mapW) * 360);
        const halfLat = Math.min(90, (vh * 0.5 / mapH) * 180);
        const yMin = Math.max(0, Math.floor(((90 - (rotLat + halfLat)) / 180) * rows) - 1);
        const yMax = Math.min(rows - 1, Math.floor(((90 - (rotLat - halfLat)) / 180) * rows) + 1);

        let ixStart = 0;
        let ixEnd = cols - 1;
        if (halfLon < 179.5) {
          const uMin = (rotLon - halfLon + 180) / 360;
          const uMax = (rotLon + halfLon + 180) / 360;
          ixStart = Math.floor(uMin * cols) - 1;
          ixEnd = Math.min(ixStart + cols - 1, Math.floor(uMax * cols) + 1);
        }

        let count = 0;
        for (let y = yMin; y <= yMax; y++) {
          for (let ix = ixStart; ix <= ixEnd; ix++) {
            const x = ((ix % cols) + cols) % cols;
            if (this.loadTile(layer, z, y, x)) count++;
          }
        }
        return count;
      }

      const radius = viewState.sphereRadiusPx || (Math.min(vw, vh) * 0.41 * zoom);
      const maxHalfPx = Math.hypot(vw * 0.5, vh * 0.5);
      const visDeg = radius > maxHalfPx
        ? (Math.asin(Math.min(1, maxHalfPx / radius)) * 180) / Math.PI + 10
        : 90;
      const halfLatSpan = Math.min(90, visDeg);
      const halfLonSpan = Math.min(180, visDeg);

      const yMin = Math.max(0, Math.floor(((90 - (rotLat + halfLatSpan)) / 180) * rows) - 1);
      const yMax = Math.min(rows - 1, Math.floor(((90 - (rotLat - halfLatSpan)) / 180) * rows) + 1);

      let count = 0;
      for (let y = yMin; y <= yMax; y++) {
        const latCenter = 90 - ((y + 0.5) / rows) * 180;
        const latCos = Math.max(0.15, Math.cos((latCenter * Math.PI) / 180));
        const adjLonSpan = Math.min(180, halfLonSpan / latCos);

        if (adjLonSpan >= 179) {
          for (let x = 0; x < cols; x++) {
            if (this.loadTile(layer, z, y, x)) count++;
          }
        } else {
          const uMin = (rotLon - adjLonSpan + 180) / 360;
          const uMax = (rotLon + adjLonSpan + 180) / 360;
          const ixStart = Math.floor(uMin * cols) - 1;
          const ixEnd = Math.min(ixStart + cols - 1, Math.floor(uMax * cols) + 1);
          for (let ix = ixStart; ix <= ixEnd; ix++) {
            const x = ((ix % cols) + cols) % cols;
            if (this.loadTile(layer, z, y, x)) count++;
          }
        }
      }
      return count;
    }

    enqueueRange(layer, z, x0, x1, y0, y1) {
      let count = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (this.loadTile(layer, z, y, x)) count++;
        }
      }
      return count;
    }

    evictIfNeeded() {
      if (this.tileCache.size <= this.maxCachedTiles) return;
      for (const minZ of [4, 3, 2]) {
        for (const [key, rec] of this.tileCache.entries()) {
          if (rec.z >= minZ && rec.status !== "loading") {
            this.tileCache.delete(key);
            this.fastGrid.get(rec.layerId)?.[rec.z]?.delete(rec.intKey);
            if (this.tileCache.size <= this.maxCachedTiles - 32) return;
          }
        }
      }
    }

    loadTile(layer, z, y, x) {
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
      img.decoding = "async";

      const intKey = (y << 12) | x;
      const record = {
        img, z, y, x, intKey,
        layerId: layer.id,
        sourceKind: resolved.sourceKind,
        status: "loading",
        pixels: null,
        tainted: false,
        url: resolved.url
      };

      this.tileCache.set(key, record);
      this.ensureFastLevels(layer.id)[z]?.set(intKey, record);

      img.onload = () => {
        record.status = "ready";
        if (resolved.sourceKind === "wmts") this.remoteConsecutiveErrors = 0;
        if (z <= 2) this.drawToFallbackAtlas(layer, z, y, x, img);
        this.onTileReady?.(layer.id, z, y, x);
      };

      img.onerror = () => {
        record.status = "error";
        if (resolved.sourceKind === "wmts") {
          this.remoteConsecutiveErrors++;
          if (this.remoteConsecutiveErrors >= 3) {
            this.remoteBlockedUntil = Date.now() + 30000;
          }
        }
      };

      img.src = resolved.url;
      return record;
    }

    /**
     * 3D isin izleme icin tek 256x256 karonun ham RGBA piksel tamponunu tembel olarak cikarir
     */
    extractTilePixels(record) {
      if (!record || record.status !== "ready") return null;
      if (record.pixels) return record.pixels;
      if (record.tainted) return null;
      try {
        this.scratchCtx.clearRect(0, 0, 256, 256);
        this.scratchCtx.drawImage(record.img, 0, 0, 256, 256);
        record.pixels = this.scratchCtx.getImageData(0, 0, 256, 256).data;
        return record.pixels;
      } catch (err) {
        record.tainted = true;
        if (record.sourceKind === "local") this.taintedOrigin = true;
        return null;
      }
    }

    /**
     * file:// korumali 3D yedek cizimi icin hafif z<=2 mozaik tuvalini gunceller
     */
    ensureFallbackAtlas(layer) {
      if (this.atlasMap.has(layer.id)) return this.atlasMap.get(layer.id);
      const maxZ = 2;
      const tilePx = layer.tile_size || 256;
      const width = Math.pow(2, maxZ + 1) * tilePx;
      const height = Math.pow(2, maxZ) * tilePx;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const entry = { layerId: layer.id, width, height, canvas, ctx, loadedTiles: new Set() };
      this.atlasMap.set(layer.id, entry);
      return entry;
    }

    drawToFallbackAtlas(layer, z, y, x, img) {
      const atlas = this.ensureFallbackAtlas(layer);
      const cols = 1 << (z + 1);
      const rows = 1 << z;
      const dw = atlas.width / cols;
      const dh = atlas.height / rows;
      atlas.ctx.drawImage(img, x * dw, y * dh, dw, dh);
      atlas.loadedTiles.add(`${z}/${y}/${x}`);
    }

    hasAnyReadyTile(layerId) {
      const levels = this.fastGrid.get(layerId);
      if (!levels) return false;
      for (let z = 0; z <= 2; z++) {
        for (const rec of levels[z].values()) {
          if (rec.status === "ready") return true;
        }
      }
      return false;
    }

    getTileImage(layerId, z, y, x) {
      const rec = this.fastGrid.get(layerId)?.[z]?.get((y << 12) | x);
      return rec && rec.status === "ready" ? rec.img : null;
    }

    isAtlasTainted(layerId) {
      if (this.taintedOrigin) return true;
      const levels = this.fastGrid.get(layerId);
      if (!levels) return false;
      for (const rec of levels[0].values()) {
        if (rec.tainted) return true;
      }
      return false;
    }

    getLayerStats(layerId) {
      const layer = this.getLayerById(layerId);
      if (!layer) return { id: "", name: "Yükleniyor", zoom: 0, loaded: 0, sourceDir: "./data/tiles" };
      let readyCount = 0;
      const levels = this.fastGrid.get(layer.id);
      if (levels) {
        for (const map of levels) {
          for (const rec of map.values()) {
            if (rec.status === "ready") readyCount++;
          }
        }
      }
      return {
        id: layer.id,
        name: layer.name,
        zoom: this.currentLodZoom,
        loaded: readyCount,
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
   - Satir 1-6: JSDoc z=0..5 yerel + WMTS hibrit karo piramidi ve LRU bellek yoneticisi tanimi.
   - Satir 12-120: constructor, initCatalog, fastGrid ve resolveTileSource; manifest.json yukler ve 3D icin O(1) tamsayi karo tablolari kurar.
   - Satir 122-156: computeTargetZoom; HiDPI ekran yogunluguna gore z=1..7+ hedef seviyesini hesaplar.
   - Satir 158-262: requestVisibleTiles & requestViewportWindow; kamera penceresine giren z=0..targetZ karolarini O(gorunur) hizinda talep eder.
   - Satir 264-334: evictIfNeeded & loadTile; LRU bellek siniri ve cevrime kapali WMTS devre kesicisi ile karolari yukler.
   - Satir 336-430: extractTilePixels (256x256 tembel piksel cikarimi), file:// mozaik yedegi ve katman istatistikleri.
   ========================================================================== */
