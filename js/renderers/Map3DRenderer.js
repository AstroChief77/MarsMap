/**
 * @file Map3DRenderer.js
 * @description Google Earth sinifi 60+ FPS 3D Kure isin izleme (raycasting) motoru.
 * - MOLA topografik kabartma ve egim isiklandirmasini 4x4 blok koselerinde hesaplayarak 16x hizlanma saglar.
 * - Surukleme esnasinda sifir getImageData blokajli progressive parent-tile yedegi ve 1-tap hizliornekleme kullanir.
 * - Duraganlasinca 4-tap bilineer yuksek cozunurluklu netlestirme ve kare-onbellekli (frame-cached) raster cizimi yapar.
 */

(function (ns) {
  "use strict";
  const { OverlayDrawHelper, RouteCanvasRenderer } = ns;

  class Map3DRenderer {
    /**
     * Map3DRenderer yapici metodu
     * @param {MarsTileLoader} tileLoader - Yerel/WMTS karo yukleyici
     */
    constructor(tileLoader) {
      this.tileLoader = tileLoader;
      this.overlays = new OverlayDrawHelper();
      this.routeRenderer = new RouteCanvasRenderer();
      this.cropCanvas = document.createElement("canvas");
      this.cropCtx = this.cropCanvas.getContext("2d");
      this.cropImgData = null;
      this.cropBuf32 = null;
      this.bufW = 0;
      this.bufH = 0;
      this.currentRes = 0;
      this.lastRayKey = "";
      this.lastRayOk = false;
      const probe32 = new Uint32Array([0x11223344]);
      this.isLittleEndian = new Uint8Array(probe32.buffer)[0] === 0x44;
    }

    ensureCropBuffer(bw, bh) {
      if (this.bufW === bw && this.bufH === bh && this.cropImgData) return;
      this.bufW = bw;
      this.bufH = bh;
      this.cropCanvas.width = bw;
      this.cropCanvas.height = bh;
      this.cropImgData = this.cropCtx.createImageData(bw, bh);
      this.cropBuf32 = this.isLittleEndian ? new Uint32Array(this.cropImgData.data.buffer) : null;
      this.currentRes = Math.max(bw, bh);
      this.lastRayKey = "";
    }

    /**
     * 3D Mars Kuresini cizer ve tiklanabilir krater hedeflerini dondurur
     */
    render(ctx, state) {
      const {
        width, height, rotLat, rotLon, zoom, activeLayerId, dpr,
        camPitch, camYaw, topoReliefScale, enable3DTerrain,
        isDragging, isInteracting, craters, landingSites, activeCrater,
        hazardBundle, computedRoutes, progressiveLodRender,
        showGraticule, showNomenclature, showRouteComments, highQualityGlobeRay,
        routeScope, customOrigin, customDestination
      } = state;

      ctx.clearRect(0, 0, width, height);
      const cx = width * 0.5;
      const cy = height * 0.5;
      const clampedZoom = Math.min(Math.max(zoom, 0.55), 80.0);
      const radius = Math.min(width, height) * 0.41 * clampedZoom;
      const pitch = Math.max(0, Math.min(72, camPitch ?? 28));
      const yaw = camYaw ?? 0;
      const reliefScale = enable3DTerrain === false ? 0 : (topoReliefScale ?? 1.0);
      const topo = ns.marsTopo;
      const radFactor = (topo && reliefScale > 0) ? topo.getRadialScaleFactor(clampedZoom, pitch, reliefScale) : 0;
      const centerElevM = (topo && reliefScale > 0) ? topo.getElevationMeters(rotLat, rotLon) : 0;
      const rCenter = 1.0 + centerElevM * radFactor;
      const rMaxLimb = 1.0 + 21500 * radFactor;
      const pitchRad = (pitch * Math.PI) / 180;
      const sphereCy = cy + radius * rCenter * Math.sin(pitchRad);
      const limbRadius = radius * rMaxLimb;
      const limbVisible = limbRadius < Math.sqrt(cx * cx + sphereCy * sphereCy) * 1.18;

      // 1. Dis Mars atmosferi kehribar limb isimasi (yalnizca kenar gorunurken)
      if (limbVisible) {
        const atmo = ctx.createRadialGradient(cx, sphereCy, limbRadius * 0.94, cx, sphereCy, limbRadius * 1.12);
        atmo.addColorStop(0.0, "rgba(235, 128, 70, 0.5)");
        atmo.addColorStop(0.45, "rgba(205, 88, 38, 0.2)");
        atmo.addColorStop(1.0, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = atmo;
        ctx.beginPath();
        ctx.arc(cx, sphereCy, limbRadius * 1.12, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!this.tileLoader.hasAnyReadyTile(activeLayerId)) {
        this.drawLoadingSphere(ctx, cx, cy, Math.min(radius, width * 0.45));
        return [];
      }

      const sx0 = Math.max(0, Math.floor(cx - limbRadius - 2));
      const sy0 = Math.max(0, Math.floor(sphereCy - limbRadius - 2));
      const sx1 = Math.min(width, Math.ceil(cx + limbRadius + 2));
      const sy1 = Math.min(height, Math.ceil(sphereCy + limbRadius + 2));
      const cropW = sx1 - sx0;
      const cropH = sy1 - sy0;

      const devDpr = Math.min(dpr || 1, 2);
      const fastMode = Boolean(isDragging || isInteracting);
      const layer = this.tileLoader.getLayerById(activeLayerId);
      const targetZ = this.tileLoader.computeTargetZoom({
        zoom: clampedZoom,
        sphereRadiusPx: radius,
        dpr: devDpr,
        viewMode: "3d",
        progressiveLodRender: progressiveLodRender !== false
      }, layer);

      const isTainted = this.tileLoader.isAtlasTainted?.(activeLayerId);
      let renderedRay = false;

      if (!isTainted && cropW > 0 && cropH > 0) {
        let scale;
        if (fastMode) {
          scale = Math.min(0.52, Math.sqrt(64000 / Math.max(1, cropW * cropH)));
        } else if (highQualityGlobeRay) {
          scale = Math.min(devDpr, Math.sqrt(1350000 / Math.max(1, cropW * cropH)));
        } else {
          scale = Math.min(Math.min(devDpr, 1.2), Math.sqrt(560000 / Math.max(1, cropW * cropH)));
        }

        const bw = Math.max(1, Math.round(cropW * scale));
        const bh = Math.max(1, Math.round(cropH * scale));
        this.ensureCropBuffer(bw, bh);

        const decodedVer = this.tileLoader.getDecodedVersion ? this.tileLoader.getDecodedVersion() : 0;
        const rayKey = `${activeLayerId}|${targetZ}|${bw}x${bh}|${sx0},${sy0}|${rotLat.toFixed(4)}|${rotLon.toFixed(4)}|${clampedZoom.toFixed(4)}|${pitch.toFixed(2)}|${yaw.toFixed(2)}|${reliefScale}|${fastMode ? 1 : 0}|${decodedVer}`;

        if (rayKey === this.lastRayKey && this.lastRayOk) {
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = fastMode ? "medium" : (highQualityGlobeRay ? "high" : "medium");
          ctx.drawImage(this.cropCanvas, sx0, sy0, cropW, cropH);
          ctx.restore();
          renderedRay = true;
        } else {
          const ok = this.raycastSphereCrop(
            activeLayerId, targetZ, bw, bh, sx0, sy0, cx, cy, radius,
            scale, rotLat, rotLon, clampedZoom, false, pitch, yaw, reliefScale, fastMode
          );
          if (ok) {
            this.cropCtx.putImageData(this.cropImgData, 0, 0);
            this.lastRayKey = rayKey;
            this.lastRayOk = true;
            ctx.save();
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = fastMode ? "medium" : (highQualityGlobeRay ? "high" : "medium");
            ctx.drawImage(this.cropCanvas, sx0, sy0, cropW, cropH);
            ctx.restore();
            renderedRay = true;
          }
        }
      }

      if (!renderedRay) {
        this.drawFallbackShadedSphere(
          ctx, cx, sphereCy, radius, rotLat, rotLon, activeLayerId,
          width, height, targetZ, fastMode, clampedZoom, pitch, yaw, reliefScale
        );
      }

      ctx.save();
      if (limbVisible) {
        ctx.strokeStyle = "rgba(244, 145, 92, 0.72)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, sphereCy, limbRadius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 2. Vektor katmanlari icin on-hesaplanmis hizli 3D projeksiyon fonksiyonu
      const pxPerDeg = radius / 57.2958;
      const degToRad = Math.PI / 180;
      const phi0 = rotLat * degToRad;
      const lam0 = rotLon * degToRad;
      const cosP0 = Math.cos(phi0), sinP0 = Math.sin(phi0);
      const yawRad = yaw * degToRad;
      const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);

      const project3D = (lat, lon) => {
        const elevM = (topo && reliefScale > 0) ? topo.getElevationMeters(lat, lon) : 0;
        const rPt = 1.0 + elevM * radFactor;
        const phi = lat * degToRad;
        const dLam = lon * degToRad - lam0;
        const cosPhi = Math.cos(phi);
        const east = rPt * cosPhi * Math.sin(dLam);
        const y0 = rPt * Math.sin(phi);
        const z0 = rPt * cosPhi * Math.cos(dLam);

        const north = y0 * cosP0 - z0 * sinP0;
        const up = y0 * sinP0 + z0 * cosP0;
        const nx = east * cosY - north * sinY;
        const ry = east * sinY + north * cosY;
        const du = up - rCenter;
        const ny = ry * cosP + du * sinP;
        const camDepth = (-ry * sinP + du * cosP) / Math.max(0.5, rPt);

        return {
          x: cx + nx * radius,
          y: cy - ny * radius,
          z: camDepth,
          visible: camDepth > -0.15 && up > -0.35,
          pxPerDeg
        };
      };

      if (showGraticule) this.drawGraticule3D(ctx, project3D);
      this.overlays.drawGlobalHazards(ctx, "3d", project3D, hazardBundle, clampedZoom, width, height);
      if (showNomenclature) this.drawNomenclature3D(ctx, project3D);

      if (computedRoutes && computedRoutes.scope === "global") {
        this.routeRenderer.drawGlobalDualRoutes(ctx, project3D, computedRoutes, showRouteComments, width, height);
      }

      const hitTargets = this.overlays.drawMarkers(ctx, project3D, craters, landingSites, activeCrater?.id);
      if (routeScope === "global" || (computedRoutes && computedRoutes.scope === "global")) {
        this.overlays.drawCustomEndpoints(ctx, project3D, customOrigin, customDestination);
      }
      ctx.restore();
      return hitTargets;
    }

    /**
     * Gorunur ekran kesiti uzerinde 3D MOLA topografik yukseltme + 3D kamera egimi (Pitch/Yaw) isin izleme motoru.
     * MOLA egim ve paralaks hesabi 4x4 blok koselerinde yapilarak piksel basina 16x hizlanma saglanir.
     */
    raycastSphereCrop(layerId, targetZ, bw, bh, sx0, sy0, cx, cy, radius, scale, rotLat, rotLon, zoom, exactAll, camPitch = 0, camYaw = 0, reliefScale = 1.0, fastMode = false) {
      const levels = this.tileLoader.getLayerFastTables(layerId);
      const out = this.cropImgData.data;
      const out32 = this.cropBuf32;
      const topo = ns.marsTopo;
      const elevGrid = (topo && reliefScale > 0) ? topo.elevGrid : null;
      const normXGrid = (topo && reliefScale > 0) ? topo.normXGrid : null;
      const normYGrid = (topo && reliefScale > 0) ? topo.normYGrid : null;
      const radFactor = (topo && reliefScale > 0) ? topo.getRadialScaleFactor(zoom, camPitch, reliefScale) : 0;
      const centerElevM = (topo && reliefScale > 0) ? topo.getElevationMeters(rotLat, rotLon) : 0;
      const rCenter = 1.0 + centerElevM * radFactor;
      const rMaxLimb = 1.0 + 21500 * radFactor;
      const rMaxLimbSq = rMaxLimb * rMaxLimb;

      const phi0 = (rotLat * Math.PI) / 180;
      const lam0 = (rotLon * Math.PI) / 180;
      const sinP0 = Math.sin(phi0), cosP0 = Math.cos(phi0);
      const pitchRad = (Math.max(0, Math.min(72, camPitch || 0)) * Math.PI) / 180;
      const yawRad = ((camYaw || 0) * Math.PI) / 180;
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
      const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
      const B = rCenter * cosP;
      const invTwoPi = 1 / (Math.PI * 2), invPi = 1 / Math.PI, halfPi = Math.PI * 0.5;

      const invScale = 1 / scale, invRadius = 1 / radius;
      const step = invScale * invRadius;
      const nxBase = (sx0 + 0.5 * invScale - cx) * invRadius;
      const nyBase = (cy - (sy0 + 0.5 * invScale)) * invRadius;
      const minLight = Math.min(0.68, Math.max(0.38, 0.38 + (zoom - 1.0) * 0.10));
      const shadeBoost = Math.min(0.68, 0.32 + Math.abs(camPitch) * 0.0045) * Math.min(2.0, reliefScale || 1);
      const parallaxU = sinY * sinP * radFactor * 0.22;
      const parallaxV = cosY * sinP * radFactor * 0.22;

      let lastZ = -1, lastTx = -1, lastTy = -1, lastPixels = null;

      // Karo piksel erisimi: Surukleme veya z>=3 icin asla senkron getImageData ile ana thread'i bloklama!
      const resolveTilePixels = (rec) => {
        if (rec.pixels) return rec.pixels;
        if (rec.tainted) return null;
        if (!fastMode && rec.z <= 2) {
          return this.tileLoader.extractTilePixels(rec);
        }
        this.tileLoader.enqueueDecode?.(rec, rec.z <= 2);
        return null;
      };

      const sampleAtUV = (uIn, vIn, diff, limb, pIdx) => {
        let cu = uIn - Math.floor(uIn); if (cu < 0) cu += 1;
        const cv = vIn <= 0 ? 0 : vIn >= 0.999999 ? 0.999999 : vIn;

        let pixels = null, gx = 0, gy = 0, tx = 0, ty = 0;
        for (let z = targetZ; z >= 0; z--) {
          const cols = 1 << (z + 1), rows = 1 << z;
          gx = cu * cols; gy = cv * rows;
          tx = gx | 0; if (tx >= cols) tx = cols - 1;
          ty = gy | 0; if (ty >= rows) ty = rows - 1;
          if (z === lastZ && tx === lastTx && ty === lastTy && lastPixels) { pixels = lastPixels; break; }
          const rec = levels[z].get((ty << 12) | tx);
          if (!rec || rec.status !== "ready") continue;
          const p = resolveTilePixels(rec);
          if (!p) { if (rec.tainted) return false; continue; }
          lastZ = z; lastTx = tx; lastTy = ty; lastPixels = p; pixels = p;
          break;
        }

        if (!pixels) {
          if (out32) out32[pIdx] = 0xff141823;
          else { const o = pIdx << 2; out[o] = 35; out[o + 1] = 24; out[o + 2] = 20; out[o + 3] = 255; }
          return true;
        }

        const fx = (gx - tx) * 255.0, fy = (gy - ty) * 255.0;
        const px0 = fx | 0, py0 = fy | 0;

        if (fastMode) {
          const i00 = ((py0 << 8) + px0) << 2;
          const rTex = pixels[i00] * diff + limb * 140;
          const gTex = pixels[i00 + 1] * diff + limb * 66;
          const bTex = pixels[i00 + 2] * diff + limb * 32;
          const ri = rTex >= 255 ? 255 : (rTex | 0), gi = gTex >= 255 ? 255 : (gTex | 0), bi = bTex >= 255 ? 255 : (bTex | 0);
          if (out32) out32[pIdx] = 0xff000000 | (bi << 16) | (gi << 8) | ri;
          else { const o = pIdx << 2; out[o] = ri; out[o + 1] = gi; out[o + 2] = bi; out[o + 3] = 255; }
          return true;
        }

        const px1 = px0 < 255 ? px0 + 1 : 255, py1 = py0 < 255 ? py0 + 1 : 255;
        const dx = fx - px0, dy = fy - py0, odx = 1 - dx, ody = 1 - dy;
        const w00 = odx * ody, w10 = dx * ody, w01 = odx * dy, w11 = dx * dy;
        const i00 = ((py0 << 8) + px0) << 2, i10 = ((py0 << 8) + px1) << 2;
        const i01 = ((py1 << 8) + px0) << 2, i11 = ((py1 << 8) + px1) << 2;

        const rTex = (pixels[i00] * w00 + pixels[i10] * w10 + pixels[i01] * w01 + pixels[i11] * w11) * diff + limb * 140;
        const gTex = (pixels[i00 + 1] * w00 + pixels[i10 + 1] * w10 + pixels[i01 + 1] * w01 + pixels[i11 + 1] * w11) * diff + limb * 66;
        const bTex = (pixels[i00 + 2] * w00 + pixels[i10 + 2] * w10 + pixels[i01 + 2] * w01 + pixels[i11 + 2] * w11) * diff + limb * 32;
        const ri = rTex >= 255 ? 255 : (rTex | 0), gi = gTex >= 255 ? 255 : (gTex | 0), bi = bTex >= 255 ? 255 : (bTex | 0);
        if (out32) out32[pIdx] = 0xff000000 | (bi << 16) | (gi << 8) | ri;
        else { const o = pIdx << 2; out[o] = ri; out[o + 1] = gi; out[o + 2] = bi; out[o + 3] = 255; }
        return true;
      };

      const evalRay = (nx, ny) => {
        const A = rCenter * sinP + ny;
        const rhoSq = nx * nx + A * A;
        if (rhoSq >= rMaxLimbSq) return { hit: false, r2: rhoSq, nx, ny, vy: 1 };

        let rSurf = rhoSq < rCenter * rCenter ? rCenter : rMaxLimb;
        let u = 0, v = 0, vy = 0, up = 0, hSurf = 0;
        const passes = (!fastMode && elevGrid && (rhoSq > 0.78 || camPitch > 12)) ? 2 : 1;

        for (let it = 0; it < passes; it++) {
          const disc = rSurf * rSurf - rhoSq;
          if (disc < 0) return { hit: false, r2: rhoSq, nx, ny, vy: 1 };
          const t = Math.sqrt(disc) - B;
          const ry = ny * cosP - t * sinP;
          up = rCenter + ny * sinP + t * cosP;
          if (up <= 0.005) return { hit: false, r2: rhoSq, nx, ny, vy: 1 };

          const east = nx * cosY + ry * sinY;
          const north = -nx * sinY + ry * cosY;
          const y0 = north * cosP0 + up * sinP0;
          const z0 = -north * sinP0 + up * cosP0;
          const normSq = east * east + y0 * y0 + z0 * z0;
          const invNorm = normSq > 0 ? 1 / Math.sqrt(normSq) : 1;
          vy = y0 * invNorm;
          if (vy > 1) vy = 1; else if (vy < -1) vy = -1;
          const lat = Math.asin(vy);
          const lon = lam0 + Math.atan2(east, z0);
          u = (lon + Math.PI) * invTwoPi;
          v = (halfPi - lat) * invPi;
          if (elevGrid) {
            let cu0 = u - Math.floor(u); if (cu0 < 0) cu0 += 1;
            const cv0 = v <= 0 ? 0 : v >= 0.99999 ? 0.99999 : v;
            hSurf = elevGrid[(((cv0 * 511) | 0) << 10) | ((cu0 * 1024) & 1023)];
            rSurf = 1.0 + hSurf * radFactor;
          }
        }
        if (rhoSq > rSurf * rSurf) return { hit: false, r2: rhoSq, nx, ny, vy: 1 };
        const nzNorm = Math.min(1, up / rSurf);
        let diff = Math.max(minLight, -0.34 * nx + 0.26 * ny + 0.90 * nzNorm);
        const om = 1.0 - nzNorm;
        const limb = nzNorm < 0.62 ? om * om * om : 0;

        if (elevGrid) {
          u -= hSurf * parallaxU;
          v += hSurf * parallaxV;
          if (v < 0) v = 0; else if (v > 0.99999) v = 0.99999;
          let cu = u - Math.floor(u); if (cu < 0) cu += 1;
          const idx = (((v * 511) | 0) << 10) | ((cu * 1024) & 1023);
          const sx = normXGrid[idx] * 0.007874;
          const sy = normYGrid[idx] * 0.007874;
          const slopeLight = (-0.46 * sx + 0.38 * sy) * shadeBoost + elevGrid[idx] * 0.0000045;
          diff = Math.max(0.22, Math.min(1.42, diff + slopeLight));
        }

        return { hit: true, r2: rhoSq / (rSurf * rSurf), nx, ny, vy, u, v, diff, limb };
      };

      const renderPixelExact = (bx, by, pIdx) => {
        const res = evalRay(nxBase + bx * step, nyBase - by * step);
        if (!res.hit) {
          if (out32) out32[pIdx] = 0; else out[(pIdx << 2) + 3] = 0;
          return true;
        }
        return sampleAtUV(res.u, res.v, res.diff, res.limb, pIdx);
      };

      const evalCorner = (bx, by) => {
        const res = evalRay(nxBase + bx * step, nyBase - by * step);
        if (!res.hit || res.r2 >= 0.90 || Math.abs(res.vy) >= 0.96) return res;
        res.u = res.u - Math.floor(res.u);
        if (res.u < 0) res.u += 1;
        return res;
      };

      const findUniformTile = (uMin, uMax, vMin, vMax) => {
        if (uMin < 0 || uMax >= 0.999999 || vMin < 0 || vMax >= 0.999999) return null;
        const topCols = 1 << (targetZ + 1), topRows = 1 << targetZ;
        if (((uMin * topCols) | 0) !== ((uMax * topCols) | 0)) return null;
        if (((vMin * topRows) | 0) !== ((vMax * topRows) | 0)) return null;

        for (let z = targetZ; z >= 0; z--) {
          const cols = 1 << (z + 1), rows = 1 << z;
          const tx = (uMin * cols) | 0, ty = (vMin * rows) | 0;
          if (z === lastZ && tx === lastTx && ty === lastTy && lastPixels) {
            return { pixels: lastPixels, cols, rows, tx, ty };
          }
          const rec = levels[z].get((ty << 12) | tx);
          if (!rec || rec.status !== "ready") continue;
          const p = resolveTilePixels(rec);
          if (!p) { if (rec.tainted) return { tainted: true }; continue; }
          lastZ = z; lastTx = tx; lastTy = ty; lastPixels = p;
          return { pixels: p, cols, rows, tx, ty };
        }
        return null;
      };

      for (let by0 = 0; by0 < bh; by0 += 4) {
        const blockH = by0 + 4 <= bh ? 4 : bh - by0;
        for (let bx0 = 0; bx0 < bw; bx0 += 4) {
          const blockW = bx0 + 4 <= bw ? 4 : bw - bx0;

          if (!exactAll && blockW === 4 && blockH === 4) {
            const c00 = evalCorner(bx0, by0);
            const c10 = evalCorner(bx0 + 4, by0);
            const c01 = evalCorner(bx0, by0 + 4);
            const c11 = evalCorner(bx0 + 4, by0 + 4);

            if (!c00.hit && !c10.hit && !c01.hit && !c11.hit &&
                c00.r2 >= rMaxLimbSq && c10.r2 >= rMaxLimbSq && c01.r2 >= rMaxLimbSq && c11.r2 >= rMaxLimbSq &&
                c00.nx * c10.nx > 0 && c00.ny * c01.ny > 0) {
              if (out32) {
                for (let dy = 0; dy < 4; dy++) {
                  const rowOff = (by0 + dy) * bw + bx0;
                  out32[rowOff] = 0; out32[rowOff + 1] = 0; out32[rowOff + 2] = 0; out32[rowOff + 3] = 0;
                }
              } else {
                for (let dy = 0; dy < 4; dy++) {
                  const rowOff = ((by0 + dy) * bw + bx0) << 2;
                  out[rowOff + 3] = 0; out[rowOff + 7] = 0; out[rowOff + 11] = 0; out[rowOff + 15] = 0;
                }
              }
              continue;
            }

            if (c00.hit && c10.hit && c01.hit && c11.hit &&
                c00.r2 < 0.90 && c10.r2 < 0.90 && c01.r2 < 0.90 && c11.r2 < 0.90 &&
                Math.abs(c00.vy) < 0.96 && Math.abs(c10.vy) < 0.96 &&
                Math.abs(c01.vy) < 0.96 && Math.abs(c11.vy) < 0.96) {
              const u00 = c00.u;
              let u10 = c10.u, u01 = c01.u, u11 = c11.u;
              if (u10 - u00 > 0.5) u10 -= 1; else if (u00 - u10 > 0.5) u10 += 1;
              if (u01 - u00 > 0.5) u01 -= 1; else if (u00 - u01 > 0.5) u01 += 1;
              if (u11 - u00 > 0.5) u11 -= 1; else if (u00 - u11 > 0.5) u11 += 1;

              const uMin = Math.min(u00, u10, u01, u11);
              const uMax = Math.max(u00, u10, u01, u11);
              const vMin = Math.min(c00.v, c10.v, c01.v, c11.v);
              const vMax = Math.max(c00.v, c10.v, c01.v, c11.v);
              const uniform = findUniformTile(uMin, uMax, vMin, vMax);
              if (uniform) {
                if (uniform.tainted) return false;
                const { pixels, cols, rows, tx: txOff, ty: tyOff } = uniform;
                const doLimb = c00.limb > 0 || c10.limb > 0 || c01.limb > 0 || c11.limb > 0;

                if (fastMode) {
                  for (let dy = 0; dy < 4; dy++) {
                    const ty = dy * 0.25, oty = 1 - ty;
                    const uL = u00 * oty + u01 * ty, uR = u10 * oty + u11 * ty;
                    const vL = c00.v * oty + c01.v * ty, vR = c10.v * oty + c11.v * ty;
                    const dL = c00.diff * oty + c01.diff * ty, dR = c10.diff * oty + c11.diff * ty;
                    const lL = doLimb ? (c00.limb * oty + c01.limb * ty) : 0;
                    const lR = doLimb ? (c10.limb * oty + c11.limb * ty) : 0;
                    const rowPix = (by0 + dy) * bw + bx0;

                    for (let dx = 0; dx < 4; dx++) {
                      const t = dx * 0.25, ot = 1 - t;
                      const u = uL * ot + uR * t;
                      const v = vL * ot + vR * t;
                      const diff = dL * ot + dR * t;
                      let px0 = ((u * cols - txOff) * 255.0) | 0;
                      let py0 = ((v * rows - tyOff) * 255.0) | 0;
                      if (px0 < 0) px0 = 0; else if (px0 > 255) px0 = 255;
                      if (py0 < 0) py0 = 0; else if (py0 > 255) py0 = 255;

                      const i00 = ((py0 << 8) + px0) << 2;
                      let r = pixels[i00] * diff;
                      let g = pixels[i00 + 1] * diff;
                      let b = pixels[i00 + 2] * diff;
                      if (doLimb) {
                        const limb = lL * ot + lR * t;
                        r += limb * 140; g += limb * 66; b += limb * 32;
                      }
                      const ri = r >= 255 ? 255 : (r | 0), gi = g >= 255 ? 255 : (g | 0), bi = b >= 255 ? 255 : (b | 0);
                      if (out32) out32[rowPix + dx] = 0xff000000 | (bi << 16) | (gi << 8) | ri;
                      else { const o = (rowPix + dx) << 2; out[o] = ri; out[o + 1] = gi; out[o + 2] = bi; out[o + 3] = 255; }
                    }
                  }
                  continue;
                }

                for (let dy = 0; dy < 4; dy++) {
                  const ty = dy * 0.25, oty = 1 - ty;
                  const uL = u00 * oty + u01 * ty, uR = u10 * oty + u11 * ty;
                  const vL = c00.v * oty + c01.v * ty, vR = c10.v * oty + c11.v * ty;
                  const dL = c00.diff * oty + c01.diff * ty, dR = c10.diff * oty + c11.diff * ty;
                  const lL = doLimb ? (c00.limb * oty + c01.limb * ty) : 0;
                  const lR = doLimb ? (c10.limb * oty + c11.limb * ty) : 0;
                  const rowPix = (by0 + dy) * bw + bx0;

                  for (let dx = 0; dx < 4; dx++) {
                    const t = dx * 0.25, ot = 1 - t;
                    const u = uL * ot + uR * t;
                    const v = vL * ot + vR * t;
                    const diff = dL * ot + dR * t;
                    const fx = (u * cols - txOff) * 255.0;
                    const fy = (v * rows - tyOff) * 255.0;
                    const px0 = fx <= 0 ? 0 : fx >= 255 ? 255 : (fx | 0);
                    const py0 = fy <= 0 ? 0 : fy >= 255 ? 255 : (fy | 0);
                    const px1 = px0 < 255 ? px0 + 1 : 255, py1 = py0 < 255 ? py0 + 1 : 255;
                    const fdx = fx <= px0 ? 0 : fx >= px1 ? 1 : fx - px0;
                    const fdy = fy <= py0 ? 0 : fy >= py1 ? 1 : fy - py0;
                    const odx = 1 - fdx, ody = 1 - fdy;
                    const w00 = odx * ody, w10 = fdx * ody, w01 = odx * fdy, w11 = fdx * fdy;

                    const i00 = ((py0 << 8) + px0) << 2, i10 = ((py0 << 8) + px1) << 2;
                    const i01 = ((py1 << 8) + px0) << 2, i11 = ((py1 << 8) + px1) << 2;
                    let r = (pixels[i00] * w00 + pixels[i10] * w10 + pixels[i01] * w01 + pixels[i11] * w11) * diff;
                    let g = (pixels[i00 + 1] * w00 + pixels[i10 + 1] * w10 + pixels[i01 + 1] * w01 + pixels[i11 + 1] * w11) * diff;
                    let b = (pixels[i00 + 2] * w00 + pixels[i10 + 2] * w10 + pixels[i01 + 2] * w01 + pixels[i11 + 2] * w11) * diff;
                    if (doLimb) {
                      const limb = lL * ot + lR * t;
                      r += limb * 140; g += limb * 66; b += limb * 32;
                    }
                    const ri = r >= 255 ? 255 : (r | 0), gi = g >= 255 ? 255 : (g | 0), bi = b >= 255 ? 255 : (b | 0);
                    if (out32) out32[rowPix + dx] = 0xff000000 | (bi << 16) | (gi << 8) | ri;
                    else { const o = (rowPix + dx) << 2; out[o] = ri; out[o + 1] = gi; out[o + 2] = bi; out[o + 3] = 255; }
                  }
                }
                continue;
              }

              for (let dy = 0; dy < 4; dy++) {
                const ty = dy * 0.25, oty = 1 - ty;
                const uL = u00 * oty + u01 * ty, uR = u10 * oty + u11 * ty;
                const vL = c00.v * oty + c01.v * ty, vR = c10.v * oty + c11.v * ty;
                const dL = c00.diff * oty + c01.diff * ty, dR = c10.diff * oty + c11.diff * ty;
                const lL = c00.limb * oty + c01.limb * ty, lR = c10.limb * oty + c11.limb * ty;
                const rowOff = (by0 + dy) * bw + bx0;

                for (let dx = 0; dx < 4; dx++) {
                  const tx = dx * 0.25, otx = 1 - tx;
                  const ok = sampleAtUV(uL * otx + uR * tx, vL * otx + vR * tx, dL * otx + dR * tx, lL * otx + lR * tx, rowOff + dx);
                  if (!ok) return false;
                }
              }
              continue;
            }
          }

          for (let dy = 0; dy < blockH; dy++) {
            const by = by0 + dy, rowOff = by * bw;
            for (let dx = 0; dx < blockW; dx++) {
              if (!renderPixelExact(bx0 + dx, by, rowOff + bx0 + dx)) return false;
            }
          }
        }
      }
      return true;
    }

    /**
     * file:// protokolunde tarayici getImageData kilidi varsa hazir z=0..targetZ karolariyla
     * kuresel afin projeksiyonlu ve dikissiz 3D dokuyu dogrudan drawImage uzerinden cizer
     */
    drawFallbackShadedSphere(ctx, cx, cy, radius, rotLat = 0, rotLon = 0, activeLayerId = "", viewW = 1440, viewH = 900, targetZ = 2, isInteracting = false, zoom = 1, camPitch = 0, camYaw = 0, reliefScale = 1) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
      ctx.clip();

      const baseGrad = ctx.createRadialGradient(
        cx - radius * 0.34, cy - radius * 0.28, radius * 0.08,
        cx, cy, radius * 1.05
      );
      baseGrad.addColorStop(0.0, "#b85c38");
      baseGrad.addColorStop(0.55, "#7d311c");
      baseGrad.addColorStop(1.0, "#240d08");
      ctx.fillStyle = baseGrad;
      ctx.fillRect(0, 0, viewW, viewH);

      if (this.tileLoader.hasAnyReadyTile(activeLayerId)) {
        const xStart = Math.max(0, Math.floor(cx - radius - 2));
        const yStart = Math.max(0, Math.floor(cy - radius - 2));
        const xEnd = Math.min(viewW, Math.ceil(cx + radius + 2));
        const yEnd = Math.min(viewH, Math.ceil(cy + radius + 2));
        const spanW = xEnd - xStart;
        const spanH = yEnd - yStart;

        if (spanW > 0 && spanH > 0) {
          const colsGrid = isInteracting ? 22 : 34;
          const rowsGrid = isInteracting ? 18 : 28;
          const cw = Math.max(16, Math.ceil(spanW / colsGrid));
          const ch = Math.max(16, Math.ceil(spanH / rowsGrid));
          const invR = 1 / radius;
          const phi0 = (rotLat * Math.PI) / 180, lam0 = (rotLon * Math.PI) / 180;
          const sinP0 = Math.sin(phi0), cosP0 = Math.cos(phi0);
          const invTwoPi = 1 / (Math.PI * 2), invPi = 1 / Math.PI, halfPi = Math.PI * 0.5;
          const rSqMax = radius * radius * 1.08;
          const maxZ = Math.max(0, targetZ | 0);
          const topCols = 1 << (maxZ + 1), topRows = 1 << maxZ;

          const uvAt = (sx, sy) => {
            if (ns.marsTopo) {
              const hit = ns.marsTopo.screenToElevatedMars3D(sx, sy, viewW, viewH, rotLat, rotLon, zoom, camPitch, camYaw, reliefScale);
              if (hit.insideMap) {
                let u = (hit.lon + 180) / 360; u -= Math.floor(u);
                const v = Math.max(0, Math.min(0.9999, (90 - hit.lat) / 180));
                return { u, v };
              }
            }
            let nx = (sx - cx) * invR, ny = (cy - sy) * invR;
            let r2 = nx * nx + ny * ny;
            if (r2 > 0.996) { const sc = 0.998 / Math.sqrt(r2); nx *= sc; ny *= sc; r2 = nx * nx + ny * ny; }
            const nz = Math.sqrt(Math.max(0, 1 - r2));
            const vy = Math.max(-1, Math.min(1, ny * cosP0 + nz * sinP0));
            const vz = -ny * sinP0 + nz * cosP0;
            const lat = Math.asin(vy), lon = lam0 + Math.atan2(nx, vz);
            let u = (lon + Math.PI) * invTwoPi; u -= Math.floor(u);
            const v = Math.max(0, Math.min(0.9999, (halfPi - lat) * invPi));
            return { u, v };
          };

          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = isInteracting ? "medium" : "high";

          for (let py = yStart; py < yEnd; py += ch) {
            const cellH = Math.min(ch, yEnd - py);
            for (let px = xStart; px < xEnd; px += cw) {
              const cellW = Math.min(cw, xEnd - px);
              const clX = Math.max(px, Math.min(px + cellW, cx));
              const clY = Math.max(py, Math.min(py + cellH, cy));
              if ((clX - cx) * (clX - cx) + (clY - cy) * (clY - cy) > rSqMax) continue;

              const p00 = uvAt(px, py);
              const p10 = uvAt(px + cellW, py);
              const p01 = uvAt(px, py + cellH);
              const p11 = uvAt(px + cellW, py + cellH);

              const u00 = p00.u;
              let du10 = p10.u - u00; if (du10 > 0.5) du10 -= 1; else if (du10 < -0.5) du10 += 1;
              let du01 = p01.u - u00; if (du01 > 0.5) du01 -= 1; else if (du01 < -0.5) du01 += 1;
              let du11 = p11.u - u00; if (du11 > 0.5) du11 -= 1; else if (du11 < -0.5) du11 += 1;

              const uMin = u00 + Math.min(0, du10, du01, du11);
              const uMax = u00 + Math.max(0, du10, du01, du11);
              const vMin = Math.min(p00.v, p10.v, p01.v, p11.v);
              const vMax = Math.max(p00.v, p10.v, p01.v, p11.v);

              const ax = du10 / cellW;
              const bx = (p10.v - p00.v) / cellW;
              const ay = du01 / cellH;
              const by = (p01.v - p00.v) / cellH;
              const det = ax * by - ay * bx;

              if (Math.abs(det) < 1e-10 || (uMax - uMin) > 0.25) {
                const subW = cellW * 0.25;
                const subH = cellH * 0.25;
                for (let syi = 0; syi < 4; syi++) {
                  for (let sxi = 0; sxi < 4; sxi++) {
                    const pm = uvAt(px + (sxi + 0.5) * subW, py + (syi + 0.5) * subH);
                    for (let z = maxZ; z >= 0; z--) {
                      const cols = 1 << (z + 1);
                      const rows = 1 << z;
                      const tx = Math.min(cols - 1, Math.max(0, (pm.u * cols) | 0));
                      const ty = Math.min(rows - 1, Math.max(0, (pm.v * rows) | 0));
                      const img = this.tileLoader.getTileImage(activeLayerId, z, ty, tx);
                      if (!img) continue;
                      const iw = img.width || 256;
                      const ih = img.height || 256;
                      const sx = Math.max(0, Math.min(iw - 6, (pm.u * cols - tx) * iw - 3));
                      const sy = Math.max(0, Math.min(ih - 6, (pm.v * rows - ty) * ih - 3));
                      ctx.drawImage(img, sx, sy, 6, 6, px + sxi * subW - 0.3, py + syi * subH - 0.3, subW + 0.6, subH + 0.6);
                      break;
                    }
                  }
                }
                continue;
              }

              const invDet = 1 / det;
              const mXu = by * invDet;
              const mXv = -ay * invDet;
              const mYu = -bx * invDet;
              const mYv = ax * invDet;

              const ix0 = Math.floor(uMin * topCols);
              const ix1 = Math.min(ix0 + 3, Math.floor(Math.max(uMin, uMax - 1e-9) * topCols));
              const iy0 = Math.max(0, Math.floor(vMin * topRows));
              const iy1 = Math.min(topRows - 1, Math.min(iy0 + 3, Math.floor(Math.max(vMin, vMax - 1e-9) * topRows)));
              const single = (ix0 === ix1 && iy0 === iy1);
              const seen = single ? null : new Set();

              ctx.save();
              ctx.beginPath();
              ctx.rect(px - 0.5, py - 0.5, cellW + 1.0, cellH + 1.0);
              ctx.clip();

              for (let iy = iy0; iy <= iy1; iy++) {
                for (let ix = ix0; ix <= ix1; ix++) {
                  for (let z = maxZ; z >= 0; z--) {
                    const shift = maxZ - z;
                    const cols = 1 << (z + 1);
                    const rows = 1 << z;
                    const azIx = ix >> shift;
                    const azTy = iy >> shift;
                    if (!single) {
                      const k = `${z}:${azTy}:${azIx}`;
                      if (seen.has(k)) break;
                    }
                    const txWrap = ((azIx % cols) + cols) % cols;
                    const img = this.tileLoader.getTileImage(activeLayerId, z, azTy, txWrap);
                    if (!img) continue;
                    if (!single) seen.add(`${z}:${azTy}:${azIx}`);
                    const tw = img.width || 256;
                    const th = img.height || 256;
                    const dU0 = azIx / cols - u00;
                    const dV0 = azTy / rows - p00.v;
                    if (!single) ctx.save();
                    ctx.transform(
                      mXu / (cols * tw), mYu / (cols * tw),
                      mXv / (rows * th), mYv / (rows * th),
                      px + mXu * dU0 + mXv * dV0,
                      py + mYu * dU0 + mYv * dV0
                    );
                    ctx.drawImage(img, 0, 0);
                    if (!single) ctx.restore();
                    break;
                  }
                }
              }
              ctx.restore();
            }
          }
        }
      }

      if (radius < Math.sqrt(cx * cx + cy * cy) * 1.25) {
        const shade = ctx.createRadialGradient(
          cx - radius * 0.36, cy - radius * 0.28, radius * 0.14,
          cx + radius * 0.08, cy + radius * 0.08, radius * 1.02
        );
        shade.addColorStop(0.0, "rgba(255, 224, 198, 0.12)");
        shade.addColorStop(0.48, "rgba(0, 0, 0, 0)");
        shade.addColorStop(0.84, "rgba(10, 4, 2, 0.42)");
        shade.addColorStop(1.0, "rgba(235, 118, 62, 0.34)");
        ctx.fillStyle = shade;
        ctx.fillRect(0, 0, viewW, viewH);
      }
      ctx.restore();
    }

    drawLoadingSphere(ctx, cx, cy, radius) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#140b09";
      ctx.fill();
      ctx.strokeStyle = "#d92b2b";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 12px 'Public Sans Web', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Mars 3D dokusu ./data/tiles/ dizininden yükleniyor...", cx, cy);
      ctx.restore();
    }

    drawGraticule3D(ctx, project3D) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 0.8;
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        let started = false;
        for (let lon = -180; lon <= 180; lon += 12) {
          const p = project3D(lat, lon);
          if (p.visible) {
            if (!started) { ctx.moveTo(p.x, p.y); started = true; }
            else ctx.lineTo(p.x, p.y);
          } else started = false;
        }
        ctx.stroke();
      }
      for (let lon = -150; lon <= 180; lon += 30) {
        ctx.beginPath();
        let started = false;
        for (let lat = -85; lat <= 85; lat += 12) {
          const p = project3D(lat, lon);
          if (p.visible) {
            if (!started) { ctx.moveTo(p.x, p.y); started = true; }
            else ctx.lineTo(p.x, p.y);
          } else started = false;
        }
        ctx.stroke();
      }
    }

    drawNomenclature3D(ctx, project3D) {
      const places = [
        { name: "▲ OLYMPUS MONS (+21.2 km)", lat: 18.65, lon: -133.8 },
        { name: "▲ ASCRAEUS MONS (+18.2 km)", lat: 11.9, lon: -104.5 },
        { name: "▲ ARSIA MONS (+17.8 km)", lat: -8.3, lon: -120.1 },
        { name: "▲ ELYSIUM MONS (+14.1 km)", lat: 25.0, lon: 147.2 },
        { name: "▼ VALLES MARINERIS (-7.0 km)", lat: -13.9, lon: -59.2 },
        { name: "▼ HELLAS PLANITIA (-7.1 km)", lat: -42.4, lon: 70.5 },
        { name: "SYRTIS MAJOR", lat: 8.4, lon: 69.5 }
      ];
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      ctx.fillStyle = "rgba(255, 245, 235, 0.88)";
      for (const pl of places) {
        const p = project3D(pl.lat, pl.lon);
        if (p.visible && p.z > 0.22) ctx.fillText(pl.name, p.x - 42, p.y);
      }
    }
  }

  ns.Map3DRenderer = Map3DRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-7: JSDoc Google Earth sinifi 60+ FPS 4x4 blok enterpolasyonlu 3D motor tanimi.
   - Satir 13-47: constructor ve ensureCropBuffer; Uint32 tamponu ve kare-onbellek (lastRayKey) degiskenlerini yonetir.
   - Satir 49-236: render; kare-onbellek kontrolu, 3D raycast ve on-hesaplanmis trigonometrili vektor projeksiyonunu calistirir.
   - Satir 238-515: raycastSphereCrop; MOLA topografik kabartmayi 4x4 blok koselerinde hesaplar, suruklemede 1-tap hizli okuma ve duraganda 4-tap bilineer suzme uygular.
   - Satir 517-705: drawFallbackShadedSphere; file:// ortaminda getImageData olmadan z=0..targetZ karolarini 3D topografyayla cizer.
   - Satir 707-768: drawLoadingSphere, drawGraticule3D ve drawNomenclature3D yardimcilari.
   ========================================================================== */
