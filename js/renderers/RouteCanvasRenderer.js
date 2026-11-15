/**
 * @file RouteCanvasRenderer.js
 * @description Harita uzerinde Mavi (#2563eb - En Guvenli Kisa Yol) ve Soluk Mavi (#93c5fd - Guvenli Uzun Yol)
 * guzergahlarini, yon oklari ve harita ustu yol yorum kutucuklarini ("yollarda yorum satiri") cizen sinif.
 */

(function (ns) {
  "use strict";
  class RouteCanvasRenderer {
    _trimToWidth(ctx, str, maxW) {
      if (ctx.measureText(str).width <= maxW) return str;
      let s = str;
      while (s.length > 6 && ctx.measureText(`${s}…`).width > maxW) {
        s = s.slice(0, -1);
      }
      return `${s.trimEnd()}…`;
    }

    _layoutCommentLines(ctx, text, maxBoxW) {
      const padX = 18;
      const maxTextW = Math.max(120, maxBoxW - padX);
      const rawW = ctx.measureText(text).width;
      if (rawW <= maxTextW) {
        return { lines: [text], boxW: Math.ceil(rawW + padX), boxH: 22 };
      }

      let splitIdx = -1;
      for (const sep of [" [", " — ", ": "]) {
        const idx = text.indexOf(sep);
        if (idx > 8 && idx < text.length - 6 && ctx.measureText(text.slice(0, idx)).width <= maxTextW) {
          splitIdx = idx + (sep === ": " ? 2 : 1);
          break;
        }
      }
      if (splitIdx < 0) {
        let lo = Math.min(text.length - 1, Math.floor(text.length * 0.55));
        while (lo > 8 && (text[lo] !== " " || ctx.measureText(text.slice(0, lo)).width > maxTextW)) lo--;
        splitIdx = lo > 8 ? lo + 1 : Math.floor(text.length * 0.5);
      }

      const l1 = this._trimToWidth(ctx, text.slice(0, splitIdx).trim(), maxTextW);
      const l2 = this._trimToWidth(ctx, text.slice(splitIdx).trim(), maxTextW);
      if (!l2) {
        return { lines: [l1], boxW: Math.ceil(Math.min(maxBoxW, ctx.measureText(l1).width + padX)), boxH: 22 };
      }
      const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width);
      return { lines: [l1, l2], boxW: Math.ceil(Math.min(maxBoxW, w + padX)), boxH: 36 };
    }

    drawRoundedBox(ctx, bx, by, boxW, boxH, textOrLines, accentHex, labelHelper = null) {
      if (labelHelper && typeof labelHelper.drawRoundedPill === "function") {
        labelHelper.drawRoundedPill(ctx, bx, by, boxW, boxH, 7, accentHex, true);
      } else {
        ctx.save();
        ctx.fillStyle = "rgba(54, 70, 96, 0.90)";
        ctx.fillRect(bx, by, boxW, boxH);
        ctx.fillStyle = accentHex;
        ctx.fillRect(bx, by, 3.5, boxH);
        ctx.strokeStyle = accentHex;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(bx, by, boxW, boxH);
        ctx.restore();
      }
      ctx.save();
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      ctx.fillStyle = "#e8edf5";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const lines = Array.isArray(textOrLines) ? textOrLines : [textOrLines];
      if (lines.length >= 2) {
        ctx.fillText(lines[0], bx + 10, by + 11.5);
        ctx.fillText(lines[1], bx + 10, by + 24.5);
      } else {
        ctx.fillText(lines[0], bx + 10, by + boxH / 2 + 0.5);
      }
      ctx.restore();
    }

    /**
     * Harita uzerine yol yorum kutucugu (sure, mesafe ve yorum satiri) cizer
     */
    drawRouteCommentBox(ctx, x, y, text, accentHex, viewW, viewH, labelHelper = null) {
      if (x < -120 || x > viewW + 120 || y < -40 || y > viewH + 40) return null;
      ctx.save();
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      const { lines, boxW, boxH } = this._layoutCommentLines(ctx, text, Math.min(viewW - 20, 620));
      const rawX = x - boxW / 2;
      const rawY = y - boxH / 2;
      let bx = Math.max(8, Math.min(viewW - boxW - 8, rawX));
      let by = Math.max(8, Math.min(viewH - boxH - 8, rawY));

      if (labelHelper && typeof labelHelper.claimLabelSlot === "function") {
        const offsets = [
          [0, 0],
          [0, -24],
          [0, 40],
          [0, 68],
          [-(boxW * 0.55), -34],
          [boxW * 0.55, -34],
          [0, -56],
          [0, 96]
        ];
        const slot = labelHelper.claimLabelSlot(rawX, rawY, boxW, boxH, offsets, true);
        bx = slot.x;
        by = slot.y;
      }

      this.drawRoundedBox(ctx, bx, by, boxW, boxH, lines, accentHex, labelHelper);
      ctx.restore();
      return { x: bx, y: by, w: boxW, h: boxH };
    }

    /**
     * Ertelenmis rota yorum kutusunu yuksek oncelikli etiketler cizildikten sonra panellerle cakismayacak koridora yerlestirir
     */
    drawDeferredRouteComment(ctx, commentInfo, viewW, viewH, labelHelper = null) {
      if (!commentInfo || !commentInfo.text || !Array.isArray(commentInfo.pts) || commentInfo.pts.length === 0) return;
      const pts = commentInfo.pts.filter((pt) => pt && pt.x >= 12 && pt.x <= viewW - 12 && pt.y >= 12 && pt.y <= viewH - 12);
      const pool = pts.length > 0 ? pts : commentInfo.pts;
      if (pool.length === 0) return;

      ctx.save();
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      const basePt = pool[Math.floor(pool.length * 0.45)];
      const probeY = Math.max(16, Math.min(viewH - 44, basePt.y - 68));
      let laneMinX = 10;
      let laneMaxX = viewW - 10;
      for (const r of (labelHelper?._avoidRects || [])) {
        if (probeY + 38 <= r.y - 4 || probeY >= r.y + r.h + 4) continue;
        if (r.x + r.w * 0.5 < viewW * 0.5) laneMinX = Math.max(laneMinX, r.x + r.w + 8);
        else laneMaxX = Math.min(laneMaxX, r.x - 8);
      }
      if (laneMaxX - laneMinX < 220) { laneMinX = 10; laneMaxX = viewW - 10; }

      const maxAllowedW = Math.max(220, Math.min(laneMaxX - laneMinX - 4, 620));
      const { lines, boxW, boxH } = this._layoutCommentLines(ctx, commentInfo.text, maxAllowedW);
      const prefX = Math.max(laneMinX, Math.min(laneMaxX - boxW, basePt.x - boxW / 2));
      const prefY = Math.max(10, Math.min(viewH - boxH - 10, basePt.y - 68));

      let bx = Math.max(8, Math.min(viewW - boxW - 8, prefX));
      let by = Math.max(8, Math.min(viewH - boxH - 8, prefY));

      if (labelHelper && typeof labelHelper.claimLabelSlot === "function") {
        const offsets = [];
        const fractions = [0.45, 0.55, 0.35, 0.65, 0.25, 0.78];
        const relDeltas = [
          [0, 0],
          [0, 92],
          [-boxW * 0.45, 8],
          [boxW * 0.45, 8],
          [0, -34],
          [0, 126]
        ];
        for (const frac of fractions) {
          const ap = pool[Math.min(pool.length - 1, Math.floor(pool.length * frac))];
          const candX = Math.max(laneMinX, Math.min(laneMaxX - boxW, ap.x - boxW / 2));
          const dxBase = candX - prefX;
          const dyBase = (ap.y - 68) - prefY;
          for (const [ox, oy] of relDeltas) {
            offsets.push([dxBase + ox, dyBase + oy]);
          }
        }
        const slot = labelHelper.claimLabelSlot(prefX, prefY, boxW, boxH, offsets, true);
        bx = slot.x;
        by = slot.y;
      }

      const cx = bx + boxW / 2;
      const cy = by + boxH / 2;
      let nearest = basePt;
      let minDist = Infinity;
      for (const pt of pool) {
        const d = Math.hypot(pt.x - cx, pt.y - cy);
        if (d < minDist) {
          minDist = d;
          nearest = pt;
        }
      }

      const edgeX = Math.max(bx, Math.min(bx + boxW, nearest.x));
      const edgeY = Math.max(by, Math.min(by + boxH, nearest.y));
      if (Math.hypot(nearest.x - edgeX, nearest.y - edgeY) > 6) {
        this.drawLeaderLine(ctx, nearest.x, nearest.y, edgeX, edgeY, commentInfo.accentHex);
      }
      this.drawRoundedBox(ctx, bx, by, boxW, boxH, lines, commentInfo.accentHex, labelHelper);
      ctx.restore();
    }

    /**
     * Kuresel 2D veya 3D projeksiyonda tekil Mavi rotayi cizer (yorum kutusunu isterse erteler)
     */
    drawGlobalDualRoutes(ctx, projFn, routes, showComments, viewW, viewH, maxJumpPx = 240, labelHelper = null, deferComment = false) {
      if (!routes || !routes.primaryBlue) return null;
      const pri = routes.primaryBlue;

      const priPts = this.strokeGeoPath(ctx, projFn, pri.points, "#2563eb", 4.5, [], maxJumpPx);
      const commentInfo = (showComments && priPts.length > 0 && pri.comment)
        ? { pts: priPts, text: pri.comment, accentHex: "#2563eb" }
        : null;

      if (deferComment) return commentInfo;
      if (commentInfo) this.drawDeferredRouteComment(ctx, commentInfo, viewW, viewH, labelHelper);
      return null;
    }

    /**
     * Rota egri noktasi ile yorum kutusu arasina ince isaret cizgisi cizer
     */
    drawLeaderLine(ctx, x1, y1, x2, y2, color) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 3]);
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
    drawCraterEvaRoutes(ctx, cx, cy, localZoom, routes, waypoints, selectedWp, showComments, viewW, viewH, showWpLabels = true, labelHelper = null) {
      if (!routes || !routes.primaryBlue) return;
      const pri = routes.primaryBlue;
      const baseLat = routes.origin?.lat || 0;
      const baseLon = routes.origin?.lon || 0;
      const toRelX = (pt) => (typeof pt.relX === "number" ? pt.relX : ((pt.lon || 0) - baseLon) * 18);
      const toRelY = (pt) => (typeof pt.relY === "number" ? pt.relY : -((pt.lat || 0) - baseLat) * 18);

      ctx.save();
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 4.6;
      ctx.beginPath();
      const screenPts = [];
      pri.points.forEach((pt, idx) => {
        const sx = cx + toRelX(pt) * localZoom;
        const sy = cy + toRelY(pt) * localZoom;
        screenPts.push({ x: sx, y: sy });
        if (idx === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      // Gorunur EVA duraklari
      waypoints.forEach((wp) => {
        const wx = cx + wp.relX * localZoom;
        const wy = cy + wp.relY * localZoom;
        if (wx < -40 || wx > viewW + 40 || wy < -40 || wy > viewH + 40) return;
        const isSel = selectedWp && selectedWp.id === wp.id;

        ctx.beginPath();
        ctx.arc(wx, wy, isSel ? 7.5 : (wp.highlight ? 6.5 : 4.5), 0, Math.PI * 2);
        ctx.fillStyle = isSel ? "#f8fafc" : (wp.highlight ? "#dc362e" : "#3b82f6");
        ctx.fill();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = "#0f172a";
        ctx.stroke();
        labelHelper?.reserveRect?.(wx - 9, wy - 9, 18, 18);

        if (showWpLabels) {
          const wpLabel = `${wp.name} (${wp.elev}m)`;
          ctx.font = "800 10px 'Public Sans Web', sans-serif";
          if (labelHelper && typeof labelHelper.claimLabelSlot === "function") {
            const tw = ctx.measureText(wpLabel).width;
            const boxW = Math.ceil(tw + 14);
            const boxH = 19;
            const preferLeft = wx > viewW - 560 || wp.relX > 75;
            const offsets = preferLeft
              ? [[-(boxW + 12), -9.5], [12, -9.5], [-boxW / 2, -26], [-boxW / 2, 12]]
              : [[12, -9.5], [-(boxW + 12), -9.5], [-boxW / 2, -26], [-boxW / 2, 12]];
            const slot = labelHelper.claimLabelSlot(wx, wy, boxW, boxH, offsets, false);
            if (slot.placed) {
              const acc = isSel ? "#dc362e" : (wp.highlight ? "#dc362e" : "#3b82f6");
              labelHelper.drawRoundedPill(ctx, slot.x, slot.y, boxW, boxH, 6, acc, Boolean(isSel || wp.highlight));
              ctx.fillStyle = "#e8edf5";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillText(wpLabel, slot.x + 8, slot.y + boxH / 2 + 0.5);
            }
          } else {
            const alignLeftSide = wx > viewW - 560 || wp.relX > 75 || (Math.abs(wp.relY) < 25 && wp.relX < 0 && wp.relX > -65);
            const tx = alignLeftSide ? wx - 11 : wx + 11;
            const ty = wy + 3;
            ctx.textAlign = alignLeftSide ? "right" : "left";
            ctx.strokeStyle = "rgba(2, 6, 14, 0.90)";
            ctx.lineWidth = 3;
            ctx.lineJoin = "round";
            ctx.strokeText(wpLabel, tx, ty);
            ctx.fillStyle = "#e8edf5";
            ctx.fillText(wpLabel, tx, ty);
          }
        }
      });

      if (showComments && screenPts.length > 0 && pri.comment) {
        this.drawDeferredRouteComment(ctx, { pts: screenPts, text: pri.comment, accentHex: "#2563eb" }, viewW, viewH, labelHelper);
      }
      ctx.restore();
    }

    /**
     * Ortak seferde Mavi rota uzerinde katedilen parlak izi, birlikte ilerleyen Rover+Insan isaretcisini ve canli telemetri etiketini cizer
     */
    drawDemoSimulation(ctx, projFn, routes, demoSim, viewW, viewH, maxJumpPx = 240, labelHelper = null, drawBadge = true) {
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

      if (!drawBadge) return;
      this.drawDemoVehicleBadge(ctx, projFn, demoSim, viewW, viewH, labelHelper);
    }

    drawDemoVehicleBadge(ctx, projFn, demoSim, viewW, viewH, labelHelper = null) {
      if (!demoSim || !demoSim.active || !demoSim.ready) return;
      const p = projFn(demoSim.lat, demoSim.lon);
      if (!p || !p.visible || p.x < -60 || p.x > viewW + 60 || p.y < -60 || p.y > viewH + 60) return;

      const pulse = 0.5 + 0.5 * Math.sin(demoSim.pulsePhase || 0);
      const ringR = 16 + pulse * 9;
      const mode = demoSim.expeditionMode || (demoSim.vehicle === "astronaut" ? "joint-eva-escort" : "rover-crew");
      const isEscort = mode === "joint-eva-escort";

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = isEscort
        ? `rgba(37, 99, 235, ${(0.82 - pulse * 0.52).toFixed(2)})`
        : `rgba(217, 43, 43, ${(0.82 - pulse * 0.52).toFixed(2)})`;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      const badgeR = isEscort ? 15.5 : 13.5;
      const badgeAccent = isEscort ? "#3b82f6" : "#e03e36";
      ctx.beginPath();
      ctx.arc(p.x, p.y, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = "#34435c";
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = badgeAccent;
      ctx.stroke();
      labelHelper?.reserveRect?.(p.x - (badgeR + 2), p.y - (badgeR + 2), (badgeR + 2) * 2, (badgeR + 2) * 2);

      if (isEscort) {
        // Rover + Yaya EVA: sol tarafta eslikci basincli rover, altin guvenlik halati ve sag tarafta yuruyen astronot
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(p.x - 4.0, p.y + 1.0);
        ctx.lineTo(p.x + 4.5, p.y + 1.0);
        ctx.stroke();

        // Mini Eslikci Basincli Rover
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(p.x - 11.2, p.y - 2.6, 8.2, 4.4);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(p.x - 6.0, p.y - 4.2, 3.0, 1.8);
        ctx.fillStyle = "#e8edf5";
        ctx.beginPath();
        ctx.arc(p.x - 9.4, p.y + 3.2, 1.5, 0, Math.PI * 2);
        ctx.arc(p.x - 4.8, p.y + 3.2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Eslikteki Yaya EVA Astronotu
        ctx.fillStyle = "#e8edf5";
        ctx.beginPath();
        ctx.arc(p.x + 7.2, p.y - 3.6, 3.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(p.x + 5.5, p.y - 4.5, 3.4, 1.6);
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(p.x + 4.6, p.y + 4.8);
        ctx.lineTo(p.x + 6.4, p.y - 0.5);
        ctx.lineTo(p.x + 8.0, p.y - 0.5);
        ctx.lineTo(p.x + 9.8, p.y + 4.8);
        ctx.stroke();
      } else {
        // Rover + Ekip: Genis Basincli Rover kabini icinde yan yana gorunen 2 astronot kaski ve tekerlekler
        ctx.fillStyle = "#94a3b8";
        ctx.fillRect(p.x - 8.2, p.y - 1.5, 16.4, 5.2);
        ctx.fillStyle = "#dc362e";
        ctx.fillRect(p.x - 6.2, p.y - 5.2, 1.8, 3.7);
        ctx.fillStyle = "#38bdf8";
        ctx.fillRect(p.x - 4.2, p.y - 5.6, 10.2, 3.8);
        // Kabin icindeki ekip kasklari
        ctx.fillStyle = "#f8fafc";
        ctx.beginPath();
        ctx.arc(p.x - 1.2, p.y - 3.7, 1.5, 0, Math.PI * 2);
        ctx.arc(p.x + 3.0, p.y - 3.7, 1.5, 0, Math.PI * 2);
        ctx.fill();
        // 3 cift rover tekerlegi
        ctx.fillStyle = "#e8edf5";
        ctx.beginPath();
        ctx.arc(p.x - 5.5, p.y + 5.2, 2.0, 0, Math.PI * 2);
        ctx.arc(p.x, p.y + 5.2, 2.0, 0, Math.PI * 2);
        ctx.arc(p.x + 5.5, p.y + 5.2, 2.0, 0, Math.PI * 2);
        ctx.fill();
      }

      const tagPrefix = isEscort ? "ROVER+EVA" : "ROVER+EKİP";
      const o2PctTxt = Number.isFinite(demoSim.o2Pct) ? ` (%${Math.round(demoSim.o2Pct)})` : "";
      const energyTxt = Number.isFinite(demoSim.remainingEnergyKwh) ? ` · ${demoSim.remainingEnergyKwh.toFixed(1)}kWh` : "";
      const tag = `${tagPrefix} ${demoSim.progressPct}% · ${demoSim.traveledKm.toFixed(1)} km · ${demoSim.remainingO2L}L${o2PctTxt}${energyTxt}`;
      ctx.font = "800 10px 'Public Sans Web', sans-serif";
      const tw = ctx.measureText(tag).width;
      const boxW = Math.ceil(tw + 18);
      const boxH = 22;
      let bx = Math.max(8, Math.min(viewW - boxW - 8, p.x - boxW / 2));
      let by = Math.max(8, Math.min(viewH - boxH - 8, p.y - 44));

      if (labelHelper && typeof labelHelper.claimLabelSlot === "function") {
        const offsets = [
          [0, 0],
          [0, 62],
          [boxW * 0.5 + 18, 22],
          [-(boxW * 0.5 + 18), 22],
          [0, -24],
          [0, 86]
        ];
        const slot = labelHelper.claimLabelSlot(p.x - boxW / 2, p.y - 44, boxW, boxH, offsets, true);
        bx = slot.x;
        by = slot.y;
      }

      const edgeX = Math.max(bx, Math.min(bx + boxW, p.x));
      const edgeY = Math.max(by, Math.min(by + boxH, p.y));
      if (Math.hypot(p.x - edgeX, p.y - edgeY) > 16) {
        this.drawLeaderLine(ctx, p.x, p.y, edgeX, edgeY, badgeAccent);
      }
      this.drawRoundedBox(ctx, bx, by, boxW, boxH, tag, badgeAccent, labelHelper);
      ctx.restore();
    }
  }

  ns.RouteCanvasRenderer = RouteCanvasRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc Mavi ve Soluk Mavi rota ile harita ustu yol yorumu cizim sinifi.
   - Satir 7-48: _trimToWidth ve _layoutCommentLines; uzun rota yorumlarini paneller arasi genislige gore 1-2 satira boler/kisaltir.
   - Satir 50-111: drawRoundedBox ve drawRouteCommentBox; Obsidian Space Telemetry tarzinda golgeli, sol seritli 1-2 satirli yol yorum kutulari cizer.
   - Satir 113-204: drawDeferredRouteComment ve drawGlobalDualRoutes; _avoidRects arasi koridora sigan rota yorumunu ve Mavi rotayi cizer.
   - Satir 206-255: drawLeaderLine ve strokeGeoPath; kesikli isaret cizgisi ile antimeridyen sicramasiz guzergah cizer.
   - Satir 257-337: drawCraterEvaRoutes; krater icindeki Mavi EVA rotasini, Obsidian hap durak etiketlerini ve ertelenmis yorumu cizer.
   - Satir 339-488: drawDemoSimulation ve drawDemoVehicleBadge; Obsidian koyu cam disk uzerinde Rover+Ekip / Rover+Yaya EVA rozetini ve cakismasiz %O2/kWh telemetri hapini cizer.
   ========================================================================== */
