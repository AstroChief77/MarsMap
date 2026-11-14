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
     * Kuresel 2D veya 3D projeksiyonda tekil Mavi rotayi cizer (Alternatif yol kaldirildi)
     */
    drawGlobalDualRoutes(ctx, projFn, routes, showComments, viewW, viewH, maxJumpPx = 240) {
      if (!routes || !routes.primaryBlue) return;
      const pri = routes.primaryBlue;

      const priPts = this.strokeGeoPath(ctx, projFn, pri.points, "#2563eb", 4.5, [], maxJumpPx);

      if (showComments && priPts.length > 0) {
        const pAnchor = priPts[Math.floor(priPts.length * 0.25)];
        const pBoxX = Math.max(24, Math.min(Math.max(24, viewW - 430), pAnchor.x + 35));
        const pBoxY = Math.max(20, pAnchor.y - 84);
        this.drawLeaderLine(ctx, pAnchor.x, pAnchor.y, pBoxX, pBoxY, "#2563eb");
        this.drawRouteCommentBox(ctx, pBoxX, pBoxY, pri.comment, "#2563eb", viewW, viewH);
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
     * Yakinlastirilmis krater ici EVA yuruyus rotasini (Tekil Mavi Yol + Yol Yorumu) cizer
     */
    drawCraterEvaRoutes(ctx, cx, cy, localZoom, routes, waypoints, selectedWp, showComments, viewW, viewH, showWpLabels = true) {
      if (!routes || !routes.primaryBlue) return;
      const pri = routes.primaryBlue;
      const baseLat = routes.origin?.lat || 0;
      const baseLon = routes.origin?.lon || 0;
      const toRelX = (pt) => (typeof pt.relX === "number" ? pt.relX : ((pt.lon || 0) - baseLon) * 18);
      const toRelY = (pt) => (typeof pt.relY === "number" ? pt.relY : -((pt.lat || 0) - baseLat) * 18);

      ctx.save();

      // Mavi en kisa guvenli EVA yolu
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      pri.points.forEach((pt, idx) => {
        const sx = cx + toRelX(pt) * localZoom;
        const sy = cy + toRelY(pt) * localZoom;
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      if (showComments && pri.points.length > 0) {
        const pMid = pri.points[Math.min(pri.points.length - 1, Math.floor(pri.points.length * 0.5))];
        const pAx = cx + toRelX(pMid) * localZoom;
        const pAy = cy + toRelY(pMid) * localZoom;
        const pBoxX = Math.max(24, Math.min(Math.max(24, viewW - 430), pAx + (showWpLabels ? 20 : 10)));
        const pBoxY = Math.max(20, pAy - (showWpLabels ? 118 : 44));

        this.drawLeaderLine(ctx, pAx, pAy, pBoxX, pBoxY, "#2563eb");
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

    /**
     * Demo modunda Mavi rota uzerinde katedilen parlak izi, animasyonlu Rover/Astronot isaretcisini ve canli telemetri etiketini cizer
     */
    drawDemoSimulation(ctx, projFn, routes, demoSim, viewW, viewH, maxJumpPx = 240) {
      if (!demoSim || !demoSim.active || !demoSim.ready) return;
      const pts = routes?.primaryBlue?.points;
      if (!Array.isArray(pts) || pts.length < 2) return;

      const trailPts = [];
      const limitIdx = Math.min(pts.length - 1, Math.max(0, demoSim.segIdx || 0));
      for (let i = 0; i <= limitIdx; i++) trailPts.push(pts[i]);
      trailPts.push({ lat: demoSim.lat, lon: demoSim.lon });

      if (trailPts.length >= 2) {
        this.strokeGeoPath(ctx, projFn, trailPts, "rgba(56, 189, 248, 0.55)", 7.5, [], maxJumpPx);
        this.strokeGeoPath(ctx, projFn, trailPts, "#ffffff", 2.4, [6, 5], maxJumpPx);
      }

      const p = projFn(demoSim.lat, demoSim.lon);
      if (!p || !p.visible || p.x < -60 || p.x > viewW + 60 || p.y < -60 || p.y > viewH + 60) return;

      const pulse = 0.5 + 0.5 * Math.sin(demoSim.pulsePhase || 0);
      const ringR = 13 + pulse * 9;
      const isAstro = demoSim.vehicle === "astronaut";

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(217, 43, 43, ${(0.82 - pulse * 0.52).toFixed(2)})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 11.5, 0, Math.PI * 2);
      ctx.fillStyle = "#0d0f12";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = isAstro ? "#ffffff" : "#d92b2b";
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.4;
      if (isAstro) {
        ctx.beginPath();
        ctx.arc(p.x, p.y - 2.2, 3.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(p.x - 2.2, p.y - 3.3, 4.4, 2.0);
        ctx.strokeStyle = "#ffffff";
        ctx.beginPath();
        ctx.moveTo(p.x - 3.4, p.y + 5.6);
        ctx.lineTo(p.x - 2.2, p.y + 1.5);
        ctx.lineTo(p.x + 2.2, p.y + 1.5);
        ctx.lineTo(p.x + 3.4, p.y + 5.6);
        ctx.stroke();
      } else {
        ctx.fillRect(p.x - 5.5, p.y - 2.0, 11.0, 4.5);
        ctx.fillStyle = "#d92b2b";
        ctx.fillRect(p.x - 2.0, p.y - 5.5, 2.2, 3.5);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(p.x - 1.5, p.y - 6.2, 4.5, 1.8);
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(p.x - 4.0, p.y + 4.2, 2.0, 0, Math.PI * 2);
        ctx.arc(p.x + 4.0, p.y + 4.2, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }

      const tag = `${isAstro ? "EVA" : "ROVER"} ${demoSim.progressPct}% · ${demoSim.traveledKm.toFixed(1)} km · ${demoSim.remainingO2L}L O₂`;
      this.drawRouteCommentBox(ctx, p.x, p.y - 28, tag, "#d92b2b", viewW, viewH);
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
   - Satir 107-173: drawCraterEvaRoutes; krater icindeki Mavi EVA rotalari, cakismasiz yorum kutulari ve koyu haleli durak etiketlerini cizer.
   - Satir 175-248: drawDemoSimulation; juri demo modunda Mavi rota uzerindeki parlak izi, animasyonlu Rover/EVA Astronot isaretcisini ve canli telemetri etiketini cizer.
   ========================================================================== */
