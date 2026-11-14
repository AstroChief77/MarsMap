/**
 * @file CraterCanvasRenderer.js
 * @description Yakınlaştırılmış hiper-yerel Mars Krater yüzeyini 2D/3D modlarında çizen motor.
 * MOLA konturları, THEMIS termal, USGS Boxwork sırtları, asit yağmuru, kum kasırgası filtreleri ve EVA rotalarını işler.
 */

export class CraterCanvasRenderer {
  /**
   * CraterCanvasRenderer yapıcı metodu
   */
  constructor() {
    this.textureCache = new Map();
  }

  /**
   * Seçili krater için prosedürel yüksek detaylı yüzey dokusu oluşturur (önbellekli)
   * @param {string} craterId - Krater kimliği
   * @returns {HTMLCanvasElement} Önbelleklenmiş doku tuvali
   */
  getOrCreateTerrainTexture(craterId) {
    if (this.textureCache.has(craterId)) {
      return this.textureCache.get(craterId);
    }

    const size = 512;
    const offscreen = document.createElement("canvas");
    offscreen.width = size;
    offscreen.height = size;
    const octx = offscreen.getContext("2d");
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.43;

    // 1. Ejecta dış krater püskürtü çemberi
    const ejecta = octx.createRadialGradient(cx, cy, r * 0.85, cx, cy, size * 0.5);
    ejecta.addColorStop(0, "rgba(130, 62, 38, 0.85)");
    ejecta.addColorStop(0.65, "rgba(65, 32, 22, 0.42)");
    ejecta.addColorStop(1, "rgba(0, 0, 0, 0)");
    octx.fillStyle = ejecta;
    octx.fillRect(0, 0, size, size);

    // 2. Krater ana çanağı (Kuzeybatı güneş ışığı, Güneydoğu krater duvarı gölgesi)
    const floorGrad = octx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (craterId === "korolev-crater") {
      floorGrad.addColorStop(0, "#8c5642");
      floorGrad.addColorStop(0.5, "#563225");
      floorGrad.addColorStop(1, "#22120c");
    } else {
      floorGrad.addColorStop(0, "#b15d3e");
      floorGrad.addColorStop(0.45, "#783a24");
      floorGrad.addColorStop(1, "#2b150d");
    }
    octx.fillStyle = floorGrad;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.fill();

    // 3. Krater içi mikro kratercikler ve regolit taş dokusu
    for (let i = 0; i < 85; i++) {
      const angle = i * 2.39996;
      const dist = Math.sqrt(i / 85) * (r * 0.88);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const pr = 1.6 + (i % 6);

      octx.fillStyle = i % 2 === 0 ? "rgba(255, 175, 130, 0.16)" : "rgba(12, 6, 4, 0.36)";
      octx.beginPath();
      octx.arc(px, py, pr, 0, Math.PI * 2);
      octx.fill();
    }

    // 4. Kratere özgü jeomorfolojik detaylar
    if (craterId === "gale-crater") {
      for (let step = 5; step >= 1; step--) {
        const mr = (r * 0.48) * (step / 5);
        octx.fillStyle = step === 1 ? "#cc7d56" : `rgba(${145 - step * 14}, ${72 - step * 8}, ${45 - step * 4}, 0.9)`;
        octx.beginPath();
        octx.arc(cx + 14, cy + 8, mr, 0, Math.PI * 2);
        octx.fill();
        octx.strokeStyle = "rgba(0, 0, 0, 0.32)";
        octx.lineWidth = 1.3;
        octx.stroke();
      }
    } else if (craterId === "jezero-crater") {
      octx.strokeStyle = "rgba(38, 19, 12, 0.85)";
      octx.lineWidth = 14;
      octx.beginPath();
      octx.moveTo(cx - r * 1.05, cy - r * 0.45);
      octx.quadraticCurveTo(cx - r * 0.65, cy - r * 0.2, cx - r * 0.25, cy - r * 0.05);
      octx.stroke();

      const deltaGrad = octx.createRadialGradient(cx - r * 0.25, cy - r * 0.05, 5, cx, cy, r * 0.55);
      deltaGrad.addColorStop(0, "rgba(205, 138, 102, 0.88)");
      deltaGrad.addColorStop(1, "rgba(110, 60, 40, 0)");
      octx.fillStyle = deltaGrad;
      octx.beginPath();
      octx.arc(cx - r * 0.1, cy + r * 0.05, r * 0.52, 0, Math.PI * 2);
      octx.fill();
    } else if (craterId === "korolev-crater") {
      const iceGrad = octx.createRadialGradient(cx, cy, 10, cx, cy, r * 0.7);
      iceGrad.addColorStop(0, "#ffffff");
      iceGrad.addColorStop(0.72, "#dbeafe");
      iceGrad.addColorStop(1, "rgba(191, 219, 254, 0.12)");
      octx.fillStyle = iceGrad;
      octx.beginPath();
      octx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
      octx.fill();
    }

    // 5. Krater dış kenar duvarı (Rim Scarp)
    octx.strokeStyle = "rgba(255, 160, 115, 0.7)";
    octx.lineWidth = 3.5;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.stroke();

    this.textureCache.set(craterId, offscreen);
    return offscreen;
  }

