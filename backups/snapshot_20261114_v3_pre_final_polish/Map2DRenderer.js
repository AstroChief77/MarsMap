/**
 * @file Map2DRenderer.js
 * @description Varsayilan (Default) 2D Equirectangular Mars Haritasi cizim sinifi.
 * Kural geregi olcek yaklastikca gorunur pencereye dusen data/tiles karolari kademeli (LOD)
 * olarak cizilir; haritanin tamami ayni anda render edilmez.
 */

import { OverlayDrawHelper } from "./OverlayDrawHelper.js";
import { RouteCanvasRenderer } from "./RouteCanvasRenderer.js";

export class Map2DRenderer {
  /**
   * Map2DRenderer yapici metodu
   * @param {MarsTileLoader} tileLoader - Yerel data/tiles karo yukleyici
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
      width, height, rotLat, rotLon, zoom, activeLayerId,
      craters, landingSites, activeCrater, hazardBundle,
      computedRoutes, craterWaypoints, selectedWaypoint,
      progressiveLodRender, showGraticule, showNomenclature,
      showRadiationZones, showRouteComments, routeScope
    } = state;

    ctx.clearRect(0, 0, width, height);

    const baseWidth = Math.max(width * 0.86, 620);
    const mapW = baseWidth * Math.min(Math.max(zoom, 0.65), 4.5);
    const mapH = mapW * 0.5;
    const pxPerDeg = mapW / 360;

    const uCenter = (rotLon + 180) / 360;
    const vCenter = (90 - rotLat) / 180;
    const ox = width / 2 - uCenter * mapW;
    const oy = height / 2 - vCenter * mapH;

    // 1. Olcege gore yalnizca gorunur karolari kademeli (LOD) yukleyip ciz
    const layer = this.tileLoader.getLayerById(activeLayerId);
    const targetZ = this.tileLoader.computeTargetZoom(zoom, layer, progressiveLodRender !== false);

    this.drawVisibleTileLevel(ctx, activeLayerId, 0, ox, oy, mapW, mapH, width, height);
    if (targetZ >= 1) this.drawVisibleTileLevel(ctx, activeLayerId, 1, ox, oy, mapW, mapH, width, height);
    if (targetZ >= 2) this.drawVisibleTileLevel(ctx, activeLayerId, 2, ox, oy, mapW, mapH, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, mapW, mapH);

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
    this.overlays.drawGlobalHazards(ctx, "2d", project2D, hazardBundle, zoom);

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

    // 7. Tiklanabilir krater ve NASA inis sahasi pinleri
    return this.overlays.drawMarkers(ctx, project2D, craters, landingSites, activeCrater?.id);
  }

  /**
   * Gorunur ekran sinirlari icinde kalan karolari cizer (Viewport Culling)
   */
  drawVisibleTileLevel(ctx, layerId, z, ox, oy, mapW, mapH, viewW, viewH) {
    const cols = Math.pow(2, z + 1);
    const rows = Math.pow(2, z);
    const tw = mapW / cols;
    const th = mapH / rows;

    for (const wrapX of [-mapW, 0, mapW]) {
      const bx = ox + wrapX;
      if (bx + mapW < 0 || bx > viewW) continue;

      for (let y = 0; y < rows; y++) {
        const py = oy + y * th;
        if (py + th < 0 || py > viewH) continue;

        for (let x = 0; x < cols; x++) {
          const px = bx + x * tw;
          if (px + tw < 0 || px > viewW) continue;
          const img = this.tileLoader.getTileImage(layerId, z, y, x);
          if (img) ctx.drawImage(img, px, py, tw + 0.6, th + 0.6);
        }
      }
    }
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
      { name: "HELLAS PLANITIA", lat: -42.4, lon: 70.5 },
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
      ctx.beginPath();
      ctx.arc(cx, cy, sr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#38bdf8";
      ctx.font = "700 9px 'Public Sans Web', sans-serif";
      ctx.fillText(`${Math.round(crater.elevation_datum_m + i * 260)}m`, cx + sr + 4, cy);
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
        ctx.fillText("⚑ BOXWORK RİTJLERİ", bx - 44, by - 22 * scale);
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
          zoom >= 2.1 ? `☢ ${rz.gammaLevel} | ${rz.photonFlux}` : ""
        );
      }
    }
    ctx.restore();
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc varsayilan 2D harita motoru ve olcekli LOD kirpma aciklamasi.
   - Satir 11-20: constructor; MarsTileLoader, OverlayDrawHelper ve RouteCanvasRenderer baglar.
   - Satir 25-106: render; 2D Equirectangular tuvalde yalnizca gorunur karolari, rotLon merkezli saran projeksiyonla tehlike, krater EVA ve kuresel rotalari cizer.
   - Satir 111-133: drawVisibleTileLevel; ekrana sigmayan karo karelerini hic cizmez (viewport culling).
   - Satir 135-170: drawGraticule ve drawNomenclature yardimcilari.
   - Satir 175-226: drawCraterLocalOverlays; yakinlasildiginda MOLA metre konturlari, Boxwork ve foton alanini cizer.
   ========================================================================== */
