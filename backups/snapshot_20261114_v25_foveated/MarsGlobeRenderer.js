/**
 * @file MarsGlobeRenderer.js
 * @description 1:1 HiDPI ekran piksel cozunurlugunde isin izlemeli (viewport-cropped)
 * 3D Mars Kuresi, 2D Karo Harita ve Backend Rota/Radyasyon cizim motoru.
 */

export class MarsGlobeRenderer {
  /**
   * MarsGlobeRenderer yapici metodu
   * @param {MarsTileLoader} tileLoader - LRU yuksek cozunurluklu karo piramidi
   */
  constructor(tileLoader) {
    this.tileLoader = tileLoader;
    this.cropCanvas = document.createElement("canvas");
    this.cropCtx = this.cropCanvas.getContext("2d");
    this.cropImgData = null;
    this.bufW = 0;
    this.bufH = 0;
    this.rgbScratch = new Float32Array(3);
  }

  ensureCropBuffer(bw, bh) {
    if (this.bufW === bw && this.bufH === bh && this.cropImgData) return;
    this.bufW = bw;
    this.bufH = bh;
    this.cropCanvas.width = bw;
    this.cropCanvas.height = bh;
    this.cropImgData = this.cropCtx.createImageData(bw, bh);
  }

  getSphereRadius(width, height, zoom) {
    return Math.min(width, height) * 0.41 * Math.min(Math.max(zoom, 0.55), 14.0);
  }

  /**
   * (lat, lon) cografik koordinatini 3D kure uzerinde ekran piksel konumuna cevirir
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

    return { x: cx + x0 * radius, y: cy - y1 * radius, z: z1, visible: z1 > 0.04 };
  }

  /**
   * Ekran tiklama veya imlec koordinatini gercek Mars (lat, lon) degerine cevirir
   */
  screenToLatLon(screenX, screenY, state) {
    const { width, height, rotLat, rotLon, zoom, viewMode } = state;

    if (viewMode === "2d") {
      const mapW = Math.max(width * 0.86, 620) * Math.min(Math.max(zoom, 0.65), 14.0);
      const mapH = mapW * 0.5;
      const uCenter = (rotLon + 180) / 360;
      const vCenter = (90 - rotLat) / 180;
      const ox = width / 2 - uCenter * mapW;
      const oy = height / 2 - vCenter * mapH;
      const u = (screenX - ox) / mapW;
      const v = (screenY - oy) / mapH;
      if (v < 0 || v > 1) return null;
      let lon = ((u * 360 - 180) + 180) % 360;
      if (lon < 0) lon += 360;
      return { lat: 90 - v * 180, lon: lon - 180 };
    }

    const cx = width / 2;
    const cy = height / 2;
    const radius = this.getSphereRadius(width, height, zoom);
    const nx = (screenX - cx) / radius;
    const ny = (cy - screenY) / radius;
    const r2 = nx * nx + ny * ny;
    if (r2 >= 1.0) return null;

    const nz = Math.sqrt(1.0 - r2);
    const phi0 = (rotLat * Math.PI) / 180;
    const lam0 = (rotLon * Math.PI) / 180;
    const sinP0 = Math.sin(phi0);
    const cosP0 = Math.cos(phi0);

    const vy = ny * cosP0 + nz * sinP0;
    const vz = -ny * sinP0 + nz * cosP0;
    const lat = (Math.asin(Math.max(-1, Math.min(1, vy))) * 180) / Math.PI;
    let lon = ((lam0 + Math.atan2(nx, vz)) * 180) / Math.PI;
    lon = ((lon + 180) % 360 + 360) % 360 - 180;
    return { lat, lon };
  }

