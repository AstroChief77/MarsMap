/**
 * @file RouteCanvasRenderer.js
 * @description Harita uzerinde Mavi (#2563eb - En Guvenli Kisa Yol) ve Soluk Mavi (#93c5fd - Guvenli Uzun Yol)
 * guzergahlarini, yon oklari ve harita ustu yol yorum kutucuklarini ("yollarda yorum satiri") cizen sinif.
 */

export class RouteCanvasRenderer {
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
    const secMid = this.strokeGeoPath(ctx, projFn, sec.points, "#93c5fd", 3.0, [7, 5], maxJumpPx);
    // 2. MAVI YOL: En guvenli ve en kisa rota
    const priMid = this.strokeGeoPath(ctx, projFn, pri.points, "#2563eb", 4.5, [], maxJumpPx);

    if (showComments) {
      if (secMid) {
        this.drawRouteCommentBox(
          ctx, secMid.x, secMid.y + 22,
          sec.comment,
          "#93c5fd", viewW, viewH
        );
      }
      if (priMid) {
        this.drawRouteCommentBox(
          ctx, priMid.x, priMid.y - 22,
          pri.comment,
          "#2563eb", viewW, viewH
        );
      }
    }
  }

  /**
   * Cografik nokta listesini antimeridyen sicramalarini atlayarak cizer ve orta ekran noktasini doner
   */
  strokeGeoPath(ctx, projFn, geoPoints, color, width, dash, maxJumpPx = 240) {
    if (!geoPoints || geoPoints.length < 2) return null;
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

    if (screenPts.length === 0) return null;
    return screenPts[Math.floor(screenPts.length / 2)];
  }

  /**
   * Yakinlastirilmis krater ici EVA yuruyus rotasini (Mavi + Soluk Mavi + Yol Yorumu) cizer
   */
  drawCraterEvaRoutes(ctx, cx, cy, localZoom, routes, waypoints, selectedWp, showComments, viewW, viewH) {
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
      const pMid = pri.points[Math.floor(pri.points.length / 2)];
      const sMid = sec.points[Math.floor(sec.points.length / 2)];
      this.drawRouteCommentBox(ctx, cx + sMid.relX * localZoom, cy + sMid.relY * localZoom + 24, sec.comment, "#93c5fd", viewW, viewH);
      this.drawRouteCommentBox(ctx, cx + pMid.relX * localZoom, cy + pMid.relY * localZoom - 24, pri.comment, "#2563eb", viewW, viewH);
    }

    // Gorunur EVA duraklari
    for (const wp of waypoints) {
      const wx = cx + wp.relX * localZoom;
      const wy = cy + wp.relY * localZoom;
      if (wx < -40 || wx > viewW + 40 || wy < -40 || wy > viewH + 40) continue;
      const isSel = selectedWp && selectedWp.id === wp.id;

      ctx.beginPath();
      ctx.arc(wx, wy, isSel ? 8.5 : (wp.highlight ? 7.5 : 5.5), 0, Math.PI * 2);
      ctx.fillStyle = isSel ? "#ffffff" : (wp.highlight ? "#d92b2b" : "#2563eb");
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${wp.name} (${wp.elev}m)`, wx + 10, wy + 3);
    }
    ctx.restore();
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc Mavi ve Soluk Mavi rota ile harita ustu yol yorumu cizim sinifi.
   - Satir 11-33: drawRouteCommentBox; haritada yollarin uzerine sure/mesafe/guvenlik yorumu cizer.
   - Satir 38-64: drawGlobalDualRoutes; kuresel haritada Soluk Mavi uzun ve Mavi kisa guvenli yollari cizer.
   - Satir 69-101: strokeGeoPath; cografik rota noktalarini kesintisiz cizip orta noktasini bulur.
   - Satir 106-166: drawCraterEvaRoutes; yakinlastirilan krater icindeki Mavi/Soluk Mavi EVA rotalari, yorum kutulari ve durak pinlerini cizer.
   ========================================================================== */
