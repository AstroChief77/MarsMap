/**
 * @file Map3DFallbackRenderer.js
 * @description file:// protokolu veya getImageData erisim kilidi durumunda
 * hazir z=0..targetZ karolarini dogrudan drawImage ile 3D kureye esleyen yedek motor.
 * 800 satir kurali geregi Map3DRenderer sinifindan ayri modul olarak bolunmustur.
 */

(function (ns) {
  "use strict";

  class Map3DFallbackRenderer {
    /**
     * Map3DFallbackRenderer yapici metodu
     * @param {MarsTileLoader} tileLoader - Yerel/WMTS karo yukleyici
     */
    constructor(tileLoader) {
      this.tileLoader = tileLoader;
    }

    /**
     * file:// protokolunde tarayici getImageData kilidi varsa hazir z=0..targetZ karolariyla
     * kuresel afin projeksiyonlu ve dikissiz 3D dokuyu dogrudan drawImage uzerinden cizer
     */
    drawFallbackShadedSphere(ctx, cx, cy, radius, rotLat = 0, rotLon = 0, activeLayerId = "", viewW = 1440, viewH = 900, targetZ = 2, isInteracting = false, zoom = 1, camPitch = 0, camYaw = 0, reliefScale = 1, heatmap = null) {
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
          const colsGrid = isInteracting ? 28 : 36;
          const rowsGrid = isInteracting ? 24 : 30;
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
          ctx.imageSmoothingQuality = "high";

          for (let py = yStart; py < yEnd; py += ch) {
            const cellH = Math.min(ch, yEnd - py);
            for (let px = xStart; px < xEnd; px += cw) {
              const cellW = Math.min(cw, xEnd - px);
              const clX = Math.max(px, Math.min(px + cellW, cx));
              const clY = Math.max(py, Math.min(py + cellH, cy));
              if ((clX - cx) * (clX - cx) + (clY - cy) * (clY - cy) > rSqMax) continue;

              const p00 = uvAt(px, py), p10 = uvAt(px + cellW, py), p01 = uvAt(px, py + cellH), p11 = uvAt(px + cellW, py + cellH);
              const u00 = p00.u;
              let du10 = p10.u - u00; if (du10 > 0.5) du10 -= 1; else if (du10 < -0.5) du10 += 1;
              let du01 = p01.u - u00; if (du01 > 0.5) du01 -= 1; else if (du01 < -0.5) du01 += 1;
              let du11 = p11.u - u00; if (du11 > 0.5) du11 -= 1; else if (du11 < -0.5) du11 += 1;

              const uMin = u00 + Math.min(0, du10, du01, du11), uMax = u00 + Math.max(0, du10, du01, du11);
              const vMin = Math.min(p00.v, p10.v, p01.v, p11.v), vMax = Math.max(p00.v, p10.v, p01.v, p11.v);
              const ax = du10 / cellW, bx = (p10.v - p00.v) / cellW, ay = du01 / cellH, by = (p01.v - p00.v) / cellH;
              const det = ax * by - ay * bx;

              if (Math.abs(det) < 1e-10 || (uMax - uMin) > 0.25) {
                const subW = cellW * 0.25, subH = cellH * 0.25;
                for (let syi = 0; syi < 4; syi++) {
                  for (let sxi = 0; sxi < 4; sxi++) {
                    const pm = uvAt(px + (sxi + 0.5) * subW, py + (syi + 0.5) * subH);
                    for (let z = maxZ; z >= 0; z--) {
                      const cols = 1 << (z + 1), rows = 1 << z;
                      const tx = Math.min(cols - 1, Math.max(0, (pm.u * cols) | 0)), ty = Math.min(rows - 1, Math.max(0, (pm.v * rows) | 0));
                      const img = this.tileLoader.getTileImage(activeLayerId, z, ty, tx);
                      if (!img) continue;
                      const iw = img.width || 256, ih = img.height || 256;
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
              const mXu = by * invDet, mXv = -ay * invDet, mYu = -bx * invDet, mYv = ax * invDet;

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
              if (heatmap && heatmap.hasData && heatmap.canvas) {
                const hw = heatmap.width, hh = heatmap.height;
                ctx.save();
                ctx.transform(
                  mXu / hw, mYu / hw,
                  mXv / hh, mYv / hh,
                  px - mXu * u00 - mXv * p00.v,
                  py - mYu * u00 - mYv * p00.v
                );
                ctx.drawImage(heatmap.canvas, 0, 0);
                ctx.restore();
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
  }

  ns.Map3DFallbackRenderer = Map3DFallbackRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc file:// ve tainted tuval ortamlari icin 3D yedek kure cizici tanimi.
   - Satir 11-18: Map3DFallbackRenderer constructor; MarsTileLoader ornegini saklar.
   - Satir 20-192: drawFallbackShadedSphere; z=0..targetZ karolarini kuresel afin izgara ve alt-hucre drawImage donusumuyle 3D kureye cizer, kuresel golge ekler.
   - Satir 195-196: Sinifi AstroChief ad alanina kaydeder.
   ========================================================================== */
