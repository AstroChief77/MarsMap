/**
 * @file CraterCanvasRenderer.js
 * @description Yaklaştıkça kademeli render (Progressive LOD & Viewport Culling) yapan krater çizim motoru.
 * Sadece ekranda görünen alanı çizer; Mavi (kısa güvenli yol), Soluk Mavi (uzun güvenli yol)
 * ve Alfa/Beta/Gama Foton Bombardıman alanlarını 2D/3D modlarında görselleştirir.
 */

export class CraterCanvasRenderer {
  /**
   * CraterCanvasRenderer yapıcı metodu
   */
  constructor() {
    this.textureCache = new Map();
  }

  /**
   * Görünür ekran kırpma kontrolü (Viewport Culling):
   * Kural gereği yalnızca ekrandaki görünür pencereye düşen detaylar çizilir, tamamı render edilmez.
   */
  isInsideViewport(x, y, margin, width, height) {
    return x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;
  }

  /**
   * Yakınlaştırma ölçeğine göre Level-of-Detail (LOD) kademesini hesaplar
   */
  computeLodTier(zoom, progressiveEnabled) {
    if (!progressiveEnabled) return 3;
    if (zoom < 1.25) return 1;      // LOD 1: Genel krater silüeti + ana rota
    if (zoom < 1.95) return 2;      // LOD 2: MOLA konturları + Radyasyon/Foton + Orta ölçek ızgara
    return 3;                       // LOD 3: Hiper-yerel kayaç/ventifact + Boxwork matrisi + segment saat/km etiketleri
  }

