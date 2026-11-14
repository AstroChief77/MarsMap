/**
 * @file Map3DRenderer.js
 * @description 3D Kure gorunumu secildiginde data/tiles/ mozaik piksel tamponundan bilineer
 * orneklemeyle gercekci Mars Kuresi, atmosfer limb isimasini ve Mavi/Soluk Mavi rotalari cizen motor.
 */

import { OverlayDrawHelper } from "./OverlayDrawHelper.js";
import { RouteCanvasRenderer } from "./RouteCanvasRenderer.js";

export class Map3DRenderer {
  /**
   * Map3DRenderer yapici metodu
   * @param {MarsTileLoader} tileLoader - Yerel data/tiles karo yukleyici
   */
  constructor(tileLoader) {
    this.tileLoader = tileLoader;
    this.overlays = new OverlayDrawHelper();
    this.routeRenderer = new RouteCanvasRenderer();
    this.idleRes = 360;
    this.dragRes = 240;
    this.highRes = 780;
    this.sphereCanvas = document.createElement("canvas");
    this.sphereCtx = this.sphereCanvas.getContext("2d");
    this.sphereImgData = null;
    this.currentRes = 0;
  }

  ensureBuffer(size) {
    if (this.currentRes === size && this.sphereImgData) return;
    this.currentRes = size;
    this.sphereCanvas.width = size;
    this.sphereCanvas.height = size;
    this.sphereImgData = this.sphereCtx.createImageData(size, size);
  }