  /**
   * Yakinlastikca tam ekran piksel kalitesi veren viewport-kesitli 3D kure cizimi
   */
  renderGlobe(ctx, state) {
    const {
      width, height, rotLat, rotLon, zoom, activeLayerId, isDragging,
      craters, activeCrater, basemapOpacity, filterAcidRain, filterDustStorm,
      showGraticule, showNomenclature, showRadiationZones, hazardsData,
      landingSites, startPoint, goalPoint, backendRoutes, progressiveLodRender
    } = state;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = this.getSphereRadius(width, height, zoom);

    // 1. Mars atmosferi dis halesi (ekrana sigdigi olcude)
    if (radius < width * 2.2) {
      const atmoGrad = ctx.createRadialGradient(cx, cy, radius * 0.94, cx, cy, radius * 1.11);
      atmoGrad.addColorStop(0.0, "rgba(235, 128, 70, 0.48)");
      atmoGrad.addColorStop(0.42, "rgba(205, 88, 38, 0.2)");
      atmoGrad.addColorStop(1.0, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = atmoGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.11, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!this.tileLoader.hasAnyReadyTile(activeLayerId)) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, Math.min(radius, width * 0.48), 0, Math.PI * 2);
      ctx.fillStyle = "#18100d";
      ctx.fill();
      ctx.strokeStyle = "rgba(244, 145, 92, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 12px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Mars karolari ./data/tiles/ dizininden yukleniyor...", cx, cy);
      ctx.restore();
      return [];
    }

    // 2. Sadece ekran penceresine giren kure dikdortgenini HiDPI 1:1 cozunurlukte hesapla
    const sx0 = Math.max(0, Math.floor(cx - radius - 2));
    const sy0 = Math.max(0, Math.floor(cy - radius - 2));
    const sx1 = Math.min(width, Math.ceil(cx + radius + 2));
    const sy1 = Math.min(height, Math.ceil(cy + radius + 2));
    const cropW = sx1 - sx0;
    const cropH = sy1 - sy0;

    if (cropW > 0 && cropH > 0) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const scale = isDragging ? 0.5 : dpr;
      const bw = Math.max(1, Math.round(cropW * scale));
      const bh = Math.max(1, Math.round(cropH * scale));
      this.ensureCropBuffer(bw, bh);

      const out = this.cropImgData.data;
      const layer = this.tileLoader.getLayerById(activeLayerId);
      const targetZ = this.tileLoader.computeTargetZoom({ zoom, sphereRadiusPx: radius, progressiveLodRender }, layer);

      const phi0 = (rotLat * Math.PI) / 180;
      const lam0 = (rotLon * Math.PI) / 180;
      const sinP0 = Math.sin(phi0);
      const cosP0 = Math.cos(phi0);

      const twoPi = Math.PI * 2;
      const invTwoPi = 1 / twoPi;
      const invPi = 1 / Math.PI;
      const halfPi = Math.PI / 2;
      const invScale = 1 / scale;
      const invRadius = 1 / radius;
      const opacityAlpha = Math.round(255 * (basemapOpacity ?? 1.0));
      const minLight = zoom > 2.2 ? 0.72 : 0.42;
      const rgb = this.rgbScratch;

      for (let by = 0; by < bh; by++) {
        const ny = (cy - (sy0 + (by + 0.5) * invScale)) * invRadius;
        const ny2 = ny * ny;
        const rowOff = by * bw;

        for (let bx = 0; bx < bw; bx++) {
          const idx = (rowOff + bx) * 4;
          const nx = ((sx0 + (bx + 0.5) * invScale) - cx) * invRadius;
          const r2 = nx * nx + ny2;
          if (r2 >= 1.0) {
            out[idx + 3] = 0;
            continue;
          }

          const nz = Math.sqrt(1.0 - r2);
          const vy = ny * cosP0 + nz * sinP0;
          const vz = -ny * sinP0 + nz * cosP0;
          const lat = Math.asin(vy > 1 ? 1 : vy < -1 ? -1 : vy);
          const lon = lam0 + Math.atan2(nx, vz);

          let u = (lon + Math.PI) * invTwoPi;
          u = u - Math.floor(u);
          const v = Math.min(0.99999, Math.max(0, (halfPi - lat) * invPi));

          if (!this.tileLoader.sampleBilinearRGB(activeLayerId, targetZ, u, v, rgb)) {
            out[idx] = 35; out[idx + 1] = 24; out[idx + 2] = 20; out[idx + 3] = opacityAlpha;
            continue;
          }

          const diff = Math.max(minLight, -0.32 * nx + 0.24 * ny + 0.91 * nz);
          const limb = nz < 0.6 ? Math.pow(1.0 - nz, 3.0) : 0;

          out[idx] = Math.min(255, rgb[0] * diff + limb * 135);
          out[idx + 1] = Math.min(255, rgb[1] * diff + limb * 64);
          out[idx + 2] = Math.min(255, rgb[2] * diff + limb * 30);
          out[idx + 3] = opacityAlpha;
        }
      }

      this.cropCtx.putImageData(this.cropImgData, 0, 0);
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.cropCanvas, sx0, sy0, cropW, cropH);
      ctx.restore();
    }

    ctx.save();
    if (radius < width * 2.2) {
      ctx.strokeStyle = "rgba(244, 145, 92, 0.72)";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (showGraticule) this.drawSphereGraticule(ctx, rotLat, rotLon, cx, cy, radius);
    if (filterDustStorm) this.drawHazardOverlays(ctx, rotLat, rotLon, cx, cy, radius, hazardsData, "dust");
    if (filterAcidRain) this.drawHazardOverlays(ctx, rotLat, rotLon, cx, cy, radius, hazardsData, "acid");
    if (showRadiationZones) this.drawPhotonRadiationBelts(ctx, rotLat, rotLon, cx, cy, radius);
    if (showNomenclature) this.drawGlobalNomenclature(ctx, rotLat, rotLon, cx, cy, radius);

    // Backend rotasini ve A/B noktalarini kure uzerine projekte et
    const projectFn = (lat, lon) => this.projectLatLonToSphere(lat, lon, rotLat, rotLon, cx, cy, radius);
    this.drawBackendRoutes(ctx, projectFn, startPoint, goalPoint, backendRoutes);

    const hitTargets = this.drawSpherePins(ctx, craters, landingSites, activeCrater, projectFn);
    ctx.restore();
    return hitTargets;
  }

  /**
   * 2D Equirectangular (EPSG:104905) tam kalite karolu harita cizimi
   */
  render2DTiled(ctx, state) {
    const {
      width, height, rotLat, rotLon, zoom, activeLayerId,
      craters, activeCrater, filterAcidRain, filterDustStorm,
      showGraticule, showNomenclature, showRadiationZones,
      startPoint, goalPoint, backendRoutes, progressiveLodRender
    } = state;

    ctx.clearRect(0, 0, width, height);

    const mapW = Math.max(width * 0.86, 620) * Math.min(Math.max(zoom, 0.65), 14.0);
    const mapH = mapW * 0.5;
    const ox = width / 2 - ((rotLon + 180) / 360) * mapW;
    const oy = height / 2 - ((90 - rotLat) / 180) * mapH;

    const layer = this.tileLoader.getLayerById(activeLayerId);
    const maxZ = this.tileLoader.computeTargetZoom({ zoom, sphereRadiusPx: mapW / (2 * Math.PI), progressiveLodRender }, layer);

    for (let z = 0; z <= maxZ; z++) {
      this.drawTileLevel2D(ctx, activeLayerId, z, ox, oy, mapW, mapH, width, height);
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
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
        if (px >= -80 && px <= width + 80 && py >= -20 && py <= height + 20) ctx.fillText(p.name, px - 42, py);
      });
    }

    const project2D = (lat, lon) => ({
      x: ox + ((lon + 180) / 360) * mapW,
      y: oy + ((90 - lat) / 180) * mapH,
      visible: true
    });
    this.drawBackendRoutes(ctx, project2D, startPoint, goalPoint, backendRoutes);

    const hitTargets = [];
    craters.forEach((crater) => {
      const p = project2D(crater.coordinates.lat, crater.coordinates.lon);
      const isActive = activeCrater && activeCrater.id === crater.id;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isActive ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#d92b2b" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.font = "bold 11px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(crater.name, p.x + 11, p.y + 4);
      hitTargets.push({ crater, x: p.x, y: p.y, r: 22 });
    });

    return hitTargets;
  }

  /**
   * Backend'den gelen Mavi (#2563eb) / Soluk Mavi (#93c5fd) rotalari ve A/B noktalarini cizer
   */
  drawBackendRoutes(ctx, projectFn, startPoint, goalPoint, backendRoutes) {
    if (backendRoutes?.alternative_route?.waypoints?.length) {
      this.strokeGeoPolyline(ctx, projectFn, backendRoutes.alternative_route.waypoints, "#93c5fd", 4, [7, 5]);
    }
    if (backendRoutes?.primary_route?.waypoints?.length) {
      this.strokeGeoPolyline(ctx, projectFn, backendRoutes.primary_route.waypoints, "#2563eb", 5, []);
    }

    if (startPoint) this.drawEndpointPin(ctx, projectFn, startPoint, "A (Başlangıç)", "#2563eb");
    if (goalPoint) this.drawEndpointPin(ctx, projectFn, goalPoint, "B (Hedef)", "#d92b2b");
  }

  strokeGeoPolyline(ctx, projectFn, waypoints, color, widthPx, dash) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = widthPx;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash(dash);
    ctx.beginPath();
    let started = false;
    waypoints.forEach((wp) => {
      const p = projectFn(wp.lat, wp.lon);
      if (!p.visible) { started = false; return; }
      if (!started) { ctx.moveTo(p.x, p.y); started = true; }
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  drawEndpointPin(ctx, projectFn, pt, label, color) {
    const p = projectFn(pt.lat, pt.lon);
    if (!p.visible) return;
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.font = "bold 11px 'Public Sans Web', 'Public Sans', sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(p.x + 10, p.y - 11, tw + 10, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(label, p.x + 15, p.y + 3);
    ctx.restore();
  }

  drawTileLevel2D(ctx, layerId, z, ox, oy, mapW, mapH, viewW, viewH) {
    const cols = 1 << (z + 1);
    const rows = 1 << z;
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

  drawSpherePins(ctx, craters, landingSites, activeCrater, projectFn) {
    const hitTargets = [];
    if (Array.isArray(landingSites)) {
      landingSites.forEach((site) => {
        const p = projectFn(site.coordinates.lat, site.coordinates.lon);
        if (!p.visible) return;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
        ctx.fill();
      });
    }

    craters.forEach((crater) => {
      const p = projectFn(crater.coordinates.lat, crater.coordinates.lon);
      if (!p.visible) return;
      const isActive = activeCrater && activeCrater.id === crater.id;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isActive ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#d92b2b" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
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
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
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
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
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
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, Math.min(radius * 0.25, 160));
      g.addColorStop(0, kind === "dust" ? "rgba(217, 43, 43, 0.34)" : "rgba(245, 158, 11, 0.34)");
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.min(radius * 0.25, 160), 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawPhotonRadiationBelts(ctx, rotLat, rotLon, cx, cy, radius) {
    const zones = [
      { lat: -5, lon: 137.4 },
      { lat: 18.4, lon: 77.4 },
      { lat: 73, lon: 165 }
    ];
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(167, 139, 250, 0.65)";
    ctx.lineWidth = 1.2;
    zones.forEach((z) => {
      const p = this.projectLatLonToSphere(z.lat, z.lon, rotLat, rotLon, cx, cy, radius);
      if (!p.visible) return;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.min(radius * 0.14, 110), 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc HiDPI 1:1 viewport-kesitli kure ve backend rota cizim motoru.
   - Satir 8-35: constructor, ensureCropBuffer ve getSphereRadius.
   - Satir 37-85: projectLatLonToSphere ve screenToLatLon (imlec/tiklama -> gercek Mars lat/lon).
   - Satir 87-205: renderGlobe; yalnizca gorunen ekran penceresini HiDPI 1:1 isin izlemeyle sampleBilinearRGB uzerinden cizer.
   - Satir 207-285: render2DTiled & drawTileLevel2D; 2D haritada tam cozunurluklu karolari basar.
   - Satir 287-424: drawBackendRoutes, strokeGeoPolyline, drawEndpointPin, krater pinleri, graticule ve radyasyon katmanlari.
   ========================================================================== */
