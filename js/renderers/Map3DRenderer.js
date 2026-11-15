/**
 * @file Map3DRenderer.js
 * @description Google Earth sinifi piksellesmesiz (anti-pixelated) 60+ FPS 3D Kure isin izleme motoru.
 * - MOLA 1024x512 yukseklik ve egim izgarasini 4-tap bilineer enterpolasyonla okuyarak yakinlastirmada bloklasmayi onler.
 * - Hem yakinlastirma/surukleme sirasinda hem duragan modda 4-tap bilineer + Hermite yumusatmali doku suzmesi uygular.
 * - Yuksek ara tampon cozunurlugu ve kare-onbellekli (lastRayKey) blitting ile keskin ve akici goruntu sunar.
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
      this.fallbackRenderer = ns.Map3DFallbackRenderer ? new ns.Map3DFallbackRenderer(tileLoader) : null;
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
      this.overlays.beginLabelFrame(width, height, state.uiAvoidRects || []);
      const cx = width * 0.5;
      const cy = height * 0.5;
      const clampedZoom = Math.min(Math.max(zoom, 0.55), 80.0);
      const radius = Math.min(width, height) * 0.41 * clampedZoom;
      const pitch = Math.max(0, Math.min(72, camPitch ?? 0));
      const yaw = camYaw ?? 0;
      const reliefScale = enable3DTerrain === false ? 0 : (topoReliefScale ?? 1.0);
      const topo = ns.marsTopo;
      if (topo) topo.syncWithMolaTiles(this.tileLoader);
      const radFactor = (topo && reliefScale > 0) ? topo.getRadialScaleFactor(clampedZoom, pitch, reliefScale) : 0;
      const rMaxLimb = 1.0 + 21500 * radFactor;
      const pitchRad = (pitch * Math.PI) / 180;
      const limbRadius = radius * rMaxLimb;
      const limbVisible = limbRadius < Math.hypot(cx, cy) * 1.18;
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
      const pivotZ = Math.max(0, Math.min(1, (clampedZoom - 1.1) / 1.1));
      const sphereCy = cy + pivotZ * sinP * radius;

      // 1. Derin Uzay atmosfer hale katmani ve gezegen kenari yumusak uzay derinligi
      if (limbVisible) {
        const dropShadow = ctx.createRadialGradient(cx + radius * 0.02, sphereCy + radius * 0.03, radius * 0.88, cx + radius * 0.02, sphereCy + radius * 0.03, limbRadius * 1.14);
        dropShadow.addColorStop(0.0, "rgba(225, 108, 52, 0.14)");
        dropShadow.addColorStop(0.65, "rgba(205, 88, 38, 0.06)");
        dropShadow.addColorStop(1.0, "rgba(2, 4, 9, 0)");
        ctx.fillStyle = dropShadow;
        ctx.beginPath();
        ctx.arc(cx + radius * 0.02, sphereCy + radius * 0.03, limbRadius * 1.14, 0, Math.PI * 2);
        ctx.fill();

        const atmo = ctx.createRadialGradient(cx, sphereCy, radius * 0.94, cx, sphereCy, limbRadius * 1.10);
        atmo.addColorStop(0.0, "rgba(235, 128, 70, 0.42)");
        atmo.addColorStop(0.45, "rgba(205, 88, 38, 0.16)");
        atmo.addColorStop(1.0, "rgba(235, 128, 70, 0)");
        ctx.fillStyle = atmo;
        ctx.beginPath();
        ctx.arc(cx, sphereCy, limbRadius * 1.10, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!this.tileLoader.hasAnyReadyTile(activeLayerId)) {
        this.drawLoadingSphere(ctx, cx, sphereCy, Math.min(radius, width * 0.45));
        return [];
      }

      const sx0 = Math.max(0, Math.floor(cx - limbRadius - 4));
      const sy0 = Math.max(0, Math.floor(sphereCy - limbRadius - 6));
      const sx1 = Math.min(width, Math.ceil(cx + limbRadius + 4));
      const sy1 = Math.min(height, Math.ceil(sphereCy + limbRadius + 6));
      const cropW = sx1 - sx0;
      const cropH = sy1 - sy0;

      const devDpr = Math.min(dpr || 1, 2);
      const fastMode = Boolean(isDragging || isInteracting);
      const layer = this.tileLoader.getLayerById(activeLayerId);
      const targetZ = this.tileLoader.computeTargetZoom({
        zoom: clampedZoom, sphereRadiusPx: radius, dpr: devDpr,
        viewMode: "3d", progressiveLodRender: progressiveLodRender !== false
      }, layer);

      const isTainted = this.tileLoader.isAtlasTainted?.(activeLayerId);
      const heatmap = this.overlays.getGlobalHeatmapAtlas(hazardBundle);
      const heatKey = heatmap && heatmap.hasData ? heatmap.key : "noheat";
      let renderedRay = false;

      if (!isTainted && cropW > 0 && cropH > 0) {
        let scale;
        if (fastMode) {
          scale = Math.min(0.84, Math.sqrt(260000 / Math.max(1, cropW * cropH)));
        } else if (highQualityGlobeRay) {
          scale = Math.min(devDpr, Math.sqrt(1650000 / Math.max(1, cropW * cropH)));
        } else {
          scale = Math.min(Math.min(devDpr, 1.35), Math.sqrt(920000 / Math.max(1, cropW * cropH)));
        }

        const bw = Math.max(1, Math.round(cropW * scale));
        const bh = Math.max(1, Math.round(cropH * scale));
        this.ensureCropBuffer(bw, bh);

        const decodedVer = this.tileLoader.getDecodedVersion ? this.tileLoader.getDecodedVersion() : 0;
        const exactAll = Boolean(highQualityGlobeRay) && !fastMode;
        const rayKey = `${activeLayerId}|${targetZ}|${bw}x${bh}|${sx0},${sy0}|${rotLat.toFixed(4)}|${rotLon.toFixed(4)}|${clampedZoom.toFixed(4)}|${pitch.toFixed(2)}|${yaw.toFixed(2)}|${reliefScale}|${fastMode ? 1 : 0}|${exactAll ? 1 : 0}|${decodedVer}|${heatKey}`;

        if (rayKey === this.lastRayKey && this.lastRayOk) {
          ctx.save();
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
          ctx.drawImage(this.cropCanvas, sx0, sy0, cropW, cropH);
          ctx.restore();
          renderedRay = true;
        } else {
          const ok = this.raycastSphereCrop(
            activeLayerId, targetZ, bw, bh, sx0, sy0, cx, cy, radius,
            scale, rotLat, rotLon, clampedZoom, exactAll, pitch, yaw, reliefScale, fastMode, heatmap
          );
          if (ok) {
            this.cropCtx.putImageData(this.cropImgData, 0, 0);
            this.lastRayKey = rayKey; this.lastRayOk = true;
            ctx.save();
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
            ctx.drawImage(this.cropCanvas, sx0, sy0, cropW, cropH);
            ctx.restore();
            renderedRay = true;
          }
        }
      }

      if (!renderedRay) {
        this.drawFallbackShadedSphere(
          ctx, cx, sphereCy, radius, rotLat, rotLon, activeLayerId,
          width, height, targetZ, fastMode, clampedZoom, pitch, yaw, reliefScale, heatmap
        );
      }

      ctx.save();

      // 2. Vektor katmanlari icin Google Earth tipi tam kuresel 3D projeksiyon fonksiyonu
      const pxPerDeg = radius / 57.2958;
      const degToRad = Math.PI / 180;
      const phi0 = rotLat * degToRad, lam0 = rotLon * degToRad;
      const cosP0 = Math.cos(phi0), sinP0 = Math.sin(phi0);
      const yawRad = yaw * degToRad;
      const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);

      const project3D = (lat, lon) => {
        const elevM = (topo && reliefScale > 0) ? topo.getElevationMeters(lat, lon) : 0;
        const dr = elevM * radFactor;
        const rScale = 1.0 + dr;
        const phi = lat * degToRad, dLam = lon * degToRad - lam0;
        const cosPhi = Math.cos(phi);
        const east = cosPhi * Math.sin(dLam);
        const y0 = Math.sin(phi);
        const z0 = cosPhi * Math.cos(dLam);

        const north = y0 * cosP0 - z0 * sinP0;
        const up = y0 * sinP0 + z0 * cosP0;
        const x1 = east * cosY - north * sinY;
        const y1 = east * sinY + north * cosY;
        const dz0 = up * rScale - pivotZ;
        const screenX = x1 * rScale;
        const screenY = y1 * rScale * cosP + dz0 * sinP;
        const depthZ = -y1 * rScale * sinP + dz0 * cosP + pivotZ;

        return {
          x: cx + screenX * radius,
          y: cy - screenY * radius,
          z: depthZ,
          visible: up > 0.04 && depthZ > -0.15,
          pxPerDeg
        };
      };

      if (showGraticule) this.drawGraticule3D(ctx, project3D);

      let pendingComment = null;
      if (computedRoutes && computedRoutes.scope === "global") {
        pendingComment = this.routeRenderer.drawGlobalDualRoutes(
          ctx, project3D, computedRoutes, showRouteComments, width, height, 240, this.overlays, true
        );
        if (state.demoSim && state.demoSim.active) {
          this.routeRenderer.drawDemoSimulation(
            ctx, project3D, computedRoutes, state.demoSim, width, height, 240, this.overlays, false
          );
        }
      }

      if (routeScope === "global" || (computedRoutes && computedRoutes.scope === "global")) {
        if (state.demoSim && state.demoSim.active && typeof state.demoSim.lat === "number") {
          const vp = project3D(state.demoSim.lat, state.demoSim.lon);
          if (vp && vp.visible) this.overlays.reserveRect(vp.x - 18, vp.y - 18, 36, 36);
        }
        this.overlays.drawCustomEndpoints(ctx, project3D, customOrigin, customDestination);
        if (state.demoSim && state.demoSim.active) {
          this.routeRenderer.drawDemoVehicleBadge(ctx, project3D, state.demoSim, width, height, this.overlays);
        }
      }

      const hitTargets = this.overlays.drawMarkers(ctx, project3D, craters, landingSites, activeCrater?.id);
      if (pendingComment) {
        this.routeRenderer.drawDeferredRouteComment(ctx, pendingComment, width, height, this.overlays);
      }
      this.overlays.drawGlobalHazardLabels(ctx, "3d", project3D, hazardBundle, clampedZoom, width, height);
      if (showNomenclature) this.drawNomenclature3D(ctx, project3D);
      ctx.restore();
      return hitTargets;
    }

    /**
     * Gorunur ekran kesiti uzerinde 3D bilineer MOLA topografik kabartma + 4-tap bilineer/Hermite doku + yuzeye yapiskan isi haritasi motoru
     */
    raycastSphereCrop(layerId, targetZ, bw, bh, sx0, sy0, cx, cy, radius, scale, rotLat, rotLon, zoom, exactAll, camPitch = 0, camYaw = 0, reliefScale = 1.0, fastMode = false, heatmap = null) {
      const levels = this.tileLoader.getLayerFastTables(layerId);
      const out = this.cropImgData.data, out32 = this.cropBuf32;
      const hmData = (heatmap && heatmap.hasData) ? heatmap.data : null;
      const hmMask = (heatmap && heatmap.hasData) ? heatmap.mask : null;
      const topo = ns.marsTopo;
      const elevGrid = (topo && reliefScale > 0) ? topo.elevGrid : null;
      const normXGrid = (topo && reliefScale > 0) ? topo.normXGrid : null;
      const normYGrid = (topo && reliefScale > 0) ? topo.normYGrid : null;
      const radFactor = (topo && reliefScale > 0) ? topo.getRadialScaleFactor(zoom, camPitch, reliefScale) : 0;
      const rMaxLimb = 1.0 + 21500 * radFactor;
      const rMaxLimbSq = rMaxLimb * rMaxLimb;

      const phi0 = (rotLat * Math.PI) / 180, lam0 = (rotLon * Math.PI) / 180;
      const sinP0 = Math.sin(phi0), cosP0 = Math.cos(phi0);
      const pitchRad = (Math.max(0, Math.min(72, camPitch || 0)) * Math.PI) / 180;
      const yawRad = ((camYaw || 0) * Math.PI) / 180;
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad), cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
      const pivotZ = Math.max(0, Math.min(1, (zoom - 1.1) / 1.1));
      const invTwoPi = 1 / (Math.PI * 2), invPi = 1 / Math.PI, halfPi = Math.PI * 0.5;

      const invScale = 1 / scale, invRadius = 1 / radius, step = invScale * invRadius;
      const nxBase = (sx0 + 0.5 * invScale - cx) * invRadius;
      const nyBase = (cy - (sy0 + 0.5 * invScale)) * invRadius;
      const minLight = Math.min(0.68, Math.max(0.38, 0.38 + (zoom - 1.0) * 0.10));
      const shadeBoost = Math.min(0.62, 0.30 + Math.abs(camPitch) * 0.004) * Math.min(1.8, reliefScale || 1) / (1 + Math.max(0, zoom - 2.5) * 0.18);
      const parallaxU = sinY * sinP * radFactor * 0.20;
      const parallaxV = cosY * sinP * radFactor * 0.20;
      const useHermite = zoom > 3.2;

      let lastZ = -1, lastTx = -1, lastTy = -1, lastPixels = null;

      // 1024x512 MOLA DEM ve egim izgarasini bilineer enterpolasyonla okuyarak yuksek zoomda bloklasmayi tamamen yok eder
      const sampleTopoBilinear = (uIn, vIn) => {
        let cu = uIn - Math.floor(uIn); if (cu < 0) cu += 1;
        const cv = vIn <= 0 ? 0 : vIn >= 0.99999 ? 0.99999 : vIn;
        const gx = cu * 1024.0, gy = cv * 511.0;
        const x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0;
        const ix0 = x0 & 1023, ix1 = (x0 + 1) & 1023;
        const iy0 = y0 <= 511 ? y0 : 511, iy1 = iy0 < 511 ? iy0 + 1 : 511;
        const r0 = iy0 << 10, r1 = iy1 << 10;
        const i00 = r0 | ix0, i10 = r0 | ix1, i01 = r1 | ix0, i11 = r1 | ix1;
        const ofx = 1 - fx, ofy = 1 - fy;
        const w00 = ofx * ofy, w10 = fx * ofy, w01 = ofx * fy, w11 = fx * fy;
        const h = elevGrid[i00] * w00 + elevGrid[i10] * w10 + elevGrid[i01] * w01 + elevGrid[i11] * w11;
        const sx = (normXGrid[i00] * w00 + normXGrid[i10] * w10 + normXGrid[i01] * w01 + normXGrid[i11] * w11) * 0.007874;
        const sy = (normYGrid[i00] * w00 + normYGrid[i10] * w10 + normYGrid[i01] * w01 + normYGrid[i11] * w11) * 0.007874;
        return { h, sx, sy };
      };

      const resolveTilePixels = (rec) => {
        if (rec.pixels) return rec.pixels;
        if (rec.tainted) return null;
        if (rec.z <= 2) return this.tileLoader.extractTilePixels(rec);
        this.tileLoader.enqueueDecode?.(rec, true);
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
          const gridLine = (Math.abs((cu * (1 << targetZ)) % 1) < 0.02 || Math.abs((cv * (1 << Math.max(0, targetZ - 1))) % 1) < 0.02);
          const scan = (((cv * 360) | 0) & 1) ? 1.0 : 0.92;
          const shade = (0.62 + diff * 0.38) * scan;
          const ri = Math.min(255, ((gridLine ? 235 : 214) * shade) | 0);
          const gi = Math.min(255, ((gridLine ? 198 : 168) * shade) | 0);
          const bi = Math.min(255, ((gridLine ? 180 : 146) * shade) | 0);
          if (out32) out32[pIdx] = 0xff000000 | (bi << 16) | (gi << 8) | ri;
          else { const o = pIdx << 2; out[o] = ri; out[o + 1] = gi; out[o + 2] = bi; out[o + 3] = 255; }
          return true;
        }

        const fx = (gx - tx) * 255.0, fy = (gy - ty) * 255.0;
        const px0 = fx <= 0 ? 0 : fx >= 255 ? 255 : (fx | 0);
        const py0 = fy <= 0 ? 0 : fy >= 255 ? 255 : (fy | 0);
        const px1 = px0 < 255 ? px0 + 1 : 255, py1 = py0 < 255 ? py0 + 1 : 255;
        let dx = fx <= px0 ? 0 : fx >= px1 ? 1 : fx - px0;
        let dy = fy <= py0 ? 0 : fy >= py1 ? 1 : fy - py0;
        if (useHermite) { dx = dx * dx * (3 - 2 * dx); dy = dy * dy * (3 - 2 * dy); }
        const odx = 1 - dx, ody = 1 - dy;
        const w00 = odx * ody, w10 = dx * ody, w01 = odx * dy, w11 = dx * dy;
        const i00 = ((py0 << 8) + px0) << 2, i10 = ((py0 << 8) + px1) << 2;
        const i01 = ((py1 << 8) + px0) << 2, i11 = ((py1 << 8) + px1) << 2;

        let rBase = (pixels[i00] * w00 + pixels[i10] * w10 + pixels[i01] * w01 + pixels[i11] * w11) * diff;
        let gBase = (pixels[i00 + 1] * w00 + pixels[i10 + 1] * w10 + pixels[i01 + 1] * w01 + pixels[i11 + 1] * w11) * diff;
        let bBase = (pixels[i00 + 2] * w00 + pixels[i10 + 2] * w10 + pixels[i01 + 2] * w01 + pixels[i11 + 2] * w11) * diff;
        if (hmData) {
          const hmIdx = ((((cv * 64) | 0) & 63) << 7) | (((cu * 128) | 0) & 127);
          if (hmMask[hmIdx] > 0) {
            const hgx = cu * 1024.0, hgy = cv * 511.0;
            const hx0 = hgx | 0, hy0 = hgy | 0, hfx = hgx - hx0, hfy = hgy - hy0;
            const hix0 = hx0 & 1023, hix1 = (hx0 + 1) & 1023;
            const hiy0 = hy0 <= 511 ? hy0 : 511, hiy1 = hiy0 < 511 ? hiy0 + 1 : 511;
            const hr0 = hiy0 << 10, hr1 = hiy1 << 10;
            const hi00 = (hr0 | hix0) << 2, hi10 = (hr0 | hix1) << 2;
            const hi01 = (hr1 | hix0) << 2, hi11 = (hr1 | hix1) << 2;
            const hofx = 1 - hfx, hofy = 1 - hfy;
            const hw00 = hofx * hofy, hw10 = hfx * hofy, hw01 = hofx * hfy, hw11 = hfx * hfy;
            const ha = (hmData[hi00 + 3] * hw00 + hmData[hi10 + 3] * hw10 + hmData[hi01 + 3] * hw01 + hmData[hi11 + 3] * hw11) * 0.0039215686;
            if (ha > 0.004) {
              const hShade = 0.72 + 0.28 * (diff > 1.15 ? 1.15 : diff);
              const invHa = 1.0 - ha;
              rBase = rBase * invHa + (hmData[hi00] * hw00 + hmData[hi10] * hw10 + hmData[hi01] * hw01 + hmData[hi11] * hw11) * hShade * ha;
              gBase = gBase * invHa + (hmData[hi00 + 1] * hw00 + hmData[hi10 + 1] * hw10 + hmData[hi01 + 1] * hw01 + hmData[hi11 + 1] * hw11) * hShade * ha;
              bBase = bBase * invHa + (hmData[hi00 + 2] * hw00 + hmData[hi10 + 2] * hw10 + hmData[hi01 + 2] * hw01 + hmData[hi11 + 2] * hw11) * hShade * ha;
            }
          }
        }
        const rTex = rBase + limb * 140;
        const gTex = gBase + limb * 66;
        const bTex = bBase + limb * 32;
        const ri = rTex >= 255 ? 255 : (rTex | 0), gi = gTex >= 255 ? 255 : (gTex | 0), bi = bTex >= 255 ? 255 : (bTex | 0);
        if (out32) out32[pIdx] = 0xff000000 | (bi << 16) | (gi << 8) | ri;
        else { const o = pIdx << 2; out[o] = ri; out[o + 1] = gi; out[o + 2] = bi; out[o + 3] = 255; }
        return true;
      };

      const evalRay = (nx, ny) => {
        const nySphere = ny + pivotZ * sinP;
        const baseR2 = nx * nx + nySphere * nySphere;
        if (baseR2 >= rMaxLimbSq) return { hit: false, r2: baseR2, nx, ny, vy: 1 };

        let rSurf = 1.0, u = 0, v = 0, vy = 0, topoSample = null;
        let x1 = 0, y1 = 0, z1 = 1;
        const B = pivotZ * cosP;
        const passes = elevGrid ? 2 : 1;

        for (let it = 0; it < passes; it++) {
          const C = nx * nx + ny * ny + pivotZ * pivotZ + 2 * pivotZ * ny * sinP - rSurf * rSurf;
          let disc = B * B - C;
          if (disc < 0) {
            if (!elevGrid || it > 0) return { hit: false, r2: baseR2, nx, ny, vy: 1 };
            disc = 0;
          }
          const zRot = -B + Math.sqrt(disc);
          const py3 = ny * cosP - zRot * sinP;
          const pz3 = pivotZ + ny * sinP + zRot * cosP;
          const invR = 1.0 / (Math.hypot(nx, py3, pz3) || rSurf);
          x1 = nx * invR; y1 = py3 * invR; z1 = pz3 * invR;

          const east = x1 * cosY + y1 * sinY;
          const north = -x1 * sinY + y1 * cosY;
          const y0 = north * cosP0 + z1 * sinP0;
          const z0 = -north * sinP0 + z1 * cosP0;
          vy = y0 > 1 ? 1 : y0 < -1 ? -1 : y0;
          const lat = Math.asin(vy);
          const lon = lam0 + Math.atan2(east, z0);
          u = (lon + Math.PI) * invTwoPi;
          v = (halfPi - lat) * invPi;
          if (elevGrid) {
            topoSample = sampleTopoBilinear(u, v);
            rSurf = 1.0 + topoSample.h * radFactor;
          }
        }
        const Cfin = nx * nx + ny * ny + pivotZ * pivotZ + 2 * pivotZ * ny * sinP - rSurf * rSurf;
        const discFin = B * B - Cfin;
        if (discFin < 0) return { hit: false, r2: baseR2, nx, ny, vy: 1 };

        const nzNorm = Math.min(1, Math.max(0.02, Math.sqrt(discFin) / rSurf));
        let diff = Math.max(minLight, -0.34 * nx + 0.26 * nySphere + 0.90 * nzNorm);
        const om = 1.0 - nzNorm;
        const limb = nzNorm < 0.62 ? om * om * om : 0;

        if (topoSample) {
          u -= topoSample.h * parallaxU;
          v += topoSample.h * parallaxV;
          if (v < 0) v = 0; else if (v > 0.99999) v = 0.99999;
          const slopeLight = (-0.46 * topoSample.sx + 0.38 * topoSample.sy) * shadeBoost + topoSample.h * 0.0000045;
          diff = Math.max(0.22, Math.min(1.42, diff + slopeLight));
        }

        return { hit: true, r2: 1 - nzNorm * nzNorm, nx, ny, vy, u, v, diff, limb };
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
                let blockHasHeat = false;
                if (hmMask) {
                  let mu0 = uMin - Math.floor(uMin); if (mu0 < 0) mu0 += 1;
                  let mu1 = uMax - Math.floor(uMax); if (mu1 < 0) mu1 += 1;
                  const bx0m = ((mu0 * 128) | 0) & 127, bx1m = ((mu1 * 128) | 0) & 127;
                  const by0m = ((vMin * 64) | 0) & 63, by1m = ((vMax * 64) | 0) & 63;
                  blockHasHeat = (hmMask[(by0m << 7) | bx0m] | hmMask[(by0m << 7) | bx1m] | hmMask[(by1m << 7) | bx0m] | hmMask[(by1m << 7) | bx1m]) > 0;
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
                    let fdx = fx <= px0 ? 0 : fx >= px1 ? 1 : fx - px0;
                    let fdy = fy <= py0 ? 0 : fy >= py1 ? 1 : fy - py0;
                    if (useHermite) {
                      fdx = fdx * fdx * (3 - 2 * fdx);
                      fdy = fdy * fdy * (3 - 2 * fdy);
                    }
                    const odx = 1 - fdx, ody = 1 - fdy;
                    const w00 = odx * ody, w10 = fdx * ody, w01 = odx * fdy, w11 = fdx * fdy;

                    const i00 = ((py0 << 8) + px0) << 2, i10 = ((py0 << 8) + px1) << 2;
                    const i01 = ((py1 << 8) + px0) << 2, i11 = ((py1 << 8) + px1) << 2;
                    let r = (pixels[i00] * w00 + pixels[i10] * w10 + pixels[i01] * w01 + pixels[i11] * w11) * diff;
                    let g = (pixels[i00 + 1] * w00 + pixels[i10 + 1] * w10 + pixels[i01 + 1] * w01 + pixels[i11 + 1] * w11) * diff;
                    let b = (pixels[i00 + 2] * w00 + pixels[i10 + 2] * w10 + pixels[i01 + 2] * w01 + pixels[i11 + 2] * w11) * diff;
                    if (blockHasHeat) {
                      let hu = u - Math.floor(u); if (hu < 0) hu += 1;
                      const hgx = hu * 1024.0, hgy = (v <= 0 ? 0 : v >= 0.999999 ? 0.999999 : v) * 511.0;
                      const hx0 = hgx | 0, hy0 = hgy | 0, hfx = hgx - hx0, hfy = hgy - hy0;
                      const hix0 = hx0 & 1023, hix1 = (hx0 + 1) & 1023;
                      const hiy0 = hy0 <= 511 ? hy0 : 511, hiy1 = hiy0 < 511 ? hiy0 + 1 : 511;
                      const hr0 = hiy0 << 10, hr1 = hiy1 << 10;
                      const hi00 = (hr0 | hix0) << 2, hi10 = (hr0 | hix1) << 2;
                      const hi01 = (hr1 | hix0) << 2, hi11 = (hr1 | hix1) << 2;
                      const hofx = 1 - hfx, hofy = 1 - hfy;
                      const hw00 = hofx * hofy, hw10 = hfx * hofy, hw01 = hofx * hfy, hw11 = hfx * hfy;
                      const ha = (hmData[hi00 + 3] * hw00 + hmData[hi10 + 3] * hw10 + hmData[hi01 + 3] * hw01 + hmData[hi11 + 3] * hw11) * 0.0039215686;
                      if (ha > 0.004) {
                        const hShade = 0.72 + 0.28 * (diff > 1.15 ? 1.15 : diff);
                        const invHa = 1.0 - ha;
                        r = r * invHa + (hmData[hi00] * hw00 + hmData[hi10] * hw10 + hmData[hi01] * hw01 + hmData[hi11] * hw11) * hShade * ha;
                        g = g * invHa + (hmData[hi00 + 1] * hw00 + hmData[hi10 + 1] * hw10 + hmData[hi01 + 1] * hw01 + hmData[hi11 + 1] * hw11) * hShade * ha;
                        b = b * invHa + (hmData[hi00 + 2] * hw00 + hmData[hi10 + 2] * hw10 + hmData[hi01 + 2] * hw01 + hmData[hi11 + 2] * hw11) * hShade * ha;
                      }
                    }
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
     * file:// veya tainted tuval ortamlarinda 3D yedek kure cizimini ayri moduldaki Map3DFallbackRenderer'a devreder
     */
    drawFallbackShadedSphere(ctx, cx, cy, radius, rotLat = 0, rotLon = 0, activeLayerId = "", viewW = 1440, viewH = 900, targetZ = 2, isInteracting = false, zoom = 1, camPitch = 0, camYaw = 0, reliefScale = 1, heatmap = null) {
      if (!this.fallbackRenderer) { this.drawLoadingSphere(ctx, cx, cy, radius); return; }
      this.fallbackRenderer.drawFallbackShadedSphere(
        ctx, cx, cy, radius, rotLat, rotLon, activeLayerId,
        viewW, viewH, targetZ, isInteracting, zoom, camPitch, camYaw, reliefScale, heatmap
      );
    }

    drawLoadingSphere(ctx, cx, cy, radius) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#2b3b56";
      ctx.fill();
      ctx.strokeStyle = "rgba(214, 226, 242, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "800 12px 'Public Sans Web', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const loadingMsg = ns.i18n ? ns.i18n.t("loadingGlobeText") : "Mars 3D dokusu ./data/tiles/ dizininden yükleniyor...";
      ctx.fillText(loadingMsg, cx, cy, Math.max(24, radius * 1.72));
      ctx.restore();
    }

    drawGraticule3D(ctx, project3D) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
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
      ctx.save();
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(30, 41, 59, 0.78)";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.fillStyle = "rgba(255, 250, 244, 0.94)";
      for (const pl of places) {
        const p = project3D(pl.lat, pl.lon);
        if (!p.visible || p.z <= 0.25) continue;
        const tw = ctx.measureText(pl.name).width;
        const slot = this.overlays.claimLabelSlot(
          p.x - tw / 2, p.y - 7, tw + 8, 14, [[0, 0], [0, -18], [0, 18]], false
        );
        if (!slot.placed) continue;
        ctx.strokeText(pl.name, slot.x + 4, slot.y + 7);
        ctx.fillText(pl.name, slot.x + 4, slot.y + 7);
      }
      ctx.restore();
    }
  }

  ns.Map3DRenderer = Map3DRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-7: JSDoc piksellesmesiz (anti-pixelated) 60+ FPS 4x4 blok enterpolasyonlu 3D motor tanimi.
   - Satir 13-46: constructor (Map3DFallbackRenderer baslatma dahil) ve ensureCropBuffer; Uint32 tamponu ve kare-onbellek (lastRayKey) degiskenlerini yonetir.
   - Satir 48-246: render; uzay atmosfer halesi, yuksek cozunurluklu ara tampon ve cakismasiz 3D vektor projeksiyonunu calistirir.
   - Satir 248-626: raycastSphereCrop; MOLA topografik kabartmasini bilineer (sampleTopoBilinear), dokuyu 4-tap bilineer/Hermite suzmeyle ve acik kumtasi grid yedeğiyle cizer.
   - Satir 628-637: drawFallbackShadedSphere; file:// / tainted tuval ortamlarinda cizimi Map3DFallbackRenderer modulune devreder.
   - Satir 639-715: drawLoadingSphere (Orbital Titanium Slate), drawGraticule3D ve cakismasiz drawNomenclature3D yardimcilari.
   ========================================================================== */
