/**
 * @file OverlayDrawHelper.js
 * @description 2D ve 3D Mars haritalari uzerine Asit Yagmuru, Kum Firtinasi,
 * Alfa/Beta/Gama Radyasyon & Foton Bombardimani alanlari ve Krater pinlerini cizen yardimci sinif.
 */

(function (ns) {
  "use strict";
  class OverlayDrawHelper {
    /**
     * 3D kure uzerine cografik nokta projeksiyonu uygular
     */
    projectToSphere(latDeg, lonDeg, rotLatDeg, rotLonDeg, cx, cy, radius) {
      const phi = (latDeg * Math.PI) / 180;
      const lambda = (lonDeg * Math.PI) / 180;
      const phi0 = (rotLatDeg * Math.PI) / 180;
      const lam0 = (rotLonDeg * Math.PI) / 180;

      const cosPhi = Math.cos(phi);
      const x0 = cosPhi * Math.sin(lambda - lam0);
      const y0 = Math.sin(phi);
      const z0 = cosPhi * Math.cos(lambda - lam0);

      const y1 = y0 * Math.cos(phi0) - z0 * Math.sin(phi0);
      const z1 = y0 * Math.sin(phi0) + z0 * Math.cos(phi0);

      return { x: cx + x0 * radius, y: cy - y1 * radius, z: z1, visible: z1 > 0.05 };
    }

    /**
     * 2D Equirectangular tuval uzerinde dairesel tehlike / radyasyon bolgesi cizer
     */
    draw2DHazardCircle(ctx, px, py, radPx, fillStart, borderStroke, labelText) {
      const g = ctx.createRadialGradient(px, py, 2, px, py, radPx);
      g.addColorStop(0, fillStart);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, radPx, 0, Math.PI * 2);
      ctx.fill();

      if (borderStroke) {
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = borderStroke;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(px, py, radPx * 0.78, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (labelText) {
        ctx.save();
        ctx.font = "700 10px 'Public Sans Web', sans-serif";
        const tw = ctx.measureText(labelText).width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
        ctx.fillRect(px - tw / 2 - 5, py - 9, tw + 10, 17);
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.fillText(labelText, px, py + 3);
        ctx.restore();
      }
    }

    /**
     * 2D veya 3D projeksiyonda tum aktif Asit Yagmuru, Firtina ve Foton alanlarini cizer
     */
    drawGlobalHazards(ctx, mode, projFn, hazardBundle, zoom) {
      const { acidZones, stormZones, radiationZones, acidSpec, stormSpec } = hazardBundle;
      const acidAlpha = Math.min(0.65, 0.34 * (acidSpec?.alphaMult || 1));
      const stormAlpha = Math.min(0.68, 0.34 * (stormSpec?.alphaMult || 1));

      for (const z of acidZones) {
        const p = projFn(z.lat, z.lon);
        if (!p || !p.visible) continue;
        const r = mode === "2d" ? z.radiusDeg * p.pxPerDeg : z.radiusDeg * p.pxPerDeg * 0.85;
        this.draw2DHazardCircle(
          ctx, p.x, p.y, r,
          `rgba(245, 158, 11, ${acidAlpha})`,
          "rgba(251, 191, 36, 0.72)",
          zoom >= 0.85 ? `⚗ ${z.name}` : ""
        );
      }

      for (const z of stormZones) {
        const p = projFn(z.lat, z.lon);
        if (!p || !p.visible) continue;
        const r = mode === "2d" ? z.radiusDeg * p.pxPerDeg : z.radiusDeg * p.pxPerDeg * 0.85;
        this.draw2DHazardCircle(
          ctx, p.x, p.y, r,
          `rgba(217, 43, 43, ${stormAlpha})`,
          "rgba(248, 113, 113, 0.80)",
          zoom >= 0.85 ? `🌪 ${z.name}` : ""
        );
      }

      for (const z of radiationZones) {
        const p = projFn(z.lat, z.lon);
        if (!p || !p.visible) continue;
        const r = mode === "2d" ? z.radiusDeg * p.pxPerDeg : z.radiusDeg * p.pxPerDeg * 0.85;
        this.draw2DHazardCircle(
          ctx, p.x, p.y, r,
          "rgba(139, 92, 246, 0.28)",
          "rgba(196, 181, 253, 0.75)",
          zoom >= 0.9 ? `☢ ${z.name}` : ""
        );
      }
    }

    /**
     * Kuresel harita uzerinde krater ve NASA inis sahasi isaretcilerini cizer, tiklama hedeflerini dondurur
     */
    drawMarkers(ctx, projFn, craters, landingSites, activeCraterId) {
      const hitTargets = [];

      if (Array.isArray(landingSites)) {
        for (const site of landingSites) {
          const p = projFn(site.latitude, site.longitude);
          if (!p || !p.visible) continue;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
          ctx.fill();
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      for (const crater of craters) {
        const p = projFn(crater.coordinates.lat, crater.coordinates.lon);
        if (!p || !p.visible) continue;
        const isActive = crater.id === activeCraterId;

        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 8 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? "#d92b2b" : "#ffffff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000000";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 14 : 10, 0, Math.PI * 2);
        ctx.strokeStyle = isActive ? "rgba(217, 43, 43, 0.9)" : "rgba(255, 255, 255, 0.45)";
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.font = "800 11px 'Public Sans Web', sans-serif";
        const label = crater.id === "gale-crater" ? `★ ${crater.name}` : crater.name;
        const lw = ctx.measureText(label).width;
        ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
        ctx.fillRect(p.x + 11, p.y - 10, lw + 12, 20);
        ctx.strokeStyle = isActive ? "#d92b2b" : "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x + 11, p.y - 10, lw + 12, 20);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(label, p.x + 17, p.y + 4);

        hitTargets.push({ crater, x: p.x, y: p.y, r: 22 });
      }

      return hitTargets;
    }

    /**
     * Kullanici tarafindan secilen Mevcut Konum (A) ve Varis Noktasi (B) isaretcilerini cizer
     */
    drawCustomEndpoints(ctx, projFn, origin, destination) {
      const drawEndpoint = (pt, tag, bgHex, borderHex) => {
        if (!pt || pt.lat === undefined || pt.lon === undefined) return;
        const p = projFn(pt.lat, pt.lon);
        if (!p || !p.visible) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = borderHex;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = bgHex;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();

        ctx.font = "900 10px 'Public Sans Web', sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tag, p.x, p.y + 0.5);

        const caption = `${tag}: ${(pt.name || `${pt.lat.toFixed(1)}°, ${pt.lon.toFixed(1)}°`).slice(0, 22)}`;
        ctx.font = "800 10px 'Public Sans Web', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const tw = ctx.measureText(caption).width;
        ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
        ctx.fillRect(p.x + 14, p.y - 22, tw + 10, 17);
        ctx.strokeStyle = bgHex;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(p.x + 14, p.y - 22, tw + 10, 17);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(caption, p.x + 19, p.y - 10);
        ctx.restore();
      };

      drawEndpoint(origin, "A", "#2563eb", "rgba(37, 99, 235, 0.85)");
      drawEndpoint(destination, "B", "#d92b2b", "rgba(217, 43, 43, 0.9)");
    }
  }

  ns.OverlayDrawHelper = OverlayDrawHelper;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc tehlike/radyasyon/pin cizim yardimci sinifi tanimi.
   - Satir 7-26: projectToSphere; enlem/boylam koordinatlarini 3D kure ekran noktasina cevirir.
   - Satir 28-61: draw2DHazardCircle; radyal gradyan, kesikli sinir halkasi ve etiket kutusu cizer.
   - Satir 63-105: drawGlobalHazards; Asit Yagmuru, Kum Firtinasi ve Alfa/Beta/Gama Foton kusaklarini aktif siddetle cizer.
   - Satir 107-165: drawMarkers; NASA inis sahalari ve tiklanabilir odak krater pinlerini cizer.
   - Satir 167-212: drawCustomEndpoints; haritada secilen Mevcut Konum (A) ve Varis (B) noktalarini cizer.
   ========================================================================== */