  /**
   * Seçili krater için temel doku tuvali oluşturur (önbellekli)
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

    const ejecta = octx.createRadialGradient(cx, cy, r * 0.85, cx, cy, size * 0.5);
    ejecta.addColorStop(0, "rgba(130, 62, 38, 0.85)");
    ejecta.addColorStop(0.65, "rgba(65, 32, 22, 0.42)");
    ejecta.addColorStop(1, "rgba(0, 0, 0, 0)");
    octx.fillStyle = ejecta;
    octx.fillRect(0, 0, size, size);

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

    octx.strokeStyle = "rgba(255, 160, 115, 0.7)";
    octx.lineWidth = 3.5;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.stroke();

    this.textureCache.set(craterId, offscreen);
    return offscreen;
  }

  /**
   * Ana yerel krater çizim fonksiyonu (Ölçekli LOD + Görünür Pencere Kırpma + Mavi/Soluk Mavi Rotalar)
   */
  render(ctx, state) {
    const {
      width, height, panX, panY, zoom, activeCrater, layers,
      viewMode, filterAcidRain, filterDustStorm, waypoints,
      selectedWaypoint, terrainExaggeration, basemapOpacity,
      showGraticule, showNomenclature, progressiveLodRender,
      showRadiationZones, radiationZones, computedRoutes
    } = state;

    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2 + panX;
    const centerY = height / 2 + panY;
    const localZoom = Math.max(0.7, zoom * 0.85);
    const radius = Math.min(width, height) * 0.39 * localZoom;
    const is3D = viewMode === "3d";
    const exag = terrainExaggeration || 1.0;
    const lodTier = this.computeLodTier(zoom, progressiveLodRender);

    // Görünür pencere kırpma bölgesi (sadece viewport içi çizim)
    if (showGraticule) {
      this.drawViewportGraticule(ctx, width, height, centerX, centerY, localZoom);
    }

    ctx.save();
    if (is3D) {
      ctx.translate(centerX, centerY);
      ctx.scale(1.12, 0.56);
      ctx.translate(-centerX, -centerY);
    }

    // 1. Optik Krater Yüzey Dokusu
    if (layers.optical) {
      ctx.save();
      ctx.globalAlpha = basemapOpacity ?? 1.0;
      const tex = this.getOrCreateTerrainTexture(activeCrater.id);
      const texSize = radius * 2.34;
      ctx.drawImage(tex, centerX - texSize / 2, centerY - texSize / 2, texSize, texSize);
      ctx.restore();
    }

    // 2. LOD 3 Yakınlaştırmada Yalnızca Görünür Alan Kayaç Detayları (Viewport Culled Micro-Rocks)
    if (lodTier >= 3 && layers.optical) {
      this.drawLodMicroTerrain(ctx, centerX, centerY, radius, localZoom, width, height, is3D);
    }

    // 3. LOD >= 2 MOLA Topografik DEM Konturları (metre bazlı)
    if (layers.topography && lodTier >= 2) {
      this.drawTopographyContours(ctx, centerX, centerY, radius, activeCrater.elevation_datum_m, width, height);
    }

    // 4. THEMIS Termal Kızılötesi
    if (layers.thermal) {
      this.drawThermalOverlay(ctx, centerX, centerY, radius);
    }

    // 5. USGS Boxwork Jeolojisi (LOD >= 2 ve görünür alandaysa çizilir)
    if (layers.geology && lodTier >= 2) {
      this.drawGeologyOverlay(ctx, centerX, centerY, localZoom, activeCrater.id, showNomenclature, width, height);
    }

    // 6. KURAL: Alfa / Beta / Gama Radyasyon ve Foton Bombardımanı Alanları
    if (showRadiationZones && radiationZones && radiationZones.length) {
      this.drawRadiationPhotonZones(ctx, centerX, centerY, localZoom, radiationZones, lodTier, width, height);
    }

    // 7. Sol Alt Filtreler: Asit Yağmuru & Kum Kasırgası
    if (filterAcidRain) {
      this.drawAcidRainFilter(ctx, centerX, centerY, radius);
    }
    if (filterDustStorm) {
      this.drawDustStormFilter(ctx, centerX, centerY, radius);
    }

    // 8. 2D Görünüm Çift Rota (Mavi: Kısa En Güvenli, Soluk Mavi: Uzun Alternatif)
    if (layers.evaRoute && !is3D) {
      this.drawDualRoutes2D(ctx, centerX, centerY, localZoom, computedRoutes, waypoints, selectedWaypoint, lodTier, width, height);
    }

    ctx.restore();

    // 9. 3D Görünüm Yükseltilmiş Sütunlar ve Çift Rota
    if (is3D) {
      this.draw3DElevationOverlays(
        ctx, centerX, centerY, localZoom, activeCrater, waypoints,
        selectedWaypoint, layers.evaRoute, computedRoutes, exag, lodTier, width, height
      );
    }

    return lodTier;
  }

