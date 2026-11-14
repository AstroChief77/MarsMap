/**
 * @file RouteCanvasRenderer.js
 * @description Harita uzerinde Mavi (#2563eb - En Guvenli Kisa Yol) ve Soluk Mavi (#93c5fd - Guvenli Uzun Yol)
 * guzergahlarini, yon oklari ve harita ustu yol yorum kutucuklarini ("yollarda yorum satiri") cizen sinif.
 */

(function (ns) {
  "use strict";
  class RouteCanvasRenderer {
    /**
     * Harita uzerine yol yorum kutucugu (sure, mesafe ve yorum satiri) cizer
     */
    drawRouteCommentBox(ctx, x, y, text, accentHex, viewW, viewH) {
      if (x < -120 || x > viewW + 120 || y < -40 || y > viewH + 40) return;
      ctx.save();
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      const tw = ctx.measureText(text).width;
      const boxW = tw + 16;
      const boxH = 20;
      const bx = Math.max(8, Math.min(viewW - boxW - 8, x - boxW / 2));
      const by = Math.max(8, Math.min(viewH - boxH - 8, y - boxH / 2));

      ctx.fillStyle = "rgba(13, 15, 18, 0.9)";
      ctx.fillRect(bx, by, boxW, boxH);
      ctx.fillStyle = accentHex;
      ctx.fillRect(bx, by, 4, boxH);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx, by, boxW, boxH);

      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(text, bx + 9, by + boxH / 2 + 0.5);
      ctx.restore();
    }

    /**
     * Kuresel 2D veya 3D projeksiyonda cift mavi rota cizer
     */
    drawGlobalDualRoutes(ctx, projFn, routes, showComments, viewW, viewH, maxJumpPx = 240) {
      if (!routes || !routes.primaryBlue || !routes.secondaryPaleBlue) return;
      const sec = routes.secondaryPaleBlue;
      const pri = routes.primaryBlue;

      // 1. SOLUK MAVI YOL: Yine guvenli ama daha uzun alternatif yol
      const secPts = this.strokeGeoPath(ctx, projFn, sec.points, "#93c5fd", 3.0, [7, 5], maxJumpPx);
      // 2. MAVI YOL: En guvenli ve en kisa rota
      const priPts = this.strokeGeoPath(ctx, projFn, pri.points, "#2563eb", 4.5, [], maxJumpPx);

      if (showComments) {
        if (secPts.length > 0) {
          const sAnchor = secPts[Math.floor(secPts.length * 0.54)];
          const sBoxX = sAnchor.x;
          const sBoxY = sAnchor.y + 30;
          this.drawLeaderLine(ctx, sAnchor.x, sAnchor.y, sBoxX, sBoxY, "#93c5fd");
          this.drawRouteCommentBox(ctx, sBoxX, sBoxY, sec.comment, "#93c5fd", viewW, viewH);
        }
        if (priPts.length > 0) {
          const pAnchor = priPts[Math.floor(priPts.length * 0.25)];
          const pBoxX = Math.min(viewW - 430, pAnchor.x + 35);
          const pBoxY = pAnchor.y - 84;
          this.drawLeaderLine(ctx, pAnchor.x, pAnchor.y, pBoxX, pBoxY, "#2563eb");
          this.drawRouteCommentBox(ctx, pBoxX, pBoxY, pri.comment, "#2563eb", viewW, viewH);
        }
      }
    }

    /**
     * Rota egri noktasi ile yorum kutusu arasina ince isaret cizgisi cizer
     */
    drawLeaderLine(ctx, x1, y1, x2, y2, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.restore();
    }

    /**
     * Cografik nokta listesini antimeridyen sicramalarini atlayarak cizer ve ekran noktalarini doner
     */
    strokeGeoPath(ctx, projFn, geoPoints, color, width, dash, maxJumpPx = 240) {
      if (!geoPoints || geoPoints.length < 2) return [];
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.setLineDash(dash);

      ctx.beginPath();
      let prev = null;
      const screenPts = [];
      for (const pt of geoPoints) {
        const p = projFn(pt.lat, pt.lon);
        if (!p || !p.visible) {
          prev = null;
          continue;
        }
        const jumped = prev && Math.hypot(p.x - prev.x, p.y - prev.y) > maxJumpPx;
        if (!prev || jumped) {
          ctx.moveTo(p.x, p.y);
        } else {
          ctx.lineTo(p.x, p.y);
        }
        prev = p;
        screenPts.push(p);
      }
      ctx.stroke();
      ctx.restore();

      return screenPts;
    }

    /**
     * Yakinlastirilmis krater ici EVA yuruyus rotasini (Mavi + Soluk Mavi + Yol Yorumu) cizer
     */
    drawCraterEvaRoutes(ctx, cx, cy, localZoom, routes, waypoints, selectedWp, showComments, viewW, viewH, showWpLabels = true) {
      if (!routes || !routes.primaryBlue || !routes.secondaryPaleBlue) return;
      const sec = routes.secondaryPaleBlue;
      const pri = routes.primaryBlue;

      ctx.save();

      // Soluk Mavi uzun guvenli EVA yolu
      ctx.strokeStyle = "#93c5fd";
      ctx.lineWidth = 3.2;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      sec.points.forEach((pt, idx) => {
        const sx = cx + pt.relX * localZoom;
        const sy = cy + pt.relY * localZoom;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Mavi en kisa guvenli EVA yolu
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      pri.points.forEach((pt, idx) => {
        const sx = cx + pt.relX * localZoom;
        const sy = cy + pt.relY * localZoom;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      if (showComments) {
        const pMid = pri.points[Math.min(pri.points.length - 1, Math.floor(pri.points.length * 0.5))];
        const sMid = sec.points[Math.min(sec.points.length - 1, Math.floor(sec.points.length * 0.48))];
        const pAx = cx + pMid.relX * localZoom;
        const pAy = cy + pMid.relY * localZoom;
        const sAx = cx + sMid.relX * localZoom;
        const sAy = cy + sMid.relY * localZoom;

        const pBoxX = pAx + (showWpLabels ? 20 : 10);
        const pBoxY = pAy - (showWpLabels ? 118 : 44);
        const sBoxX = sAx - (showWpLabels ? 30 : 0);
        const sBoxY = sAy + (showWpLabels ? 58 : 42);

        this.drawLeaderLine(ctx, sAx, sAy, sBoxX, sBoxY, "#93c5fd");
        this.drawLeaderLine(ctx, pAx, pAy, pBoxX, pBoxY, "#2563eb");
        this.drawRouteCommentBox(ctx, sBoxX, sBoxY, sec.comment, "#93c5fd", viewW, viewH);
        this.drawRouteCommentBox(ctx, pBoxX, pBoxY, pri.comment, "#2563eb", viewW, viewH);
      }

      // Gorunur EVA duraklari
      waypoints.forEach((wp) => {
        const wx = cx + wp.relX * localZoom;
        const wy = cy + wp.relY * localZoom;
        if (wx < -40 || wx > viewW + 40 || wy < -40 || wy > viewH + 40) return;
        const isSel = selectedWp && selectedWp.id === wp.id;

        ctx.beginPath();
        ctx.arc(wx, wy, isSel ? 7.5 : (wp.highlight ? 6.5 : 4.5), 0, Math.PI * 2);
        ctx.fillStyle = isSel ? "#ffffff" : (wp.highlight ? "#d92b2b" : "#2563eb");
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = "#000000";
        ctx.stroke();

        if (showWpLabels) {
          const alignLeftSide = wx > viewW - 560 || wp.relX > 75 || (Math.abs(wp.relY) < 25 && wp.relX < 0 && wp.relX > -65);
          const wpLabel = `${wp.name} (${wp.elev}m)`;
          const tx = alignLeftSide ? wx - 11 : wx + 11;
          const ty = wy + 3;
          ctx.font = "800 10px 'Public Sans Web', sans-serif";
          ctx.textAlign = alignLeftSide ? "right" : "left";
          ctx.strokeStyle = "rgba(0, 0, 0, 0.88)";
          ctx.lineWidth = 3;
          ctx.lineJoin = "round";
          ctx.strokeText(wpLabel, tx, ty);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(wpLabel, tx, ty);
        }
      });
      ctx.restore();
    }
  }

  ns.RouteCanvasRenderer = RouteCanvasRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc Mavi ve Soluk Mavi rota ile harita ustu yol yorumu cizim sinifi.
   - Satir 11-33: drawRouteCommentBox; haritada yollarin uzerine sure/mesafe/guvenlik yorumu cizer.
   - Satir 38-67: drawGlobalDualRoutes; kuresel haritada Soluk Mavi uzun ve Mavi kisa guvenli yollari, isaret cizgilerini ve yorum kutularini cizer.
   - Satir 72-82: drawLeaderLine; rota egrisi ile yol yorumu kutusu arasini ince kesikli cizgiyle baglar.
   - Satir 87-115: strokeGeoPath; cografik rota noktalarini antimeridyen sicramalarini atlayarak cizer ve ekran noktalarini doner.
   - Satir 120-200: drawCraterEvaRoutes; krater icindeki Mavi/Soluk Mavi EVA rotalari, cakismasiz yorum kutulari ve koyu haleli durak etiketlerini cizer.
   ========================================================================== */
