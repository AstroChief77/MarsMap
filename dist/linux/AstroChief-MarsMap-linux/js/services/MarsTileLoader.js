/**
 * @file MarsTileLoader.js
 * @description Google Earth / Google Maps mimarisiyle tasarlanmis yuksek performansli karo piramidi yoneticisi.
 * - z=0..2 temel gezegen karolarini (42 karo = tam kure) RAM'de kalici (pinned) ve on-cozulmus (RGBA) tutar.
 * - z=3..7+ yuksek cozunurluklu karolari yalnizca kameranin baktigi frustum konisi (maks ~20 karo/seviye) icin yukler.
 * - Surukleme/yakinlastirma (isInteracting) sirasinda senkron getImageData ve ag/disk selini durdurarak 60+ FPS garanti eder.
 * - Zaman-dilimli (time-sliced) arka plan piksel cozucu kuyrugu ile sifir takilma (zero-jank) saglar.
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

      // Google Maps / Earth tarzi genis LRU onbellek (z<=2 asla silinmez)
      this.maxCachedTiles = 1400;
      this.maxConcurrentLoads = 6;
      this.activeLoads = 0;
      this.loadQueue = [];
      this.decodeQueue = [];
      this.decodeRafId = null;
      this.isInteracting = false;
      this.decodedVersion = 1;

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

    getDecodedVersion() {
      return this.decodedVersion;
    }

    /**
     * Kullanici haritayi suruklerken veya tekerlekle yakinlastirirken arka plan yuk/cozme islerini askiya alir
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
     * Google Earth ekran-uzayi hata (Screen-Space Error) metrigine gore optimal hedef karo seviyesini belirler
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
        if (zoom < 1.35) z = 2;
        else if (zoom < 2.65) z = 3;
        else if (zoom < 5.2) z = 4;
        else if (zoom < 10.5) z = 5;
        else if (zoom < 21.0) z = 6;
        else z = 7;
      } else {
        if (zoom < 1.35) z = 2;
        else if (zoom < 2.7) z = 3;
        else if (zoom < 5.4) z = 4;
        else if (zoom < 11.0) z = 5;
        else if (zoom < 22.0) z = 6;
        else z = 7;
      }

      return Math.min(z, maxCap);
    }

    /**
     * Yalnizca aktif kamera frustum konisine dusen karolari oncelik sirasiyla talep eder
     */
    requestVisibleTiles(layerId, viewState) {
      const layer = this.getLayerById(layerId);
      if (!layer) return 0;

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

      // 2. Surukleme/yakinlastirma esnasinda yeni z>=3 ag/disk kuyrugu baslatma (mevcut onbellek + z=2 taban ile 60 FPS ciz)
      if (this.isInteracting) {
        this.visibleRequested = requested;
        return targetZ;
      }

      // 3. Duraganlasinca eski kamera konumuna ait bekleyen z>=3 kuyrugunu temizle ve yeni frustum konisini sirala
      this.loadQueue = this.loadQueue.filter((item) => item.z <= 2);

      for (let lz = 3; lz <= targetZ; lz++) {
        requested += this.requestViewportWindow(layer, lz, viewState);
      }

      this.visibleRequested = requested;
      this.pumpLoadQueue();
      return targetZ;
    }

    /**
     * Kamera merkezine, 3D egime (camPitch/camYaw) ve olcege gore frustum-sinirli karo penceresini hesaplar
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
        const maxSpanLat = (180 / rows) * 2.5;
        const maxSpanLon = (360 / cols) * 3.0;
        const halfLon = Math.min(180, maxSpanLon, (vw * 0.52 / mapW) * 360);
        const halfLat = Math.min(90, maxSpanLat, (vh * 0.52 / mapH) * 180);

        const yMin = Math.max(0, Math.floor(((90 - (rotLat + halfLat)) / 180) * rows));
        const yMax = Math.min(rows - 1, Math.floor(((90 - (rotLat - halfLat)) / 180) * rows));
        const uMin = (rotLon - halfLon + 180) / 360;
        const uMax = (rotLon + halfLon + 180) / 360;
        const ixStart = Math.floor(uMin * cols);
        const ixEnd = Math.min(ixStart + 6, Math.floor(uMax * cols));

        const candidates = [];
        const cyMid = ((90 - rotLat) / 180) * rows;
        const cxMid = ((rotLon + 180) / 360) * cols;

        for (let y = yMin; y <= yMax; y++) {
          for (let ix = ixStart; ix <= ixEnd; ix++) {
            const x = ((ix % cols) + cols) % cols;
            const dist = Math.hypot(ix + 0.5 - cxMid, y + 0.5 - cyMid);
            candidates.push({ y, x, dist });
          }
        }
        candidates.sort((a, b) => a.dist - b.dist);
        for (const c of candidates) {
          this.loadTile(layer, z, c.y, c.x, false);
        }
        return candidates.length;
      }

      // 3D Kure Frustum Konisi: Her z>=3 seviyesinde yalnizca kameranin onundeki ~16-25 karoluk koniyi yukle
      const radius = viewState.sphereRadiusPx || (Math.min(vw, vh) * 0.41 * zoom);
      const maxHalfPx = Math.hypot(vw * 0.5, vh * 0.5);
      const screenDeg = radius > maxHalfPx
        ? (Math.asin(Math.min(0.95, maxHalfPx / radius)) * 180) / Math.PI + 6
        : 52;
      const tileLatDeg = 180 / rows;
      const maxConeDeg = tileLatDeg * 2.25;
      const halfLatSpan = Math.min(72, screenDeg, maxConeDeg);
      const halfLonSpan = Math.min(90, screenDeg * 1.15, maxConeDeg * 1.25);

      const yMin = Math.max(0, Math.floor(((90 - (rotLat + halfLatSpan)) / 180) * rows));
      const yMax = Math.min(rows - 1, Math.floor(((90 - (rotLat - halfLatSpan)) / 180) * rows));
      const cyMid = ((90 - rotLat) / 180) * rows;
      const cxMid = ((rotLon + 180) / 360) * cols;
      const candidates = [];

      for (let y = yMin; y <= yMax; y++) {
        const latCenter = 90 - ((y + 0.5) / rows) * 180;
        const latCos = Math.max(0.28, Math.cos((latCenter * Math.PI) / 180));
        const adjLonSpan = Math.min(135, halfLonSpan / latCos);
        const uMin = (rotLon - adjLonSpan + 180) / 360;
        const uMax = (rotLon + adjLonSpan + 180) / 360;
        const ixStart = Math.floor(uMin * cols);
        const ixEnd = Math.min(ixStart + 5, Math.floor(uMax * cols));

        for (let ix = ixStart; ix <= ixEnd; ix++) {
          const x = ((ix % cols) + cols) % cols;
          const dist = Math.hypot(ix + 0.5 - cxMid, y + 0.5 - cyMid);
          candidates.push({ y, x, dist });
        }
      }

      candidates.sort((a, b) => a.dist - b.dist);
      const cap = Math.min(candidates.length, 24);
      for (let i = 0; i < cap; i++) {
        const c = candidates[i];
        this.loadTile(layer, z, c.y, c.x, false);
      }
      return cap;
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
      if (existing) {
        // LRU yenilemesi
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
      if (this.isInteracting) return;
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
        this.enqueueDecode(record, record.z <= 2);
        this.pumpLoadQueue();
      };

      img.onerror = () => {
        this.activeLoads = Math.max(0, this.activeLoads - 1);
        record.status = "error";
        if (record.sourceKind === "wmts") {
          this.remoteConsecutiveErrors++;
          if (this.remoteConsecutiveErrors >= 3) {
            this.remoteBlockedUntil = Date.now() + 30000;
          }
        }
        this.pumpLoadQueue();
      };

      img.src = record.url;
    }

    /**
     * Karo piksellerini ana cizim dongusunu hic bloklamadan arka planda zaman-dilimli (time-sliced) cozer
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

      // Surukleme sirasinda yalnizca z<=2 taban karolarini coz, z>=3 karolarini surukleme bitene beklet
      const budget = this.isInteracting ? 1 : 3;
      let decodedAny = false;
      let count = 0;

      while (count < budget && this.decodeQueue.length > 0) {
        if (this.isInteracting && this.decodeQueue[0].z > 2) break;
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
        this.decodedVersion++;
        this.onTileReady?.();
      }

      if (this.decodeQueue.length > 0 && (!this.isInteracting || this.decodeQueue[0].z <= 2)) {
        this.scheduleDecodePump();
      }
    }

    /**
     * Tek 256x256 karonun ham RGBA piksel tamponunu cikarir
     */
    extractTilePixels(record) {
      if (!record || record.status !== "ready" || !record.img) return null;
      if (record.pixels) return record.pixels;
      if (record.tainted) return null;
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
   - Satir 1-8: JSDoc Google Earth/Maps mimarili frustum-sinirli ve zaman-dilimli karo piramidi tanimi.
   - Satir 14-125: constructor, initCatalog, setInteracting ve kaynak cozucu metodlar.
   - Satir 127-166: computeTargetZoom; ekran-uzayi hata metrigine gore optimal z=2..7 hedefini belirler.
   - Satir 168-288: requestVisibleTiles & requestViewportWindow; z=0..2 tabanini RAM'e sabitler, z>=3 icin yalnizca kameranin onundeki ~20 karoyu merkeze yakinlik sirasiyla yukler.
   - Satir 290-415: evictIfNeeded (z<=2 korumali 1400 karo LRU), eszamanlilik sinirli yukleme kuyrugu ve zaman-dilimli arka plan RGBA piksel cozucu (processDecodeQueue).
   - Satir 417-505: extractTilePixels, file:// mozaik yedegi ve katman telemetri istatistikleri.
   ========================================================================== */
