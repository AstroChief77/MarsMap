/**
 * @file MarsGlobeRenderer.js
 * @description Tum yuzey dokusunu dogrudan data/tiles/ altindaki gercek NASA Mars Trek
 * karolarindan (MarsTileLoader) ceken gezinebilen 3D Mars Kuresi ve 2D Karo Harita motoru.
 */

export class MarsGlobeRenderer {
  /**
   * MarsGlobeRenderer yapici metodu
   * @param {MarsTileLoader} tileLoader - Yerel karo yukleyici ornegi
   */
  constructor(tileLoader) {
    this.tileLoader = tileLoader;
    this.idleResolution = 380;
    this.dragResolution = 260;
    this.currentSize = 0;
    this.sphereCanvas = document.createElement("canvas");
    this.sphereCtx = this.sphereCanvas.getContext("2d");
    this.sphereImgData = null;
  }

  ensureSphereBuffer(size) {
    if (this.currentSize === size && this.sphereImgData) return;
    this.currentSize = size;
    this.sphereCanvas.width = size;
    this.sphereCanvas.height = size;
    this.sphereImgData = this.sphereCtx.createImageData(size, size);
  }

  /**
   * (lat, lon) cografik noktasini kamera donus acilarina gore 3D ekran noktasina cevirir
   */
  projectLatLonToSphere(latDeg, lonDeg, rotLatDeg, rotLonDeg, cx, cy, radius) {
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

    return { x: cx + x0 * radius, y: cy - y1 * radius, z: z1, visible: z1 > 0.06 };
  }

