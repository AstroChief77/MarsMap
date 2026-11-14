/**
 * @file CraterCanvasRenderer.js
 * @description Google Earth ve NASA Trek tarzı 2D/3D Mars Krater görselleştirme motoru.
 * Prosedürel Mars yüzeyi, yıldızlı uzay fonu, MOLA konturları, asit/fırtına filtreleri ve 3D yükseklik projeksiyonu çizer.
 */

export class CraterCanvasRenderer {
  /**
   * CraterCanvasRenderer yapıcı metodu
   */
  constructor() {
    this.spaceStars = this.generateSpaceStars(140);
    this.textureCache = new Map();
  }

  /**
   * Harita arka planındaki Google Earth uzay boşluğu için sabit yıldız koordinatları üretir
   * @param {number} count - Yıldız adedi
   * @returns {Array} Yıldız listesi
   */
  generateSpaceStars(count) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        rx: (Math.sin(i * 12.9898) * 43758.5453) % 1,
        ry: (Math.cos(i * 78.233) * 43758.5453) % 1,
        size: (i % 3 === 0) ? 1.4 : 0.8,
        alpha: 0.35 + ((i * 7) % 60) / 100
      });
    }
    return stars;
  }

  /**
   * Seçili krater için prosedürel yüksek detaylı yüzey dokusu oluşturur (önbellekli)
   * @param {string} craterId - Krater kimliği
   * @returns {HTMLCanvasElement} Önbelleklenmiş yüzey doku tuvali
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
    const r = size * 0.42;

    // 1. Ejecta dış krater püskürtü zemin dokusu
    const ejecta = octx.createRadialGradient(cx, cy, r * 0.85, cx, cy, size * 0.5);
    ejecta.addColorStop(0, "rgba(110, 52, 34, 0.85)");
    ejecta.addColorStop(0.6, "rgba(62, 30, 20, 0.45)");
    ejecta.addColorStop(1, "rgba(0, 0, 0, 0)");
    octx.fillStyle = ejecta;
    octx.fillRect(0, 0, size, size);

    // 2. Krater ana çanağı (Kuzeybatı güneş ışığı, Güneydoğu gölge)
    const floorGrad = octx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    if (craterId === "korolev-crater") {
      floorGrad.addColorStop(0, "#7c4a38");
      floorGrad.addColorStop(0.5, "#4d2c20");
      floorGrad.addColorStop(1, "#1e100b");
    } else {
      floorGrad.addColorStop(0, "#9c4e33");
      floorGrad.addColorStop(0.45, "#6b3320");
      floorGrad.addColorStop(1, "#26120b");
    }
    octx.fillStyle = floorGrad;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.fill();

    // 3. Krater içi mikro kratercikler ve kayaç benekleri (deterministik desen)
    for (let i = 0; i < 65; i++) {
      const angle = i * 2.39996;
      const dist = Math.sqrt(i / 65) * (r * 0.86);
      const px = cx + Math.cos(angle) * dist;
      const py = cy + Math.sin(angle) * dist;
      const pr = 2 + (i % 6);

      octx.fillStyle = i % 2 === 0 ? "rgba(255, 160, 120, 0.14)" : "rgba(15, 8, 5, 0.35)";
      octx.beginPath();
      octx.arc(px, py, pr, 0, Math.PI * 2);
      octx.fill();
    }

    // 4. Kratere özgü jeomorfolojik özellikler
    if (craterId === "gale-crater") {
      // Mount Sharp (Aeolis Mons) merkez dağ katmanları
      for (let step = 4; step >= 1; step--) {
        const mr = (r * 0.45) * (step / 4);
        octx.fillStyle = step === 1 ? "#b86b4b" : `rgba(${130 - step * 15}, ${64 - step * 8}, ${40 - step * 5}, 0.88)`;
        octx.beginPath();
        octx.arc(cx + 12, cy + 8, mr, 0, Math.PI * 2);
        octx.fill();
        octx.strokeStyle = "rgba(0,0,0,0.35)";
        octx.lineWidth = 1.5;
        octx.stroke();
      }
    } else if (craterId === "jezero-crater") {
      // Neretva Vallis Antik Nehir Kanalı ve Delta Yelpazesi
      octx.strokeStyle = "rgba(40, 20, 12, 0.8)";
      octx.lineWidth = 14;
      octx.beginPath();
      octx.moveTo(cx - r * 1.05, cy - r * 0.45);
      octx.quadraticCurveTo(cx - r * 0.65, cy - r * 0.2, cx - r * 0.25, cy - r * 0.05);
      octx.stroke();

      // Delta çökelti yelpazesi
      const deltaGrad = octx.createRadialGradient(cx - r * 0.25, cy - r * 0.05, 5, cx, cy, r * 0.55);
      deltaGrad.addColorStop(0, "rgba(195, 130, 95, 0.85)");
      deltaGrad.addColorStop(1, "rgba(110, 60, 40, 0)");
      octx.fillStyle = deltaGrad;
      octx.beginPath();
      octx.arc(cx - r * 0.1, cy + r * 0.05, r * 0.52, 0, Math.PI * 2);
      octx.fill();
    } else if (craterId === "korolev-crater") {
      // Kalıcı Saf Su Buzu Kalkanı
      const iceGrad = octx.createRadialGradient(cx, cy, 10, cx, cy, r * 0.68);
      iceGrad.addColorStop(0, "#ffffff");
      iceGrad.addColorStop(0.7, "#dbeafe");
      iceGrad.addColorStop(1, "rgba(191, 219, 254, 0.15)");
      octx.fillStyle = iceGrad;
      octx.beginPath();
      octx.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      octx.fill();
    }

    // 5. Krater dış kenar duvarı (Rim Scarp)
    octx.strokeStyle = "rgba(255, 150, 110, 0.65)";
    octx.lineWidth = 4;
    octx.beginPath();
    octx.arc(cx, cy, r, 0, Math.PI * 2);
    octx.stroke();

    this.textureCache.set(craterId, offscreen);
    return offscreen;
  }

  /**
   * Ana harita çizim fonksiyonu (Tüm katmanları ve 2D/3D görünümü işler)
   * @param {CanvasRenderingContext2D} ctx - Tuval bağlamı
   * @param {Object} state - Harita durum nesnesi
   */
  render(ctx, state) {
    const { width, height, panX, panY, zoom, activeCrater, layers, viewMode, filterAcidRain, filterDustStorm, waypoints, selectedWaypoint } = state;

    // 1. Zifiri siyah Google Earth uzay zemini ve yıldızlar
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    this.drawBackdropStars(ctx, width, height);

    const centerX = width / 2 + panX;
    const centerY = height / 2 + panY;
    const radius = Math.min(width, height) * 0.41 * zoom;
    const is3D = viewMode === "3d";

    ctx.save();
    // 3D Perspektif Modunda zemini yatay eksende eğ (Google Earth tilt)
    if (is3D) {
      ctx.translate(centerX, centerY);
      ctx.scale(1.12, 0.56);
      ctx.translate(-centerX, -centerY);
    }

    // 2. Optik Mars Krater Yüzey Dokusu
    if (layers.optical) {
      const tex = this.getOrCreateTerrainTexture(activeCrater.id);
      const texSize = radius * 2.38;
      ctx.drawImage(tex, centerX - texSize / 2, centerY - texSize / 2, texSize, texSize);
    }

    // 3. MOLA Topografik DEM Konturları
    if (layers.topography) {
      this.drawTopographyContours(ctx, centerX, centerY, radius, activeCrater.elevation_datum_m);
    }

    // 4. THEMIS Termal Kızılötesi Kaya Yoğunluğu
    if (layers.thermal) {
      this.drawThermalOverlay(ctx, centerX, centerY, radius);
    }

    // 5. USGS Jeoloji & Boxwork Formasyonları
    if (layers.geology) {
      this.drawGeologyOverlay(ctx, centerX, centerY, radius, zoom, activeCrater.id);
    }

    // 6. Sol Alt Filtre: Asit Yağmuru / Asidik Sülfat Sisi Filtresi
    if (filterAcidRain) {
      this.drawAcidRainFilter(ctx, centerX, centerY, radius);
    }

    // 7. Sol Alt Filtre: Kum Yağmuru / Kasırga Filtresi
    if (filterDustStorm) {
      this.drawDustStormFilter(ctx, centerX, centerY, radius);
    }

    // 8. EVA Rotası (Zemin Projeksiyonu)
    if (layers.evaRoute && !is3D) {
      this.drawEvaRoute2D(ctx, centerX, centerY, zoom, waypoints, selectedWaypoint, filterAcidRain, filterDustStorm);
    }

    ctx.restore();

    // 9. 3D Modunda dikey yükselti sütunları ve yükseklik projeksiyonu (eğilmemiş ekran ekseninde dikey yükselir)
    if (is3D) {
      this.draw3DElevationOverlays(ctx, centerX, centerY, zoom, activeCrater, waypoints, selectedWaypoint, layers.evaRoute, filterAcidRain, filterDustStorm);
    }
  }

  /**
   * Harita arka planındaki yıldızları çizer
   */
  drawBackdropStars(ctx, w, h) {
    for (const s of this.spaceStars) {
      const sx = Math.abs(s.rx) * w;
      const sy = Math.abs(s.ry) * h;
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fillRect(sx, sy, s.size, s.size);
    }
  }

  /**
   * MOLA Topografik eşyükselti halkalarını çizer
   */
  drawTopographyContours(ctx, cx, cy, r, datumElev) {
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const stepR = (r / (steps + 0.5)) * i;
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.22 + i * 0.08})`;
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
    ctx.globalAlpha = 0.35;
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
  drawGeologyOverlay(ctx, cx, cy, r, zoom, craterId) {
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
    ctx.fillStyle = "#facc15";
    ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillText("⚑ BOXWORK RİTJLERİ", boxX - 45, boxY - 24 * zoom);
    ctx.restore();
  }

  /**
   * Asit Yağmuru & Korozif Sülfat Sisi Filtresi katmanı
   */
  drawAcidRainFilter(ctx, cx, cy, r) {
    ctx.save();
    const acidX = cx + r * 0.28;
    const acidY = cy + r * 0.22;
    const acidGrad = ctx.createRadialGradient(acidX, acidY, 8, acidX, acidY, r * 0.42);
    acidGrad.addColorStop(0, "rgba(245, 158, 11, 0.42)");
    acidGrad.addColorStop(0.7, "rgba(234, 179, 8, 0.18)");
    acidGrad.addColorStop(1, "rgba(234, 179, 8, 0)");

    ctx.fillStyle = acidGrad;
    ctx.beginPath();
    ctx.arc(acidX, acidY, r * 0.42, 0, Math.PI * 2);
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
    ctx.fillText("⚗ ASİDİK SÜLFAT SİSİ (pH ~2.4)", acidX - 65, acidY + r * 0.42);
    ctx.restore();
  }

  /**
   * Kum Yağmuru & Kasırga / Toz Fırtınası Filtresi katmanı
   */
  drawDustStormFilter(ctx, cx, cy, r) {
    ctx.save();
    const stormX = cx - r * 0.3;
    const stormY = cy + r * 0.1;

    // Kasırga toz bulutu halkaları
    const stormGrad = ctx.createRadialGradient(stormX, stormY, 5, stormX, stormY, r * 0.48);
    stormGrad.addColorStop(0, "rgba(220, 38, 38, 0.4)");
    stormGrad.addColorStop(1, "rgba(220, 38, 38, 0)");
    ctx.fillStyle = stormGrad;
    ctx.beginPath();
    ctx.arc(stormX, stormY, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // Fırtına yön oku
    ctx.strokeStyle = "#ef4444";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 5]);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.85, cy + r * 0.48);
    ctx.lineTo(stormX + 20, stormY - 10);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#f87171";
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillText("🌪 KUM FIRTINASI JETİ (TAU 3.4 // 28 m/s)", cx - r * 0.82, cy + r * 0.56);
    ctx.restore();
  }

  /**
   * 2D Görünüm modunda EVA Marswalk rotasını ve waypoint noktalarını çizer
   */
  drawEvaRoute2D(ctx, cx, cy, zoom, waypoints, selectedWaypoint, filterAcid, filterStorm) {
    if (!waypoints.length) return;
    ctx.save();

    // Segment bazlı güvenli / riskli renk kodlu rota çizimi
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      const isAcidHazard = filterAcid && (p1.acidRisk || p2.acidRisk);
      const isStormHazard = filterStorm && (p1.stormRisk || p2.stormRisk);

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
      ctx.arc(x, y, (wp.highlight ? 9 : 6.5) * zoom, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : (wp.highlight ? "#eab308" : "#22c55e");
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText(wp.name, x + 11 * zoom, y + 4);
    });

    ctx.restore();
  }

  /**
   * 3D Perspektif Modunda yükseltilmiş rota sütunları ve Mount Sharp 3D zirve işaretlerini çizer
   */
  draw3DElevationOverlays(ctx, cx, cy, zoom, crater, waypoints, selectedWaypoint, showRoute, filterAcid, filterStorm) {
    ctx.save();
    // Mount Sharp 3D Zirve Konisi İşareti
    if (crater.id === "gale-crater") {
      const peakBaseY = cy + 8 * 0.56;
      const peakTopY = peakBaseY - 75 * zoom;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + 12 * 1.12, peakBaseY);
      ctx.lineTo(cx + 12 * 1.12, peakTopY);
      ctx.stroke();

      ctx.fillStyle = "#e03c31";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText("▲ MOUNT SHARP (5,500m ZİRVE)", cx - 55, peakTopY - 6);
    }

    if (!showRoute || !waypoints.length) {
      ctx.restore();
      return;
    }

    // 3D Projeksiyonlu EVA Durakları (Yüksekliğe göre dikey yükselme)
    const projPoints = waypoints.map((wp) => {
      const gx = cx + wp.relX * zoom * 1.12;
      const gy = cy + wp.relY * zoom * 0.56;
      const elevOffset = Math.max(10, ((wp.elev + 4600) / 25) * zoom);
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
      ctx.arc(tx, ty, 6.5 * zoom, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? "#ffffff" : (wp.highlight ? "#eab308" : "#22c55e");
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
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc harita çizim motoru (Renderer) başlığı ve açıklaması.
   - Satır 7: CraterCanvasRenderer sınıfının dışa aktarılması.
   - Satır 8-14: constructor; uzay yıldızları listesini ve offscreen yüzey dokusu önbelleğini (Map) başlatır.
   - Satır 16-29: generateSpaceStars; Google Earth siyah uzay boşluğu için deterministik konumlarda yıldızlar oluşturur.
   - Satır 31-125: getOrCreateTerrainTexture; krater çanağı, güneş ışığı yönlü kenar duvarı, mikro kratercikler ve kratere özgü jeomorfolojik şekilleri (Mount Sharp, Neretva Deltası, Korolev Buzulu) offscreen tuvale çizer.
   - Satır 127-180: render; zifiri siyah yıldızlı fon, 3D eğim projeksiyonu ve tüm katman/filtre çizim sırasını yürütür.
   - Satır 182-220: drawBackdropStars, drawTopographyContours ve drawThermalOverlay yardımcı çizim fonksiyonları.
   - Satır 222-246: drawGeologyOverlay; Gale Kraterindeki 2025-2026 Boxwork sırtlarını çizer.
   - Satır 248-298: drawAcidRainFilter ve drawDustStormFilter; sol alttaki asit ve kum fırtınası filtrelerini harita üzerinde görselleştirir.
   - Satır 300-338: drawEvaRoute2D; 2D görünümde rota segmentlerini tehlike rengine göre (Yeşil Güvenli, Sarı Asit, Kırmızı Fırtına) çizer.
   - Satır 340-405: draw3DElevationOverlays; 3D modunda irtifaya göre dikey yükselen waypoint sütunları ve Mount Sharp zirvesini çizer.
   - Satır 406: CraterCanvasRenderer sınıfı sonu.
   ========================================================================== */