  /**
   * Ana yerel krater çizim fonksiyonu (arka plandaki yıldızları şeffaf bırakır)
   */
  render(ctx, state) {
    const {
      width, height, panX, panY, zoom, activeCrater, layers,
      viewMode, filterAcidRain, filterDustStorm, waypoints,
      selectedWaypoint, terrainExaggeration, basemapOpacity,
      showGraticule, showNomenclature, measurePoints
    } = state;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2 + panX;
    const centerY = height / 2 + panY;
    const localZoom = Math.max(0.7, zoom * 0.85);
    const radius = Math.min(width, height) * 0.39 * localZoom;
    const is3D = viewMode === "3d";
    const exag = terrainExaggeration || 1.0;

    // İsteğe bağlı koordinat graticule ağı (zemin)
    if (showGraticule) {
      this.drawLocalGraticule(ctx, width, height, centerX, centerY, localZoom);
    }

    ctx.save();
    if (is3D) {
      ctx.translate(centerX, centerY);
      ctx.scale(1.12, 0.56);
      ctx.translate(-centerX, -centerY);
    }

    // 1. Optik Mars Krater Yüzey Dokusu
    if (layers.optical) {
      ctx.save();
      ctx.globalAlpha = basemapOpacity ?? 1.0;
      const tex = this.getOrCreateTerrainTexture(activeCrater.id);
      const texSize = radius * 2.34;
      ctx.drawImage(tex, centerX - texSize / 2, centerY - texSize / 2, texSize, texSize);
      ctx.restore();
    }

    // 2. MOLA Topografik DEM Konturları
    if (layers.topography) {
      this.drawTopographyContours(ctx, centerX, centerY, radius, activeCrater.elevation_datum_m);
    }

    // 3. THEMIS Termal Kızılötesi Kaya Yoğunluğu
    if (layers.thermal) {
      this.drawThermalOverlay(ctx, centerX, centerY, radius);
    }

    // 4. USGS Jeoloji & 2025-26 Boxwork Sırtları
    if (layers.geology) {
      this.drawGeologyOverlay(ctx, centerX, centerY, radius, localZoom, activeCrater.id, showNomenclature);
    }

    // 5. Sol Alt Filtre: Asit Yağmuru / Asidik Sülfat Sisi
    if (filterAcidRain) {
      this.drawAcidRainFilter(ctx, centerX, centerY, radius);
    }

    // 6. Sol Alt Filtre: Kum Yağmuru / Kasırga Rüzgar Jeti
    if (filterDustStorm) {
      this.drawDustStormFilter(ctx, centerX, centerY, radius);
    }

    // 7. 2D Görünüm EVA Rotası
    if (layers.evaRoute && !is3D) {
      this.drawEvaRoute2D(ctx, centerX, centerY, localZoom, waypoints, selectedWaypoint, filterAcidRain, filterDustStorm);
    }

    ctx.restore();

    // 8. 3D Modunda dikey yükselti sütunları (Terrain Exaggeration çarpanı ile)
    if (is3D) {
      this.draw3DElevationOverlays(
        ctx, centerX, centerY, localZoom, activeCrater, waypoints,
        selectedWaypoint, layers.evaRoute, filterAcidRain, filterDustStorm, exag
      );
    }

    // 9. Aktif Mesafe Ölçüm Cetveli (Trek Calculate Distance aracı)
    if (measurePoints && measurePoints.length > 0) {
      this.drawMeasureRuler(ctx, centerX, centerY, localZoom, is3D, measurePoints, exag);
    }
  }

