/**
 * @file Map2DRenderer.js
 * @description Varsayilan (Default) 2D Equirectangular Mars Haritasi cizim sinifi.
 * Kural geregi olcek yaklastikca gorunur pencereye dusen z=0..7+ karolari tek geciste (1x overdraw)
 * ve otomatik ata-karo yedegiyle yuksek netlikte cizilir; haritanin tamami ayni anda render edilmez.
 */

(function (ns) {
  "use strict";
  const { OverlayDrawHelper, RouteCanvasRenderer } = ns;

  class Map2DRenderer {
    /**
     * Map2DRenderer yapici metodu
     * @param {MarsTileLoader} tileLoader - Yerel/WMTS karo yukleyici
     */
    constructor(tileLoader) {
      this.tileLoader = tileLoader;
      this.overlays = new OverlayDrawHelper();
      this.routeRenderer = new RouteCanvasRenderer();
    }

    /**
     * 2D Equirectangular harita ve yakinlastirilmis krater EVA detaylarini cizer
     */
    render(ctx, state) {
      const {
        width, height, rotLat, rotLon, zoom, activeLayerId, dpr,
        craters, landingSites, activeCrater, hazardBundle,
        computedRoutes, craterWaypoints, selectedWaypoint,
        progressiveLodRender, showGraticule, showNomenclature,
        showRadiationZones, showRouteComments, routeScope,
        customOrigin, customDestination
      } = state;

      ctx.clearRect(0, 0, width, height);

      const baseWidth = Math.max(width * 0.86, 620);
      const mapW = baseWidth * Math.min(Math.max(zoom, 0.65), 32.0);
      const mapH = mapW * 0.5;
      const pxPerDeg = mapW / 360;

      const uCenter = (rotLon + 180) / 360;
      const vCenter = (90 - rotLat) / 180;
      const ox = width / 2 - uCenter * mapW;
      const oy = height / 2 - vCenter * mapH;

      // 1. Olcege gore yalnizca gorunur karolari tek geciste (1x overdraw + ata karo yedegi) ciz
      const layer = this.tileLoader.getLayerById(activeLayerId);
      const targetZ = this.tileLoader.computeTargetZoom({
        zoom,
        mapWidthPx: mapW,
        dpr: dpr || 1,
        viewMode: "2d",
        progressiveLodRender: progressiveLodRender !== false
      }, layer);

      this.drawVisibleTiles(ctx, activeLayerId, targetZ, ox, oy, mapW, mapH, width, height, Boolean(state.isInteracting));

      // Kutup ust/alt sinir cizgileri (antimeridyende dikey dikis izi olusturmadan)
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (oy >= 0 && oy <= height) {
        ctx.moveTo(0, oy);
        ctx.lineTo(width, oy);
      }
      if (oy + mapH >= 0 && oy + mapH <= height) {
        ctx.moveTo(0, oy + mapH);
        ctx.lineTo(width, oy + mapH);
      }
      ctx.stroke();
      ctx.restore();

      // 2. Projeksiyon yardimcisi (2D enlem/boylam -> ekran pikseli, rotLon merkezli yatay wrap)
      const project2D = (lat, lon) => {
        const dLon = ((lon - rotLon + 540) % 360) - 180;
        const x = width / 2 + (dLon / 360) * mapW;
        const y = oy + ((90 - lat) / 180) * mapH;
        const visible = x >= -180 && x <= width + 180 && y >= -180 && y <= height + 180;
        return { x, y, pxPerDeg, visible };
      };

      // 3. Enlem/boylam izgarasi (sadece gorunur alanda)
      if (showGraticule) {
        this.drawGraticule(ctx, ox, oy, mapW, mapH, width, height);
      }

      // 4. Aktif Asit Yagmuru, Kum Firtinasi ve Alfa/Beta/Gama Foton alanlari
      this.overlays.drawGlobalHazards(ctx, "2d", project2D, hazardBundle, zoom, width, height);

      // 5. Bolge isimleri (Nomenclature)
      if (showNomenclature) {
        this.drawNomenclature(ctx, project2D);
      }

      // 6. Krater EVA modu yakinlasmasi (LOD >= 2 ve routeScope === "crater" ise krater ici kontur + Boxwork + EVA yollari)
      const activeAnchor = activeCrater ? project2D(activeCrater.coordinates.lat, activeCrater.coordinates.lon) : null;
      const isHyperLocal = routeScope === "crater" && activeCrater && zoom >= 1.75 && activeAnchor;

      if (isHyperLocal) {
        const localScale = (zoom - 0.75) * 0.85;
        this.drawCraterLocalOverlays(ctx, activeAnchor.x, activeAnchor.y, localScale, activeCrater, state.craterRadZones, showRadiationZones, zoom, width, height);
        this.routeRenderer.drawCraterEvaRoutes(
          ctx, activeAnchor.x, activeAnchor.y, localScale,
          computedRoutes, craterWaypoints, selectedWaypoint, showRouteComments, width, height
        );
      } else if (routeScope === "global") {
        // Kuresel Inis Sahalari Arasi Guvenli Mavi / Soluk Mavi Rotalar
        this.routeRenderer.drawGlobalDualRoutes(
          ctx, project2D, computedRoutes, showRouteComments, width, height, Math.max(240, mapW * 0.45)
        );
      } else if (activeAnchor && activeAnchor.visible) {
        // Krater modunda uzak olcekte krater EVA koridorunu ve yol yorumlarini goster
        const miniScale = Math.max(0.24, zoom * 0.28);
        this.routeRenderer.drawCraterEvaRoutes(
          ctx, activeAnchor.x, activeAnchor.y, miniScale,
          computedRoutes, craterWaypoints, selectedWaypoint, showRouteComments && zoom >= 0.9, width, height, zoom >= 1.55
        );
      }

      // 7. Tiklanabilir krater, NASA inis sahasi ve A/B konum-varis pinleri
      const hits = this.overlays.drawMarkers(ctx, project2D, craters, landingSites, activeCrater?.id);
      if (routeScope === "global") {
        this.overlays.drawCustomEndpoints(ctx, project2D, customOrigin, customDestination);
      }
      return hits;
    }

    /**
     * Yalnizca gorunur hucreler icin en keskin hazir karoyu (yoksa ata karo kesitini) cizer
     */
    drawVisibleTiles(ctx, layerId, targetZ, ox, oy, mapW, mapH, viewW, viewH, isInteracting = false) {
      const cols = 1 << (targetZ + 1);
      const rows = 1 << targetZ;
      const tw = mapW / cols;
      const th = mapH / rows;

      const yStart = Math.max(0, Math.floor((0 - oy) / th));
      const yEnd = Math.min(rows - 1, Math.floor((viewH - oy) / th));
      if (yStart > yEnd) return;

      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = isInteracting ? "medium" : "high";

      for (const wrapX of [-mapW, 0, mapW]) {
        const bx = ox + wrapX;
        if (bx + mapW < 0 || bx > viewW) continue;

        const xStart = Math.max(0, Math.floor((0 - bx) / tw));
        const xEnd = Math.min(cols - 1, Math.floor((viewW - bx) / tw));
        if (xStart > xEnd) continue;

        for (let y = yStart; y <= yEnd; y++) {
          const py = oy + y * th;
          for (let x = xStart; x <= xEnd; x++) {
            const px = bx + x * tw;
            const img = this.tileLoader.getTileImage(layerId, targetZ, y, x);
            if (img) {
              ctx.drawImage(img, px, py, tw + 0.7, th + 0.7);
              continue;
            }
            for (let az = targetZ - 1; az >= 0; az--) {
              const shift = targetZ - az;
              const scale = 1 << shift;
              const ax = x >> shift;
              const ay = y >> shift;
              const ancImg = this.tileLoader.getTileImage(layerId, az, ay, ax);
              if (ancImg) {
                const subW = ancImg.width / scale;
                const subH = ancImg.height / scale;
                const subX = Math.max(0, (x - ax * scale) * subW);
                const subY = Math.max(0, (y - ay * scale) * subH);
                const clampW = Math.min(subW, ancImg.width - subX);
                const clampH = Math.min(subH, ancImg.height - subY);
                if (clampW > 0 && clampH > 0) {
                  ctx.drawImage(ancImg, subX, subY, clampW, clampH, px, py, tw + 0.7, th + 0.7);
                }
                break;
              }
            }
          }
        }
      }

      ctx.restore();
    }

    drawGraticule(ctx, ox, oy, mapW, mapH, viewW, viewH) {
      ctx.save();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
      ctx.lineWidth = 0.8;
      for (let i = 1; i < 12; i++) {
        const x = ox + (mapW / 12) * i;
        if (x >= 0 && x <= viewW) {
          ctx.beginPath(); ctx.moveTo(x, Math.max(0, oy)); ctx.lineTo(x, Math.min(viewH, oy + mapH)); ctx.stroke();
        }
      }
      for (let j = 1; j < 6; j++) {
        const y = oy + (mapH / 6) * j;
        if (y >= 0 && y <= viewH) {
          ctx.beginPath(); ctx.moveTo(Math.max(0, ox), y); ctx.lineTo(Math.min(viewW, ox + mapW), y); ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawNomenclature(ctx, project2D) {
      const features = [
        { name: "VALLES MARINERIS", lat: -13.0, lon: -65.0 },
        { name: "OLYMPUS MONS", lat: 18.6, lon: -133.8 },
        { name: "SYRTIS MAJOR", lat: 8.4, lon: 69.5 },
        { name: "HELLAS PLANITIA", lat: -51.0, lon: 68.0 },
        { name: "ARABIA TERRA", lat: 21.0, lon: 25.0 }
      ];
      ctx.save();
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      ctx.fillStyle = "rgba(255, 246, 238, 0.85)";
      for (const f of features) {
        const p = project2D(f.lat, f.lon);
        if (p.visible) ctx.fillText(f.name, p.x - 42, p.y);
      }
      ctx.restore();
    }

    /**
     * Krater olcegine yaklasildiginda MOLA kontur halkalari, Boxwork ve Foton Bombardiman alanini cizer
     */
    drawCraterLocalOverlays(ctx, cx, cy, scale, crater, radZones, showRadiation, zoom, viewW, viewH) {
      ctx.save();
      const r = 160 * scale;

      // 1. MOLA metre bazli yukseklik konturlari
      ctx.strokeStyle = "rgba(56, 189, 248, 0.38)";
      ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 4]);
      for (let i = 1; i <= 4; i++) {
        const sr = (r / 4) * i;
        if (sr < viewW * 2.2) {
          ctx.beginPath();
          ctx.arc(cx, cy, sr, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (cx + sr + 40 >= 0 && cx + sr <= viewW && cy >= -20 && cy <= viewH + 20) {
          ctx.fillStyle = "#38bdf8";
          ctx.font = "700 9px 'Public Sans Web', sans-serif";
          ctx.fillText(`${Math.round(crater.elevation_datum_m + i * 260)}m`, cx + sr + 4, cy);
        }
      }
      ctx.setLineDash([]);

      // 2. Gale Krateri Boxwork mineral agi
      if (crater.id === "gale-crater") {
        const bx = cx + 95 * scale;
        const by = cy + 72 * scale;
        if (bx >= -60 && bx <= viewW + 60 && by >= -60 && by <= viewH + 60) {
          ctx.strokeStyle = "#facc15";
          ctx.lineWidth = 1.4;
          for (let off = -18; off <= 18; off += 9) {
            ctx.beginPath(); ctx.moveTo(bx + off * scale, by - 16 * scale); ctx.lineTo(bx + off * scale, by + 16 * scale); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(bx - 16 * scale, by + off * scale); ctx.lineTo(bx + 16 * scale, by + off * scale); ctx.stroke();
          }
          ctx.fillStyle = "#fde047";
          ctx.font = "800 10px 'Public Sans Web', sans-serif";
          ctx.fillText(ns.i18n ? ns.i18n.t("boxworkLabel") : "⚑ BOXWORK RİTJLERİ", bx - 44, by - 22 * scale);
        }
      }

      // 3. Krater ici Alfa / Beta / Gama & Foton Bombardimani
      if (showRadiation && Array.isArray(radZones)) {
        for (const rz of radZones) {
          const rx = cx + rz.relX * scale;
          const ry = cy + rz.relY * scale;
          const rr = rz.radius * scale;
          this.overlays.draw2DHazardCircle(
            ctx, rx, ry, rr,
            "rgba(168, 85, 247, 0.34)",
            "#c084fc",
            zoom >= 2.1 ? `☢ ${rz.gammaLevel} | ${rz.photonFlux}` : "",
            viewW, viewH
          );
        }
      }
      ctx.restore();
    }
  }

  ns.Map2DRenderer = Map2DRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc varsayilan 2D harita motoru ve 1x overdraw LOD kirpma aciklamasi.
   - Satir 11-20: constructor; MarsTileLoader, OverlayDrawHelper ve RouteCanvasRenderer baglar.
   - Satir 25-115: render; 2D Equirectangular tuvalde HiDPI olcekli gorunur karolari, dikissiz yatay sarmayi, tehlike ve rotalari cizer.
   - Satir 120-169: drawVisibleTiles; yalnizca gorunur indeks araligindaki en keskin karolari (yoksa ata karo alt kesitini) 1 kez cizer.
   - Satir 171-206: drawGraticule ve drawNomenclature yardimcilari.
   - Satir 211-265: drawCraterLocalOverlays; yakinlasildiginda MOLA metre konturlari, Boxwork ve foton alanini cizer.
   ========================================================================== */