  /**
   * 3D Mars Kuresini gercek data/tiles mozaik piksel tamponundan isin izlemeyle cizer
   */
  renderGlobe(ctx, state) {
    const {
      width, height, rotLat, rotLon, zoom, activeLayerId, isDragging,
      craters, activeCrater, basemapOpacity, filterAcidRain, filterDustStorm,
      showGraticule, showNomenclature, showRadiationZones, hazardsData, landingSites
    } = state;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.41 * Math.min(Math.max(zoom, 0.55), 3.2);

    // 1. Dis Mars atmosferi kehribar limb ışıması
    const atmoGrad = ctx.createRadialGradient(cx, cy, radius * 0.94, cx, cy, radius * 1.12);
    atmoGrad.addColorStop(0.0, "rgba(235, 128, 70, 0.52)");
    atmoGrad.addColorStop(0.4, "rgba(205, 88, 38, 0.22)");
    atmoGrad.addColorStop(1.0, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.12, 0, Math.PI * 2);
    ctx.fill();

    // 2. data/tiles uzerinden birlestirilmis gercek NASA piksel dokusunu ornekle
    const atlas = this.tileLoader.getAtlasPixels(activeLayerId);
    if (!atlas) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = "#18100d";
      ctx.fill();
      ctx.strokeStyle = "rgba(244, 145, 92, 0.65)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Mars karolari ./data/tiles/ dizininden yukleniyor...", cx, cy);
      ctx.restore();
      return [];
    }

    const s = isDragging ? this.dragResolution : this.idleResolution;
    this.ensureSphereBuffer(s);
    const half = s / 2;
    const invHalf = 1 / half;
    const imgData = this.sphereImgData;
    const out = imgData.data;
    const tex = atlas.data;
    const tw = atlas.width;
    const th = atlas.height;

    const phi0 = (rotLat * Math.PI) / 180;
    const lam0 = (rotLon * Math.PI) / 180;
    const sinP0 = Math.sin(phi0);
    const cosP0 = Math.cos(phi0);

    const lx = -0.34;
    const ly = 0.26;
    const lz = 0.90;
    const twoPi = Math.PI * 2;
    const invTwoPi = 1 / twoPi;
    const invPi = 1 / Math.PI;
    const halfPi = Math.PI / 2;
    const opacityMult = basemapOpacity ?? 1.0;

    for (let py = 0; py < s; py++) {
      const ny = (half - py) * invHalf;
      const ny2 = ny * ny;
      for (let px = 0; px < s; px++) {
        const idx = (py * s + px) * 4;
        const nx = (px - half) * invHalf;
        const r2 = nx * nx + ny2;
        if (r2 >= 1.0) {
          out[idx + 3] = 0;
          continue;
        }

        const nz = Math.sqrt(1.0 - r2);
        const vy = ny * cosP0 + nz * sinP0;
        const vz = -ny * sinP0 + nz * cosP0;
        const vx = nx;

        const lat = Math.asin(vy > 1 ? 1 : vy < -1 ? -1 : vy);
        let lon = lam0 + Math.atan2(vx, vz);
        lon = ((lon + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;

        const fu = ((lon + Math.PI) * invTwoPi) * (tw - 1);
        const fv = ((halfPi - lat) * invPi) * (th - 1);
        const u0 = fu | 0;
        const v0 = fv | 0;
        const u1 = (u0 + 1) % tw;
        const v1 = v0 + 1 < th ? v0 + 1 : v0;
        const du = fu - u0;
        const dv = fv - v0;
        const odu = 1 - du;
        const odv = 1 - dv;

        const i00 = (v0 * tw + u0) * 4;
        const i10 = (v0 * tw + u1) * 4;
        const i01 = (v1 * tw + u0) * 4;
        const i11 = (v1 * tw + u1) * 4;

        const w00 = odu * odv;
        const w10 = du * odv;
        const w01 = odu * dv;
        const w11 = du * dv;

        const rTex = tex[i00] * w00 + tex[i10] * w10 + tex[i01] * w01 + tex[i11] * w11;
        const gTex = tex[i00 + 1] * w00 + tex[i10 + 1] * w10 + tex[i01 + 1] * w01 + tex[i11 + 1] * w11;
        const bTex = tex[i00 + 2] * w00 + tex[i10 + 2] * w10 + tex[i01 + 2] * w01 + tex[i11 + 2] * w11;

        const diff = Math.max(0.38, nx * lx + ny * ly + nz * lz);
        const limb = Math.pow(1.0 - nz, 2.8);

        out[idx] = Math.min(255, rTex * diff + limb * 145);
        out[idx + 1] = Math.min(255, gTex * diff + limb * 68);
        out[idx + 2] = Math.min(255, bTex * diff + limb * 32);
        out[idx + 3] = Math.round(255 * opacityMult);
      }
    }

    this.sphereCtx.putImageData(imgData, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.sphereCanvas, cx - radius, cy - radius, radius * 2, radius * 2);

    ctx.strokeStyle = "rgba(244, 145, 92, 0.72)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    if (showGraticule) this.drawSphereGraticule(ctx, rotLat, rotLon, cx, cy, radius);
    if (filterDustStorm) this.drawHazardOverlays(ctx, rotLat, rotLon, cx, cy, radius, hazardsData, "dust");
    if (filterAcidRain) this.drawHazardOverlays(ctx, rotLat, rotLon, cx, cy, radius, hazardsData, "acid");
    if (showRadiationZones) this.drawPhotonRadiationBelts(ctx, rotLat, rotLon, cx, cy, radius);
    if (showNomenclature) this.drawGlobalNomenclature(ctx, rotLat, rotLon, cx, cy, radius);

    const hitTargets = this.drawSpherePins(ctx, craters, landingSites, activeCrater, rotLat, rotLon, cx, cy, radius);
    ctx.restore();
    return hitTargets;
  }

  /**
   * 2D Equirectangular (EPSG:104905) gorunumunde dogrudan data/tiles PNG/JPG karolarini cizer
   */
  render2DTiled(ctx, state) {
    const {
      width, height, rotLat, rotLon, zoom, activeLayerId,
      craters, activeCrater, filterAcidRain, filterDustStorm,
      showGraticule, showNomenclature, showRadiationZones
    } = state;

    ctx.clearRect(0, 0, width, height);

    const baseWidth = Math.max(width * 0.86, 620);
    const mapW = baseWidth * Math.min(Math.max(zoom, 0.65), 4.0);
    const mapH = mapW * 0.5;

    const uCenter = (rotLon + 180) / 360;
    const vCenter = (90 - rotLat) / 180;
    const ox = width / 2 - uCenter * mapW;
    const oy = height / 2 - vCenter * mapH;

    const layer = this.tileLoader.getLayerById(activeLayerId);
    const targetZ = this.tileLoader.computeTargetZoom(zoom, layer, state.progressiveLodRender !== false);

    // 1. Oncelikle kaba z=0 arkaplani (kesintisiz zemin) ve sonra hedef LOD karolarini ciz
    this.drawTileLevel2D(ctx, activeLayerId, 0, ox, oy, mapW, mapH, width, height);
    if (targetZ >= 1) this.drawTileLevel2D(ctx, activeLayerId, 1, ox, oy, mapW, mapH, width, height);
    if (targetZ >= 2) this.drawTileLevel2D(ctx, activeLayerId, 2, ox, oy, mapW, mapH, width, height);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, mapW, mapH);

    if (showGraticule) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      for (let x = 1; x < 12; x++) {
        const px = ox + (mapW / 12) * x;
        ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + mapH); ctx.stroke();
      }
      for (let y = 1; y < 6; y++) {
        const py = oy + (mapH / 6) * y;
        ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + mapW, py); ctx.stroke();
      }
    }

    if (filterDustStorm) this.draw2DCircleHazard(ctx, ox, oy, mapW, mapH, -18, 95, "rgba(217, 43, 43, 0.28)");
    if (filterAcidRain) this.draw2DCircleHazard(ctx, ox, oy, mapW, mapH, -4.6, 137.4, "rgba(245, 158, 11, 0.28)");
    if (showRadiationZones) this.draw2DCircleHazard(ctx, ox, oy, mapW, mapH, 18.4, 77.4, "rgba(139, 92, 246, 0.25)");

    if (showNomenclature) {
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillStyle = "rgba(255, 245, 235, 0.8)";
      [
        { name: "VALLES MARINERIS", lat: -13, lon: -65 },
        { name: "OLYMPUS MONS", lat: 18.6, lon: -133.8 },
        { name: "SYRTIS MAJOR", lat: 8.4, lon: 69.5 },
        { name: "HELLAS PLANITIA", lat: -42.4, lon: 70.5 }
      ].forEach((p) => {
        const px = ox + ((p.lon + 180) / 360) * mapW;
        const py = oy + ((90 - p.lat) / 180) * mapH;
        if (px >= -80 && px <= width + 80 && py >= -20 && py <= height + 20) {
          ctx.fillText(p.name, px - 42, py);
        }
      });
    }

    const hitTargets = [];
    craters.forEach((crater) => {
      const px = ox + ((crater.coordinates.lon + 180) / 360) * mapW;
      const py = oy + ((90 - crater.coordinates.lat) / 180) * mapH;
      const isActive = activeCrater && activeCrater.id === crater.id;

      ctx.beginPath();
      ctx.arc(px, py, isActive ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#d92b2b" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "bold 11px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(crater.name, px + 11, py + 4);
      hitTargets.push({ crater, x: px, y: py, r: 22 });
    });

    return hitTargets;
  }

  drawTileLevel2D(ctx, layerId, z, ox, oy, mapW, mapH, viewW, viewH) {
    const cols = Math.pow(2, z + 1);
    const rows = Math.pow(2, z);
    const tw = mapW / cols;
    const th = mapH / rows;

    for (const wrapOffset of [-mapW, 0, mapW]) {
      const baseX = ox + wrapOffset;
      if (baseX + mapW < 0 || baseX > viewW) continue;
      for (let y = 0; y < rows; y++) {
        const py = oy + y * th;
        if (py + th < 0 || py > viewH) continue;
        for (let x = 0; x < cols; x++) {
          const px = baseX + x * tw;
          if (px + tw < 0 || px > viewW) continue;
          const img = this.tileLoader.getTileImage(layerId, z, y, x);
          if (img) ctx.drawImage(img, px, py, tw + 0.6, th + 0.6);
        }
      }
    }
  }

  draw2DCircleHazard(ctx, ox, oy, mapW, mapH, lat, lon, color) {
    const px = ox + ((lon + 180) / 360) * mapW;
    const py = oy + ((90 - lat) / 180) * mapH;
    const rad = mapW * 0.08;
    const g = ctx.createRadialGradient(px, py, 2, px, py, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  drawSpherePins(ctx, craters, landingSites, activeCrater, rotLat, rotLon, cx, cy, radius) {
    const hitTargets = [];

    // 1. Yardimci NASA inis sahalari (kucuk nokta olarak mars_landing_sites.json verisinden)
    if (Array.isArray(landingSites)) {
      landingSites.forEach((site) => {
        const p = this.projectLatLonToSphere(site.coordinates.lat, site.coordinates.lon, rotLat, rotLon, cx, cy, radius);
        if (!p.visible) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
        ctx.fill();
      });
    }

    // 2. Ana odak kraterleri (tiklanabilir)
    craters.forEach((crater) => {
      const p = this.projectLatLonToSphere(crater.coordinates.lat, crater.coordinates.lon, rotLat, rotLon, cx, cy, radius);
      if (!p.visible) return;

      const isActive = activeCrater && activeCrater.id === crater.id;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isActive ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#d92b2b" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(p.x, p.y, isActive ? 14 : 10, 0, Math.PI * 2);
      ctx.strokeStyle = isActive ? "rgba(217, 43, 43, 0.85)" : "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.font = "bold 11px 'Public Sans Web', 'Public Sans', sans-serif";
      const label = crater.id === "gale-crater" ? `★ ${crater.name}` : crater.name;
      const lw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.82)";
      ctx.fillRect(p.x + 11, p.y - 10, lw + 10, 20);
      ctx.strokeStyle = isActive ? "#d92b2b" : "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x + 11, p.y - 10, lw + 10, 20);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, p.x + 16, p.y + 4);

      hitTargets.push({ crater, x: p.x, y: p.y, r: 22 });
    });

    return hitTargets;
  }

  drawSphereGraticule(ctx, rotLat, rotLon, cx, cy, radius) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
    ctx.lineWidth = 0.8;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 10) {
        const p = this.projectLatLonToSphere(lat, lon, rotLat, rotLon, cx, cy, radius);
        if (p.z > 0) {
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else started = false;
      }
      ctx.stroke();
    }
    for (let lon = -150; lon <= 180; lon += 30) {
      ctx.beginPath();
      let started = false;
      for (let lat = -85; lat <= 85; lat += 10) {
        const p = this.projectLatLonToSphere(lat, lon, rotLat, rotLon, cx, cy, radius);
        if (p.z > 0) {
          if (!started) { ctx.moveTo(p.x, p.y); started = true; }
          else ctx.lineTo(p.x, p.y);
        } else started = false;
      }
      ctx.stroke();
    }
  }

  drawGlobalNomenclature(ctx, rotLat, rotLon, cx, cy, radius) {
    const places = [
      { name: "VALLES MARINERIS", lat: -13, lon: -65 },
      { name: "OLYMPUS MONS", lat: 18.6, lon: -133.8 },
      { name: "SYRTIS MAJOR", lat: 8.4, lon: 69.5 },
      { name: "HELLAS PLANITIA", lat: -42.4, lon: 70.5 },
      { name: "ARABIA TERRA", lat: 21, lon: 25 }
    ];
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillStyle = "rgba(255, 245, 235, 0.78)";
    places.forEach((pl) => {
      const p = this.projectLatLonToSphere(pl.lat, pl.lon, rotLat, rotLon, cx, cy, radius);
      if (p.visible && p.z > 0.25) ctx.fillText(pl.name, p.x - 36, p.y);
    });
  }

  drawHazardOverlays(ctx, rotLat, rotLon, cx, cy, radius, hazardsData, kind) {
    const spots = kind === "dust"
      ? [{ lat: -42.4, lon: 70.5 }, { lat: -18, lon: 95 }, { lat: 25, lon: -30 }]
      : [{ lat: -4.6, lon: 137.4 }, { lat: -10, lon: -95 }];

    spots.forEach((pt) => {
      const p = this.projectLatLonToSphere(pt.lat, pt.lon, rotLat, rotLon, cx, cy, radius);
      if (!p.visible) return;
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, radius * 0.26);
      g.addColorStop(0, kind === "dust" ? "rgba(217, 43, 43, 0.34)" : "rgba(245, 158, 11, 0.34)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.26, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawPhotonRadiationBelts(ctx, rotLat, rotLon, cx, cy, radius) {
    const zones = [
      { lat: -5, lon: 137.4, label: "α/β/γ Foton Bölgesi" },
      { lat: 18.4, lon: 77.4, label: "γ Işıma Zonu" },
      { lat: 73, lon: 165, label: "GCR Kutupsal Zonu" }
    ];
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(167, 139, 250, 0.65)";
    ctx.lineWidth = 1.2;
    zones.forEach((z) => {
      const p = this.projectLatLonToSphere(z.lat, z.lon, rotLat, rotLon, cx, cy, radius);
      if (!p.visible) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.14, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc gercek data/tiles Mars Kuresi ve 2D Harita cizim motoru tanimi.
   - Satir 8-28: MarsGlobeRenderer constructor & ensureSphereBuffer; MarsTileLoader baglantisi ve Adaptif cozunurluk tamponu hazirlar.
   - Satir 30-156: projectLatLonToSphere & renderGlobe; data/tiles altindaki atlas piksel dokusunu bilineer interpolasyon ve atmosfer limb glow ile 3D kureye yansitir.
   - Satir 158-241: render2DTiled & drawTileLevel2D; 2D gorunumde EPSG:104905 uzerine yalnizca gorunur yerel karolari cizer.
   - Satir 243-355: drawSpherePins, drawSphereGraticule, drawGlobalNomenclature, drawHazardOverlays ve drawPhotonRadiationBelts yardimcilari.
   ========================================================================== */