  /**
   * Enlem/boylam ızgarası çizer (Graticule)
   */
  drawLocalGraticule(ctx, w, h, cx, cy, zoom) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 0.8;
    const step = 64 * zoom;
    for (let x = cx % step; x < w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = cy % step; y < h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * MOLA Topografik eşyükselti halkalarını çizer
   */
  drawTopographyContours(ctx, cx, cy, r, datumElev) {
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const stepR = (r / (steps + 0.5)) * i;
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.24 + i * 0.08})`;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, stepR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = "#38bdf8";
      ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText(`${Math.round(datumElev + i * 320)}m`, cx + stepR - 14, cy - 5);
    }
  }

  /**
   * THEMIS Termal Kızılötesi yoğunluk katmanı
   */
  drawThermalOverlay(ctx, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.36;
    const grad = ctx.createRadialGradient(cx + 25, cy - 15, 10, cx, cy, r * 0.85);
    grad.addColorStop(0, "#a855f7");
    grad.addColorStop(0.55, "#3b82f6");
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * USGS Jeoloji ve 2025-26 Boxwork Mineral Ağları katmanı
   */
  drawGeologyOverlay(ctx, cx, cy, r, zoom, craterId, showLabels) {
    if (craterId !== "gale-crater") return;
    ctx.save();
    const boxX = cx + 95 * zoom;
    const boxY = cy + 72 * zoom;
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 2]);

    for (let off = -22; off <= 22; off += 11) {
      ctx.beginPath();
      ctx.moveTo(boxX + off * zoom, boxY - 18 * zoom);
      ctx.lineTo(boxX + off * zoom, boxY + 18 * zoom);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(boxX - 18 * zoom, boxY + off * zoom);
      ctx.lineTo(boxX + 18 * zoom, boxY + off * zoom);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (showLabels) {
      ctx.fillStyle = "#facc15";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText("⚑ BOXWORK RİTJLERİ", boxX - 45, boxY - 24 * zoom);
    }
    ctx.restore();
  }

  /**
   * Asit Yağmuru & Korozif Sülfat Sisi Filtresi katmanı
   */
  drawAcidRainFilter(ctx, cx, cy, r) {
    ctx.save();
    const acidX = cx + r * 0.28;
    const acidY = cy + r * 0.22;
    const acidGrad = ctx.createRadialGradient(acidX, acidY, 8, acidX, acidY, r * 0.44);
    acidGrad.addColorStop(0, "rgba(245, 158, 11, 0.45)");
    acidGrad.addColorStop(0.7, "rgba(234, 179, 8, 0.2)");
    acidGrad.addColorStop(1, "rgba(234, 179, 8, 0)");

    ctx.fillStyle = acidGrad;
    ctx.beginPath();
    ctx.arc(acidX, acidY, r * 0.44, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(acidX, acidY, r * 0.36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillText("⚗ ASİT YAĞMURU / SÜLFAT SİSİ (pH 2.4)", acidX - 85, acidY + r * 0.43);
    ctx.restore();
  }

  /**
   * Kum Yağmuru & Kasırga / Toz Fırtınası Filtresi katmanı
   */
  drawDustStormFilter(ctx, cx, cy, r) {
    ctx.save();
    const stormX = cx - r * 0.3;
    const stormY = cy + r * 0.1;

    const stormGrad = ctx.createRadialGradient(stormX, stormY, 5, stormX, stormY, r * 0.5);
    stormGrad.addColorStop(0, "rgba(220, 38, 38, 0.44)");
    stormGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
    ctx.fillStyle = stormGrad;
    ctx.beginPath();
    ctx.arc(stormX, stormY, r * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.4;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.85, cy + r * 0.48);
    ctx.lineTo(stormX + 20, stormY - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#f87171";
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillText("🌪 KUM FIRTINASI / KASIRGA (TAU 3.4)", cx - r * 0.82, cy + r * 0.56);
    ctx.restore();
  }

  /**
   * 2D Görünüm EVA rotası ve istasyonları çizer
   */
  drawEvaRoute2D(ctx, cx, cy, zoom, waypoints, selectedWaypoint, filterAcid, filterStorm) {
    if (!waypoints.length) return;
    ctx.save();

    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const isStormHazard = filterStorm && (p1.stormRisk || p2.stormRisk);
      const isAcidHazard = filterAcid && (p1.acidRisk || p2.acidRisk);

      ctx.strokeStyle = isStormHazard ? "#ef4444" : (isAcidHazard ? "#f59e0b" : "#22c55e");
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(cx + p1.relX * zoom, cy + p1.relY * zoom);
      ctx.lineTo(cx + p2.relX * zoom, cy + p2.relY * zoom);
      ctx.stroke();
    }

    waypoints.forEach((wp) => {
      const x = cx + wp.relX * zoom;
      const y = cy + wp.relY * zoom;
      const isSelected = selectedWaypoint && selectedWaypoint.id === wp.id;

      ctx.beginPath();
      ctx.arc(x, y, (wp.highlight ? 9 : 6.5), 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : (wp.highlight ? "#e03c31" : "#22c55e");
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText(wp.name, x + 11, y + 4);
    });

    ctx.restore();
  }

  /**
   * 3D Perspektif Modunda Terrain Exaggeration dikey yükselti sütunlarını çizer
   */
  draw3DElevationOverlays(ctx, cx, cy, zoom, crater, waypoints, selectedWaypoint, showRoute, filterAcid, filterStorm, exag) {
    ctx.save();
    if (crater.id === "gale-crater") {
      const peakBaseY = cy + 8 * 0.56;
      const peakTopY = peakBaseY - 70 * zoom * exag;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx + 14 * 1.12, peakBaseY);
      ctx.lineTo(cx + 14 * 1.12, peakTopY);
      ctx.stroke();

      ctx.fillStyle = "#e03c31";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText("▲ MOUNT SHARP ZİRVE (5.5 KM)", cx - 55, peakTopY - 6);
    }

    if (!showRoute || !waypoints.length) {
      ctx.restore();
      return;
    }

    const projPoints = waypoints.map((wp) => {
      const gx = cx + wp.relX * zoom * 1.12;
      const gy = cy + wp.relY * zoom * 0.56;
      const elevOffset = Math.max(10, ((wp.elev + 4600) / 26) * zoom * exag);
      return { wp, gx, gy, tx: gx, ty: gy - elevOffset };
    });

    for (let i = 0; i < projPoints.length - 1; i++) {
      const a = projPoints[i];
      const b = projPoints[i + 1];
      const isStormHazard = filterStorm && (a.wp.stormRisk || b.wp.stormRisk);
      const isAcidHazard = filterAcid && (a.wp.acidRisk || b.wp.acidRisk);

      ctx.strokeStyle = isStormHazard ? "#ef4444" : (isAcidHazard ? "#f59e0b" : "#22c55e");
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(a.tx, a.ty);
      ctx.lineTo(b.tx, b.ty);
      ctx.stroke();
    }

    projPoints.forEach(({ wp, gx, gy, tx, ty }) => {
      const isSelected = selectedWaypoint && selectedWaypoint.id === wp.id;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(tx, ty, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : (wp.highlight ? "#e03c31" : "#22c55e");
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText(`${wp.name} (${wp.elev}m)`, tx + 10, ty + 3);
    });

    ctx.restore();
  }

  /**
   * Mars Trek Calculate Distance mesafe ölçüm cetvelini çizer
   */
  drawMeasureRuler(ctx, cx, cy, zoom, is3D, points, exag) {
    if (points.length < 1) return;
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#e03c31";
    ctx.lineWidth = 2;
    const screenPts = points.map((pt) => {
      const sx = cx + pt.relX * zoom * (is3D ? 1.12 : 1.0);
      const sy = cy + pt.relY * zoom * (is3D ? 0.56 : 1.0) - (is3D ? 18 * exag : 0);
      return { sx, sy };
    });

    ctx.beginPath();
    screenPts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy)));
    ctx.stroke();

    screenPts.forEach((p) => {
      ctx.beginPath(); ctx.arc(p.sx, p.sy, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    });

    if (screenPts.length >= 2) {
      let totalKm = 0;
      for (let i = 0; i < points.length - 1; i++) {
        totalKm += Math.hypot(points[i + 1].relX - points[i].relX, points[i + 1].relY - points[i].relY) * 0.085;
      }
      const last = screenPts[screenPts.length - 1];
      ctx.font = "bold 11px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`Ruler: ${totalKm.toFixed(2)} km EVA`, last.sx + 10, last.sy - 8);
    }
    ctx.restore();
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc hiper-yerel krater çizim motoru tanıtımı.
   - Satır 7-13: CraterCanvasRenderer yapıcısı; doku önbelleği başlatılır.
   - Satır 15-113: getOrCreateTerrainTexture; krater çanağı, Mount Sharp, Neretva deltası ve Korolev buzulu yüzey dokularını önbellekli oluşturur.
   - Satır 115-189: render; arka plan yıldızlarını görünür tutarak 2D/3D eğim, MOLA, THEMIS, Boxwork, asit/fırtına filtreleri ve cetvel aracını çizer.
   - Satır 191-294: drawLocalGraticule, drawTopographyContours, drawThermalOverlay, drawGeologyOverlay, drawAcidRainFilter, drawDustStormFilter katman yardımcıları.
   - Satır 296-393: drawEvaRoute2D, draw3DElevationOverlays (Terrain Exaggeration destekli), drawMeasureRuler EVA rota ve mesafe çizim fonksiyonları.
   ========================================================================== */