  /**
   * Yaklaşıldığında yalnızca ekranda kalan kareleri render eden mikro kayaç/krater katmanı (LOD 3)
   */
  drawLodMicroTerrain(ctx, cx, cy, radius, zoom, viewW, viewH, is3D) {
    ctx.save();
    for (let i = 0; i < 90; i++) {
      const ang = i * 2.39996;
      const dist = Math.sqrt(i / 90) * (radius * 0.88);
      const wx = cx + Math.cos(ang) * dist;
      const wy = cy + Math.sin(ang) * dist;

      // Görünür pencere projeksiyonu ve frustum kırpma
      const syScreen = is3D ? cy + (wy - cy) * 0.56 : wy;
      const sxScreen = is3D ? cx + (wx - cx) * 1.12 : wx;
      if (!this.isInsideViewport(sxScreen, syScreen, 25, viewW, viewH)) continue;

      const rr = (1.8 + (i % 4)) * Math.min(zoom * 0.65, 2.2);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255, 190, 145, 0.22)" : "rgba(15, 8, 5, 0.42)";
      ctx.beginPath();
      ctx.arc(wx, wy, rr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Sadece ekran içi graticule çizgileri
   */
  drawViewportGraticule(ctx, w, h, cx, cy, zoom) {
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
   * MOLA Topografik kontur halkaları
   */
  drawTopographyContours(ctx, cx, cy, r, datumElev, viewW, viewH) {
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const stepR = (r / (steps + 0.5)) * i;
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.22 + i * 0.06})`;
      ctx.lineWidth = 1.1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, stepR, 0, Math.PI * 2);
      ctx.stroke();

      const lx = cx + stepR - 14;
      const ly = cy - 5;
      if (this.isInsideViewport(lx, ly, 40, viewW, viewH)) {
        ctx.setLineDash([]);
        ctx.fillStyle = "#38bdf8";
        ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
        ctx.fillText(`${Math.round(datumElev + i * 320)}m`, lx, ly);
      }
    }
    ctx.setLineDash([]);
  }

  /**
   * THEMIS Termal Kızılötesi katmanı
   */
  drawThermalOverlay(ctx, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.34;
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
   * USGS Boxwork Mineral Sırtları (görünür penceredeyse render edilir)
   */
  drawGeologyOverlay(ctx, cx, cy, zoom, craterId, showLabels, viewW, viewH) {
    if (craterId !== "gale-crater") return;
    const boxX = cx + 95 * zoom;
    const boxY = cy + 72 * zoom;
    if (!this.isInsideViewport(boxX, boxY, 80, viewW, viewH)) return;

    ctx.save();
    ctx.strokeStyle = "#eab308";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 2]);
    for (let off = -22; off <= 22; off += 11) {
      ctx.beginPath(); ctx.moveTo(boxX + off * zoom, boxY - 18 * zoom); ctx.lineTo(boxX + off * zoom, boxY + 18 * zoom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(boxX - 18 * zoom, boxY + off * zoom); ctx.lineTo(boxX + 18 * zoom, boxY + off * zoom); ctx.stroke();
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
   * Alfa (α), Beta (β), Gama (γ) ve Foton Bombardımanı Alanlarını çizer
   */
  drawRadiationPhotonZones(ctx, cx, cy, zoom, zones, lodTier, viewW, viewH) {
    ctx.save();
    zones.forEach((z) => {
      const zx = cx + z.relX * zoom;
      const zy = cy + z.relY * zoom;
      const zr = z.radius * zoom;
      if (!this.isInsideViewport(zx, zy, zr + 40, viewW, viewH)) return;

      const grad = ctx.createRadialGradient(zx, zy, 6, zx, zy, zr);
      grad.addColorStop(0, "rgba(168, 85, 247, 0.36)");
      grad.addColorStop(1, "rgba(168, 85, 247, 0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#c084fc";
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(zx, zy, zr * 0.82, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#e9d5ff";
      ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText(`☢ ${z.name}`, zx - 68, zy - 4);
      if (lodTier >= 2) {
        ctx.fillText(`α/β/γ: ${z.gammaLevel} | ${z.photonFlux}`, zx - 74, zy + 9);
      }
    });
    ctx.restore();
  }

  /**
   * Asit Yağmuru & Sülfat Sisi Filtresi
   */
  drawAcidRainFilter(ctx, cx, cy, r) {
    ctx.save();
    const acidX = cx + r * 0.28;
    const acidY = cy + r * 0.22;
    const acidGrad = ctx.createRadialGradient(acidX, acidY, 8, acidX, acidY, r * 0.44);
    acidGrad.addColorStop(0, "rgba(245, 158, 11, 0.44)");
    acidGrad.addColorStop(1, "rgba(234, 179, 8, 0)");
    ctx.fillStyle = acidGrad;
    ctx.beginPath();
    ctx.arc(acidX, acidY, r * 0.44, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fbbf24";
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillText("⚗ ASİT YAĞMURU SİSİ (pH 2.4)", acidX - 65, acidY + r * 0.38);
    ctx.restore();
  }

  /**
   * Kum Yağmuru & Kasırga / Toz Fırtınası Filtresi
   */
  drawDustStormFilter(ctx, cx, cy, r) {
    ctx.save();
    const stormX = cx - r * 0.3;
    const stormY = cy + r * 0.1;
    const stormGrad = ctx.createRadialGradient(stormX, stormY, 5, stormX, stormY, r * 0.48);
    stormGrad.addColorStop(0, "rgba(220, 38, 38, 0.42)");
    stormGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
    ctx.fillStyle = stormGrad;
    ctx.beginPath();
    ctx.arc(stormX, stormY, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f87171";
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillText("🌪 KUM FIRTINASI / KASIRGA (TAU 3.4)", cx - r * 0.78, cy + r * 0.52);
    ctx.restore();
  }

  /**
   * KURAL GEREĞİ 2D Görünümde Çift Yol Çizer:
   * - Mavi (#2563eb): En güvenli ve en kısa yol + süre (saat) + mesafe (km)
   * - Soluk Mavi (#93c5fd): Yine güvenli fakat daha uzun çevre yolu + süre (saat)
   */
  drawDualRoutes2D(ctx, cx, cy, zoom, computedRoutes, waypoints, selectedWaypoint, lodTier, viewW, viewH) {
    ctx.save();
    const sec = computedRoutes?.secondaryPaleBlue;
    const pri = computedRoutes?.primaryBlue;

    // 1. SOLUK MAVİ: Güvenli fakat daha uzun alternatif yol
    if (sec && sec.points.length >= 2) {
      ctx.strokeStyle = "rgba(147, 197, 253, 0.72)"; // Soluk Mavi
      ctx.lineWidth = 2.8;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      sec.points.forEach((p, idx) => {
        const px = cx + p.relX * zoom;
        const py = cy + p.relY * zoom;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      const mid = sec.points[Math.floor(sec.points.length / 2)];
      const mx = cx + mid.relX * zoom;
      const my = cy + mid.relY * zoom + 14;
      if (this.isInsideViewport(mx, my, 80, viewW, viewH)) {
        ctx.fillStyle = "#bfdbfe";
        ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
        ctx.fillText(`Uzun Güvenli Yol: ${sec.totalKm.toFixed(1)} km (${sec.formattedDuration})`, mx - 45, my);
      }
    }

    // 2. KOYU / PARLAK MAVİ: En güvenli ve en kısa ana yol
    if (pri && pri.points.length >= 2) {
      ctx.strokeStyle = "#2563eb"; // Mavi
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      pri.points.forEach((p, idx) => {
        const px = cx + p.relX * zoom;
        const py = cy + p.relY * zoom;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();

      const midP = pri.points[Math.floor(pri.points.length / 2)];
      const lx = cx + midP.relX * zoom;
      const ly = cy + midP.relY * zoom - 12;
      if (this.isInsideViewport(lx, ly, 80, viewW, viewH)) {
        ctx.fillStyle = "#60a5fa";
        ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
        ctx.fillText(`Kısa Güvenli Yol: ${pri.totalKm.toFixed(1)} km (${pri.formattedDuration})`, lx - 48, ly);
      }
    }

    // Duraklar (görünür ekranda ise çizilir)
    waypoints.forEach((wp) => {
      const x = cx + wp.relX * zoom;
      const y = cy + wp.relY * zoom;
      if (!this.isInsideViewport(x, y, 40, viewW, viewH)) return;
      const isSelected = selectedWaypoint && selectedWaypoint.id === wp.id;

      ctx.beginPath();
      ctx.arc(x, y, wp.highlight ? 8.5 : 6.2, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : (wp.highlight ? "#e03c31" : "#3b82f6");
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      if (lodTier >= 1) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
        ctx.fillText(lodTier >= 3 ? `${wp.name} (${wp.elev}m)` : wp.name, x + 11, y + 4);
      }
    });

    ctx.restore();
  }

  /**
   * 3D Perspektif Modunda yükseltilmiş Mavi & Soluk Mavi yollar ile durakları çizer
   */
  draw3DElevationOverlays(ctx, cx, cy, zoom, crater, waypoints, selectedWaypoint, showRoute, computedRoutes, exag, lodTier, viewW, viewH) {
    ctx.save();
    if (crater.id === "gale-crater") {
      const peakBaseY = cy + 8 * 0.56;
      const peakTopY = peakBaseY - 70 * zoom * exag;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx + 14 * 1.12, peakBaseY); ctx.lineTo(cx + 14 * 1.12, peakTopY); ctx.stroke();
      ctx.fillStyle = "#e03c31";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText("▲ MOUNT SHARP (5.5 KM)", cx - 50, peakTopY - 6);
    }

    if (!showRoute) { ctx.restore(); return; }

    const to3D = (pt) => {
      const gx = cx + pt.relX * zoom * 1.12;
      const gy = cy + pt.relY * zoom * 0.56;
      const elevOffset = Math.max(10, (((pt.elev || -4200) + 4600) / 26) * zoom * exag);
      return { gx, gy, tx: gx, ty: gy - elevOffset };
    };

    const sec = computedRoutes?.secondaryPaleBlue;
    const pri = computedRoutes?.primaryBlue;

    // Soluk Mavi 3D Uzun Güvenli Rota
    if (sec && sec.points.length >= 2) {
      ctx.strokeStyle = "rgba(147, 197, 253, 0.72)";
      ctx.lineWidth = 2.6;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      sec.points.forEach((p, idx) => {
        const q = to3D(p);
        if (idx === 0) ctx.moveTo(q.tx, q.ty);
        else ctx.lineTo(q.tx, q.ty);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Mavi 3D En Kısa & Güvenli Rota
    if (pri && pri.points.length >= 2) {
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      pri.points.forEach((p, idx) => {
        const q = to3D(p);
        if (idx === 0) ctx.moveTo(q.tx, q.ty);
        else ctx.lineTo(q.tx, q.ty);
      });
      ctx.stroke();

      const mid = to3D(pri.points[Math.floor(pri.points.length / 2)]);
      if (this.isInsideViewport(mid.tx, mid.ty, 60, viewW, viewH)) {
        ctx.fillStyle = "#60a5fa";
        ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
        ctx.fillText(`Mavi Yol: ${pri.totalKm.toFixed(1)} km • ${pri.formattedDuration}`, mid.tx - 55, mid.ty - 12);
      }
    }

    waypoints.forEach((wp) => {
      const q = to3D(wp);
      if (!this.isInsideViewport(q.tx, q.ty, 40, viewW, viewH)) return;
      const isSelected = selectedWaypoint && selectedWaypoint.id === wp.id;

      ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.moveTo(q.gx, q.gy); ctx.lineTo(q.tx, q.ty); ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(q.tx, q.ty, wp.highlight ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : (wp.highlight ? "#e03c31" : "#3b82f6");
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText(`${wp.name} (${wp.elev}m)`, q.tx + 10, q.ty + 3);
    });

    ctx.restore();
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-7: JSDoc LOD kırpma, çift güvenli yol ve radyasyon/foton görselleştirme motoru.
   - Satır 9-33: constructor, isInsideViewport (görünür alan kırpma) ve computeLodTier (yaklaştıkça render kademesi).
   - Satır 35-109: getOrCreateTerrainTexture; krater dokusu ön-bellek çizimi.
   - Satır 111-189: render; LOD seviyesine göre katmanları, foton bombardımanı bölgelerini ve Mavi/Soluk Mavi rotaları yürütür.
   - Satır 191-318: drawLodMicroTerrain, drawViewportGraticule, drawTopographyContours, drawThermalOverlay, drawGeologyOverlay, drawRadiationPhotonZones, drawAcidRainFilter, drawDustStormFilter.
   - Satır 320-467: drawDualRoutes2D ve draw3DElevationOverlays; haritada Mavi (kısa güvenli yol) ve Soluk Mavi (uzun güvenli alternatif yol) güzergahlarını saat/km etiketiyle çizer.
   ========================================================================== */
