/**
 * @file MarsTileLoader.js
 * @description Google Earth / Google Maps mimarisiyle tasarlanmis yuksek performansli karo piramidi yoneticisi.
 * - z=0..2 temel gezegen karolarini (42 karo = tam kure) RAM'de kalici (pinned) ve on-cozulmus (RGBA) tutar.
 * - Yakinlastirma (zoom) sirasinda z=3..5 yerel karolari kesintisiz yukleyerek piksellesmeyi onler.
 * - Zaman-dilimli (time-sliced) arka plan piksel cozucu kuyrugu ile hem 60 FPS akicilik hem aninda netlik saglar.
 */

(function (ns) {
  "use strict";
  const { DatasetLoader } = ns;

  class MarsTileLoader {
    /**
     * MarsTileLoader yapici metodu
     * @param {Function} onTileReady - Yeni karo pikselleri hazir oldugunda cagrilacak callback
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

      // Genis LRU onbellek (z<=2 asla silinmez)
      this.maxCachedTiles = 1500;
      this.maxConcurrentLoads = 10;
      this.activeLoads = 0;
      this.loadQueue = [];
      this.decodeQueue = [];
      this.decodeRafId = null;
      this.isInteracting = false;
      this.lastInteractEnqueueTs = 0;
      this.decodedVersion = 1;

      this.currentLodZoom = 0;
      this.visibleRequested = 0;
      this.taintedOrigin = false;
      this.remoteConsecutiveErrors = 0;
      this.remoteBlockedUntil = 0;
      // Hata alan karolar bu sure (ms) sonra yeniden denenir (kalici "error" kilidini onler)
      this.errorRetryMs = 15000;

      const hasDom = typeof document !== "undefined" && typeof document.createElement === "function";
      this.scratchCanvas = hasDom ? document.createElement("canvas") : null;
      if (this.scratchCanvas) {
        this.scratchCanvas.width = 256;
        this.scratchCanvas.height = 256;
      }
      this.scratchCtx = this.scratchCanvas ? this.scratchCanvas.getContext("2d", { willReadFrequently: true }) : null;
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

    getDecodedVersion() {
      return this.decodedVersion;
    }

    /**
     * Etkilesim durumunu gunceller; etkilesim bittiginde bekleyen tum yukleme/cozme kuyruklarini hizlandirir
     */
    setInteracting(flag) {
      const next = Boolean(flag);
      if (this.isInteracting === next) return;
      this.isInteracting = next;
      if (!next) {
        this.pumpLoadQueue();
        this.scheduleDecodePump();
      }
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
     * Yakinlastirma esnasinda piksellesmeyi onlemek icin erken yuksek-LOD (z=3..5+) secen hedef fonksiyonu
     */
    computeTargetZoom(viewStateOrZoom, layer, progressiveLodArg) {
      if (!layer) return 0;
      const vs = (typeof viewStateOrZoom === "object" && viewStateOrZoom !== null)
        ? viewStateOrZoom
        : { zoom: viewStateOrZoom || 1, progressiveLodRender: progressiveLodArg };

      const progressiveLod = vs.progressiveLodRender !== false;
      if (!progressiveLod) return Math.min(2, layer.max_local_zoom ?? 2);

      const zoom = Math.max(vs.zoom || 1, 0.55);
      const maxLocal = layer.max_local_zoom ?? layer.max_crater_zoom ?? 5;
      const maxCap = (layer.cors_enabled && !this.isRemoteBlocked())
        ? Math.max(maxLocal, layer.max_remote_zoom ?? 7)
        : maxLocal;

      let z;
      if (vs.viewMode === "3d" || vs.sphereRadiusPx) {
        if (zoom < 0.92) z = 2;
        else if (zoom < 1.55) z = 3;
        else if (zoom < 2.75) z = 4;
        else if (zoom < 6.8) z = 5;
        else if (zoom < 14.0) z = 6;
        else z = 7;
      } else {
        if (zoom < 0.95) z = 2;
        else if (zoom < 1.65) z = 3;
        else if (zoom < 3.0) z = 4;
        else if (zoom < 7.2) z = 5;
        else if (zoom < 15.0) z = 6;
        else z = 7;
      }

      return Math.min(z, maxCap);
    }

    /**
     * Aktif kamera frustum konisine dusen karolari ata-piramit (z=2..targetZ) sirasiyla talep eder
     */
    requestVisibleTiles(layerId, viewState) {
      const layer = this.getLayerById(layerId);
      if (!layer) return 0;

      const isDragging = Boolean(viewState.isDragging);
      const isZooming = Boolean(viewState.isZooming);
      if (typeof viewState.isInteracting === "boolean") {
        this.setInteracting(viewState.isInteracting);
      }

      const progressive = viewState.progressiveLodRender !== false;
      const targetZ = this.computeTargetZoom(viewState, layer);
      this.currentLodZoom = targetZ;

      // 1. Kalici (Pinned) Taban Piramidi: z=0 (2), z=1 (8), z=2 (32) = 42 karo her zaman RAM'de hazir tutulur
      let requested = 0;
      requested += this.enqueueRange(layer, 0, 0, 1, 0, 0, true);
      requested += this.enqueueRange(layer, 1, 0, 3, 0, 1, true);
      requested += this.enqueueRange(layer, 2, 0, 7, 0, 3, true);

      if (!progressive || targetZ <= 2) {
        this.visibleRequested = requested;
        this.pumpLoadQueue();
        return targetZ;
      }

      // 2. Hizli surukleme esnasinda 75ms'de bir yalnizca merkezdeki karolari guncelle; yakinlastirma (zoom) sirasinda ise kesintisiz yukle!
      const now = performance.now();
      if (isDragging && !isZooming) {
        if (now - this.lastInteractEnqueueTs < 75) {
          this.visibleRequested = requested;
          return targetZ;
        }
        this.lastInteractEnqueueTs = now;
      }

      // 3. Eski kamera konumuna ait bekleyen z>=3 kuyrugunu temizle ve yeni frustum konisini (z=3..targetZ) sirala
      //    Kuyruktan dusen kayitlar onbellekten de silinir; aksi halde sonsuza dek "queued" kalip ekrana donemezler.
      this.dropStaleQueuedTiles();

      for (let lz = 3; lz <= targetZ; lz++) {
        requested += this.requestViewportWindow(layer, lz, viewState, isDragging && !isZooming);
      }

      this.visibleRequested = requested;
      this.pumpLoadQueue();
      return targetZ;
    }

    /**
     * Kamera merkezine ve olcege gore frustum-sinirli karo penceresini merkeze yakinlik sirasiyla yukler
     */
    requestViewportWindow(layer, z, viewState, compactDragWindow = false) {
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
        const maxSpanLat = (180 / rows) * (compactDragWindow ? 1.8 : 2.8);
        const maxSpanLon = (360 / cols) * (compactDragWindow ? 2.2 : 3.2);
        const halfLon = Math.min(180, maxSpanLon, (vw * 0.55 / mapW) * 360);
        const halfLat = Math.min(90, maxSpanLat, (vh * 0.55 / mapH) * 180);

        const yMin = Math.max(0, Math.floor(((90 - (rotLat + halfLat)) / 180) * rows));
        const yMax = Math.min(rows - 1, Math.floor(((90 - (rotLat - halfLat)) / 180) * rows));
        const uMin = (rotLon - halfLon + 180) / 360;
        const uMax = (rotLon + halfLon + 180) / 360;
        const cyMid = ((90 - rotLat) / 180) * rows;
        const cxMid = ((rotLon + 180) / 360) * cols;
        const [ixStart, ixEnd] = this.clampColumnSpan(Math.floor(uMin * cols), Math.floor(uMax * cols), cxMid, 8);

        const candidates = [];

        for (let y = yMin; y <= yMax; y++) {
          for (let ix = ixStart; ix <= ixEnd; ix++) {
            const x = ((ix % cols) + cols) % cols;
            const dist = Math.hypot(ix + 0.5 - cxMid, y + 0.5 - cyMid);
            candidates.push({ y, x, dist });
          }
        }
        candidates.sort((a, b) => a.dist - b.dist);
        const cap = Math.min(candidates.length, compactDragWindow ? 12 : 28);
        for (let i = 0; i < cap; i++) {
          const c = candidates[i];
          this.loadTile(layer, z, c.y, c.x, false);
        }
        return cap;
      }

      // 3D Kure Frustum Konisi
      const radius = viewState.sphereRadiusPx || (Math.min(vw, vh) * 0.41 * zoom);
      const maxHalfPx = Math.hypot(vw * 0.5, vh * 0.5);
      const screenDeg = radius > maxHalfPx
        ? (Math.asin(Math.min(0.96, maxHalfPx / radius)) * 180) / Math.PI + 8
        : 58;
      const tileLatDeg = 180 / rows;
      const maxConeDeg = tileLatDeg * (compactDragWindow ? 1.65 : 2.5);
      const halfLatSpan = Math.min(76, screenDeg, maxConeDeg);
      const halfLonSpan = Math.min(96, screenDeg * 1.18, maxConeDeg * 1.3);

      const yMin = Math.max(0, Math.floor(((90 - (rotLat + halfLatSpan)) / 180) * rows));
      const yMax = Math.min(rows - 1, Math.floor(((90 - (rotLat - halfLatSpan)) / 180) * rows));
      const cyMid = ((90 - rotLat) / 180) * rows;
      const cxMid = ((rotLon + 180) / 360) * cols;
      const candidates = [];

      for (let y = yMin; y <= yMax; y++) {
        const latCenter = 90 - ((y + 0.5) / rows) * 180;
        const latCos = Math.max(0.26, Math.cos((latCenter * Math.PI) / 180));
        const adjLonSpan = Math.min(145, halfLonSpan / latCos);
        const uMin = (rotLon - adjLonSpan + 180) / 360;
        const uMax = (rotLon + adjLonSpan + 180) / 360;
        const [ixStart, ixEnd] = this.clampColumnSpan(Math.floor(uMin * cols), Math.floor(uMax * cols), cxMid, 7);

        for (let ix = ixStart; ix <= ixEnd; ix++) {
          const x = ((ix % cols) + cols) % cols;
          const dist = Math.hypot(ix + 0.5 - cxMid, y + 0.5 - cyMid);
          candidates.push({ y, x, dist });
        }
      }

      candidates.sort((a, b) => a.dist - b.dist);
      const cap = Math.min(candidates.length, compactDragWindow ? 12 : 28);
      for (let i = 0; i < cap; i++) {
        const c = candidates[i];
        this.loadTile(layer, z, c.y, c.x, false);
      }
      return cap;
    }

    /**
     * Sutun araligini kamera merkezine (cxMid) gore simetrik olarak en fazla maxCols sutuna kirpar
     * (eski "ixStart + N" yontemi dogu yarisini asimetrik kesiyordu)
     */
    clampColumnSpan(ixStart, ixEnd, cxMid, maxCols) {
      if (ixEnd - ixStart + 1 <= maxCols) return [ixStart, ixEnd];
      const start = Math.max(ixStart, Math.round(cxMid - maxCols / 2));
      const end = Math.min(ixEnd, start + maxCols - 1);
      return [Math.max(ixStart, end - maxCols + 1), end];
    }

    /** Kuyrukta bekleyen z>=3 kayitlarini kuyruktan VE onbellekten (tileCache + fastGrid) siler */
    dropStaleQueuedTiles() {
      const keep = [];
      for (const rec of this.loadQueue) {
        if (rec.z <= 2) keep.push(rec);
        else if (rec.status === "queued") this.forgetTile(rec);
      }
      this.loadQueue = keep;
    }

    forgetTile(rec) {
      this.tileCache.delete(`${rec.layerId}:${rec.z}/${rec.y}/${rec.x}`);
      const level = this.fastGrid.get(rec.layerId)?.[rec.z];
      if (level && level.get(rec.intKey) === rec) level.delete(rec.intKey);
    }

    enqueueRange(layer, z, x0, x1, y0, y1, highPriority = false) {
      let count = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (this.loadTile(layer, z, y, x, highPriority)) count++;
        }
      }
      return count;
    }

    /**
     * LRU Onbellek Temizligi: z<=2 temel karolarini ASLA silmez, yalnizca eski z>=3 karolarini tahliye eder
     */
    evictIfNeeded() {
      if (this.tileCache.size <= this.maxCachedTiles) return;
      for (const minZ of [5, 4, 3]) {
        for (const [key, rec] of this.tileCache.entries()) {
          if (rec.z >= minZ && rec.z >= 3 && rec.status !== "loading" && rec.status !== "queued") {
            this.tileCache.delete(key);
            this.fastGrid.get(rec.layerId)?.[rec.z]?.delete(rec.intKey);
            if (this.tileCache.size <= this.maxCachedTiles - 64) return;
          }
        }
      }
    }

    loadTile(layer, z, y, x, highPriority = false) {
      const key = `${layer.id}:${z}/${y}/${x}`;
      const existing = this.tileCache.get(key);
      if (existing && existing.status === "error" && Date.now() - (existing.failedAt || 0) > this.errorRetryMs) {
        this.forgetTile(existing);
      } else if (existing) {
        this.tileCache.delete(key);
        this.tileCache.set(key, existing);
        if (existing.status === "ready" && !existing.pixels && !existing.decodeQueued && !existing.tainted) {
          this.enqueueDecode(existing, z <= 2);
        }
        return existing;
      }

      const resolved = this.resolveTileSource(layer, z, y, x);
      if (!resolved) return null;

      this.evictIfNeeded();
      const intKey = (y << 12) | x;
      const record = {
        img: null,
        z, y, x, intKey,
        layer,
        layerId: layer.id,
        sourceKind: resolved.sourceKind,
        useCors: resolved.useCors,
        status: "queued",
        pixels: null,
        decodeQueued: false,
        tainted: false,
        url: resolved.url
      };

      this.tileCache.set(key, record);
      this.ensureFastLevels(layer.id)[z]?.set(intKey, record);

      if (highPriority || z <= 2) {
        this.startImageLoad(record);
      } else {
        this.loadQueue.push(record);
      }
      return record;
    }

    pumpLoadQueue() {
      while (this.activeLoads < this.maxConcurrentLoads && this.loadQueue.length > 0) {
        const nextRec = this.loadQueue.shift();
        if (!nextRec || nextRec.status !== "queued") continue;
        this.startImageLoad(nextRec);
      }
    }

    startImageLoad(record) {
      record.status = "loading";
      this.activeLoads++;

      const img = new Image();
      if (record.useCors) img.crossOrigin = "anonymous";
      img.decoding = "async";
      record.img = img;

      img.onload = () => {
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        record.status = "ready";
        if (record.sourceKind === "wmts") this.remoteConsecutiveErrors = 0;
        if (record.z <= 2) {
          this.drawToFallbackAtlas(record.layer, record.z, record.y, record.x, img);
        }
        this.enqueueDecode(record, record.z <= 3);
        this.pumpLoadQueue();
      };

      img.onerror = () => {
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        record.status = "error";
        record.failedAt = Date.now();
        if (record.sourceKind === "wmts") {
          this.remoteConsecutiveErrors++;
          if (this.remoteConsecutiveErrors >= 3) {
            this.remoteBlockedUntil = Date.now() + 30000;
          }
        } else if (record.sourceKind === "local") {
          // Yerel karo diskte yok (404): manifestten dusur ve NASA WMTS yedegine hemen gec
          this.manifestSets.get(record.layerId)?.delete(`${record.z}/${record.y}/${record.x}`);
          this.forgetTile(record);
          this.loadTile(record.layer, record.z, record.y, record.x, record.z <= 2);
        }
        this.pumpLoadQueue();
      };

      img.src = record.url;
    }

    /**
     * Karo piksellerini ana cizim dongusunu bloklamadan arka planda zaman-dilimli (time-sliced) cozer
     */
    enqueueDecode(record, highPriority = false) {
      if (!record || record.pixels || record.decodeQueued || record.tainted || record.status !== "ready") return;
      record.decodeQueued = true;
      if (highPriority) {
        this.decodeQueue.unshift(record);
      } else {
        this.decodeQueue.push(record);
      }
      this.scheduleDecodePump();
    }

    scheduleDecodePump() {
      if (this.decodeRafId || this.decodeQueue.length === 0) return;
      this.decodeRafId = requestAnimationFrame(() => {
        this.decodeRafId = null;
        this.processDecodeQueue();
      });
    }

    processDecodeQueue() {
      if (this.decodeQueue.length === 0) return;

      // Etkilesim sirasinda kare basina 2 karo, duragan iken 6 karo cozerek aninda netlesme sagla
      const budget = this.isInteracting ? 2 : 6;
      let decodedAny = false;
      let count = 0;

      while (count < budget && this.decodeQueue.length > 0) {
        const rec = this.decodeQueue.shift();
        if (!rec) continue;
        rec.decodeQueued = false;
        if (rec.status !== "ready" || rec.pixels) continue;
        const px = this.extractTilePixels(rec);
        if (px) {
          decodedAny = true;
          count++;
        }
      }

      if (decodedAny) {
        // decodedVersion yalnizca extractTilePixels icinde artirilir (cift artis kaldirildi)
        this.onTileReady?.();
      }

      if (this.decodeQueue.length > 0) {
        this.scheduleDecodePump();
      }
    }

    /**
     * Tek 256x256 karonun ham RGBA piksel tamponunu cikarir
     */
    extractTilePixels(record) {
      if (!record || record.status !== "ready" || !record.img) return null;
      if (record.pixels) return record.pixels;
      if (record.tainted || !this.scratchCtx) return null;
      try {
        this.scratchCtx.clearRect(0, 0, 256, 256);
        this.scratchCtx.drawImage(record.img, 0, 0, 256, 256);
        record.pixels = this.scratchCtx.getImageData(0, 0, 256, 256).data;
        this.decodedVersion++;
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
   - Satir 1-7: JSDoc Google Earth/Maps mimarili kesintisiz yakinlastirma ve karo piramidi tanimi.
   - Satir 13-125: constructor, initCatalog, setInteracting ve kaynak cozucu metodlar.
   - Satir 127-166: computeTargetZoom; yakinlastirma sirasinda piksellesmeyi onleyen yuksek-LOD secimi.
   - Satir 168-295: requestVisibleTiles & requestViewportWindow; yakinlastirma ve suruklemede merkezden disa dogru z=3..5+ karolarini akici yukler.
   - Satir 297-425: evictIfNeeded (z<=2 korumali 1500 karo LRU), yukleme kuyrugu ve zaman-dilimli arka plan RGBA piksel cozucu.
   - Satir 427-512: extractTilePixels, file:// mozaik yedegi ve katman telemetri istatistikleri.
   ========================================================================== */