  /**
   * 3D Mars Kuresini cizer ve tiklanabilir krater hedeflerini dondurur
   */
  render(ctx, state) {
    const {
      width, height, rotLat, rotLon, zoom, activeLayerId, isDragging,
      craters, landingSites, activeCrater, hazardBundle, computedRoutes,
      showGraticule, showNomenclature, showRouteComments, highQualityGlobeRay
    } = state;

    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.41 * Math.min(Math.max(zoom, 0.55), 3.2);

    // 1. Dis Mars atmosferi kehribar limb isimasi
    const atmo = ctx.createRadialGradient(cx, cy, radius * 0.94, cx, cy, radius * 1.12);
    atmo.addColorStop(0.0, "rgba(235, 128, 70, 0.5)");
    atmo.addColorStop(0.45, "rgba(205, 88, 38, 0.2)");
    atmo.addColorStop(1.0, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = atmo;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
    ctx.fill();

    // 2. Yerel karo mozaiginden doku ornekle
    const atlas = this.tileLoader.getAtlasPixels(activeLayerId);
    if (!atlas) {
      this.drawLoadingSphere(ctx, cx, cy, radius);
      return [];
    }

    const s = isDragging ? this.dragRes : (highQualityGlobeRay ? this.highRes : this.idleRes);
    this.ensureBuffer(s);
    this.raycastSpherePixels(atlas, s, rotLat, rotLon);
    this.sphereCtx.putImageData(this.sphereImgData, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.sphereCanvas, cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.strokeStyle = "rgba(244, 145, 92, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    const pxPerDeg = radius / 57.2958;
    const project3D = (lat, lon) => {
      const p = this.overlays.projectToSphere(lat, lon, rotLat, rotLon, cx, cy, radius);
      return { ...p, pxPerDeg };
    };

    if (showGraticule) this.drawGraticule3D(ctx, rotLat, rotLon, cx, cy, radius);
    this.overlays.drawGlobalHazards(ctx, "3d", project3D, hazardBundle, zoom);
    if (showNomenclature) this.drawNomenclature3D(ctx, project3D);

    if (computedRoutes && computedRoutes.scope === "global") {
      this.routeRenderer.drawGlobalDualRoutes(ctx, project3D, computedRoutes, showRouteComments, width, height);
    }

    const hitTargets = this.overlays.drawMarkers(ctx, project3D, craters, landingSites, activeCrater?.id);
    ctx.restore();
    return hitTargets;
  }

  /**
   * 3D kure piksellerini bilineer interpolasyon ve isiklandirmayla hesaplar
   */
  raycastSpherePixels(atlas, s, rotLat, rotLon) {
    const half = s / 2;
    const invHalf = 1 / half;
    const out = this.sphereImgData.data;
    const tex = atlas.data;
    const tw = atlas.width;
    const th = atlas.height;

    const phi0 = (rotLat * Math.PI) / 180;
    const lam0 = (rotLon * Math.PI) / 180;
    const sinP0 = Math.sin(phi0);
    const cosP0 = Math.cos(phi0);

    const twoPi = Math.PI * 2;
    const invTwoPi = 1 / twoPi;
    const invPi = 1 / Math.PI;
    const halfPi = Math.PI / 2;

    for (let py = 0; py < s; py++) {
      const ny = (half - py) * invHalf;
      const ny2 = ny * ny;
      for (let px = 0; px < s; px++) {
        const idx = (py * s + px) * 4;
        const nx = (px - half) * invHalf;
        const r2 = nx * nx + ny2;
        if (r2 >= 1.0) {
          out[idx + 3] = 0;
          continue;
        }
        const nz = Math.sqrt(1.0 - r2);
        const vy = ny * cosP0 + nz * sinP0;
        const vz = -ny * sinP0 + nz * cosP0;
        const lat = Math.asin(vy > 1 ? 1 : vy < -1 ? -1 : vy);
        let lon = lam0 + Math.atan2(nx, vz);
        lon = ((lon + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;

        const fu = ((lon + Math.PI) * invTwoPi) * (tw - 1);
        const fv = ((halfPi - lat) * invPi) * (th - 1);
        const u0 = fu | 0;
        const v0 = fv | 0;
        const u1 = (u0 + 1) % tw;
        const v1 = v0 + 1 < th ? v0 + 1 : v0;
        const du = fu - u0;
        const dv = fv - v0;
        const w00 = (1 - du) * (1 - dv);
        const w10 = du * (1 - dv);
        const w01 = (1 - du) * dv;
        const w11 = du * dv;

        const i00 = (v0 * tw + u0) * 4;
        const i10 = (v0 * tw + u1) * 4;
        const i01 = (v1 * tw + u0) * 4;
        const i11 = (v1 * tw + u1) * 4;

        const rTex = tex[i00] * w00 + tex[i10] * w10 + tex[i01] * w01 + tex[i11] * w11;
        const gTex = tex[i00 + 1] * w00 + tex[i10 + 1] * w10 + tex[i01 + 1] * w01 + tex[i11 + 1] * w11;
        const bTex = tex[i00 + 2] * w00 + tex[i10 + 2] * w10 + tex[i01 + 2] * w01 + tex[i11 + 2] * w11;

        const diff = Math.max(0.38, -0.34 * nx + 0.26 * ny + 0.90 * nz);
        const limb = Math.pow(1.0 - nz, 2.8);

        out[idx] = Math.min(255, rTex * diff + limb * 145);
        out[idx + 1] = Math.min(255, gTex * diff + limb * 68);
        out[idx + 2] = Math.min(255, bTex * diff + limb * 32);
        out[idx + 3] = 255;
      }
    }
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

  drawGraticule3D(ctx, rotLat, rotLon, cx, cy, radius) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 0.8;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 12) {
        const p = this.overlays.projectToSphere(lat, lon, rotLat, rotLon, cx, cy, radius);
        if (p.z > 0) {
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
        const p = this.overlays.projectToSphere(lat, lon, rotLat, rotLon, cx, cy, radius);
        if (p.z > 0) {
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else started = false;
      }
      ctx.stroke();
    }
  }

  drawNomenclature3D(ctx, project3D) {
    const places = [
      { name: "VALLES MARINERIS", lat: -13, lon: -65 },
      { name: "OLYMPUS MONS", lat: 18.6, lon: -133.8 },
      { name: "SYRTIS MAJOR", lat: 8.4, lon: 69.5 },
      { name: "HELLAS PLANITIA", lat: -51.0, lon: 68.0 }
    ];
    ctx.font = "800 10px 'Public Sans Web', sans-serif";
    ctx.fillStyle = "rgba(255, 245, 235, 0.82)";
    for (const pl of places) {
      const p = project3D(pl.lat, pl.lon);
      if (p.visible && p.z > 0.25) ctx.fillText(pl.name, p.x - 36, p.y);
    }
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc 3D Mars Kuresi cizim motoru tanimi.
   - Satir 10-33: constructor ve ensureBuffer; uyarlanabilir cozunurluklu kure tamponunu kurar.
   - Satir 35-89: render; atmosfer isigi, isin izleme dokusu, tehlikeler, Mavi/Soluk Mavi rotalar ve pinleri cizer.
   - Satir 91-155: raycastSpherePixels; kure piksellerini bilineer ornekleme ile doldurur.
   - Satir 157-210: drawLoadingSphere, drawGraticule3D ve drawNomenclature3D yardimcilari.
   ========================================================================== */
