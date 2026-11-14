/**
 * @file MarsGlobeRenderer.js
 * @description NASA Mars Trek (EPSG:104905) ve Google Earth tarzı 3D Mars Küresi ile
 * küresel 2D Viking projeksiyonunu sıfır dış kütüphaneyle prosedürel olarak çizen motor.
 */

export class MarsGlobeRenderer {
  /**
   * MarsGlobeRenderer yapıcı metodu
   */
  constructor() {
    this.albedoWidth = 512;
    this.albedoHeight = 256;
    this.albedoPixels = null;
    this.albedoCanvas = null;

    this.sphereSize = 260;
    this.sphereCanvas = document.createElement("canvas");
    this.sphereCanvas.width = this.sphereSize;
    this.sphereCanvas.height = this.sphereSize;
    this.sphereCtx = this.sphereCanvas.getContext("2d");
    this.sphereImgData = this.sphereCtx.createImageData(this.sphereSize, this.sphereSize);

    this.buildMarsAlbedoTexture();
  }

  /**
   * Deterministik sözde-rastgele gürültü üreteci (Mars krater ve topoğrafya dokusu için)
   */
  hash2D(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  /**
   * Viking VIS Küresel Mozaik tarzı Mars albedo yüzey haritasını bellekte oluşturur
   */
  buildMarsAlbedoTexture() {
    const w = this.albedoWidth;
    const h = this.albedoHeight;
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");

    // 1. Temel Mars Pas Kırmızısı / Okra Kabuk Tabanı
    const baseGrad = ctx.createLinearGradient(0, 0, 0, h);
    baseGrad.addColorStop(0.0, "#dce5ee"); // Kuzey kutup buzu kenarı
    baseGrad.addColorStop(0.14, "#9d573d");
    baseGrad.addColorStop(0.5, "#b45e3c");
    baseGrad.addColorStop(0.86, "#88432b");
    baseGrad.addColorStop(1.0, "#ced9e3"); // Güney kutup buzu
    ctx.fillStyle = baseGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Büyük Albedo Bölgeleri: Syrtis Major, Acidalia, Tharsis, Arabia Terra
    const darkBasalts = [
      { lon: 68, lat: 10, rx: 46, ry: 55, a: 0.56 },   // Syrtis Major Planum
      { lon: -25, lat: 46, rx: 78, ry: 44, a: 0.42 },  // Mare Acidalia
      { lon: 15, lat: -20, rx: 95, ry: 34, a: 0.44 },  // Sabaeus & Meridiani kuşağı
      { lon: -115, lat: -18, rx: 85, ry: 40, a: 0.36 },// Mare Sirenum
      { lon: 138, lat: -5, rx: 32, ry: 28, a: 0.35 }   // Gale / Elysium koyu tabanı
    ];
    darkBasalts.forEach((b) => {
      const px = ((b.lon + 180) / 360) * w;
      const py = ((90 - b.lat) / 180) * h;
      const g = ctx.createRadialGradient(px, py, 4, px, py, b.rx);
      g.addColorStop(0, `rgba(42, 48, 56, ${b.a})`);
      g.addColorStop(0.7, `rgba(54, 52, 58, ${b.a * 0.55})`);
      g.addColorStop(1, "rgba(42, 48, 56, 0)");
      ctx.fillStyle = g;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, b.ry / b.rx);
      ctx.beginPath();
      ctx.arc(0, 0, b.rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // 3. Parlak Tozlu Tharsis & Olympus Mons Yüksekliği
    const brightDust = [
      { lon: -108, lat: 8, rx: 75, ry: 55, a: 0.42 },  // Tharsis Platosu
      { lon: -133, lat: 18, rx: 24, ry: 22, a: 0.55 }, // Olympus Mons
      { lon: 25, lat: 20, rx: 68, ry: 45, a: 0.32 }    // Arabia Terra
    ];
    brightDust.forEach((d) => {
      const px = ((d.lon + 180) / 360) * w;
      const py = ((90 - d.lat) / 180) * h;
      const g = ctx.createRadialGradient(px, py, 2, px, py, d.rx);
      g.addColorStop(0, `rgba(214, 136, 98, ${d.a})`);
      g.addColorStop(1, "rgba(214, 136, 98, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, d.rx, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4. Valles Marineris Kanyon Yarığı (-95° ila -40° Lon, -12° Lat)
    ctx.strokeStyle = "rgba(38, 22, 18, 0.72)";
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(((180 - 95) / 360) * w, ((90 + 8) / 180) * h);
    ctx.quadraticCurveTo(((180 - 65) / 360) * w, ((90 + 16) / 180) * h, ((180 - 38) / 360) * w, ((90 + 11) / 180) * h);
    ctx.stroke();

    // 5. Hellas Planitia Dev Havzası (70° E, -42° S)
    const hx = ((70 + 180) / 360) * w;
    const hy = ((90 + 42) / 180) * h;
    const hellas = ctx.createRadialGradient(hx, hy, 4, hx, hy, 34);
    hellas.addColorStop(0, "rgba(196, 132, 102, 0.58)");
    hellas.addColorStop(0.85, "rgba(90, 50, 38, 0.25)");
    hellas.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hellas;
    ctx.beginPath();
    ctx.arc(hx, hy, 34, 0, Math.PI * 2);
    ctx.fill();

    // 6. Güney Yarımküre Krater Dokusu
    for (let i = 0; i < 360; i++) {
      const rx = this.hash2D(i, 1.3) * w;
      const ry = (0.12 + this.hash2D(i, 4.7) * 0.76) * h;
      const cr = 1.2 + this.hash2D(i, 9.1) * 4.5;
      ctx.fillStyle = i % 2 === 0 ? "rgba(32, 20, 18, 0.34)" : "rgba(225, 165, 130, 0.22)";
      ctx.beginPath();
      ctx.arc(rx, ry, cr, 0, Math.PI * 2);
      ctx.fill();
      if (cr > 3.2) {
        ctx.strokeStyle = "rgba(235, 175, 145, 0.28)";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
    }

    // 7. Kutupsal Su ve Karbondioksit Buzu Katmanları
    const nPole = ctx.createLinearGradient(0, 0, 0, 26);
    nPole.addColorStop(0, "#eef4f8");
    nPole.addColorStop(1, "rgba(238, 244, 248, 0)");
    ctx.fillStyle = nPole;
    ctx.fillRect(0, 0, w, 26);

    const sPole = ctx.createLinearGradient(0, h - 22, 0, h);
    sPole.addColorStop(0, "rgba(225, 232, 240, 0)");
    sPole.addColorStop(1, "#e2eaf0");
    ctx.fillStyle = sPole;
    ctx.fillRect(0, h - 22, w, 22);

    this.albedoCanvas = off;
    this.albedoPixels = ctx.getImageData(0, 0, w, h).data;
  }

  /**
   * Bir (lat, lon) noktasını mevcut kamera dönme açılarına göre 3D ekran koordinatına dönüştürür
   */
  projectLatLonToSphere(latDeg, lonDeg, rotLatDeg, rotLonDeg, cx, cy, radius) {
    const phi = (latDeg * Math.PI) / 180;
    const lambda = (lonDeg * Math.PI) / 180;
    const phi0 = (rotLatDeg * Math.PI) / 180;
    const lam0 = (rotLonDeg * Math.PI) / 180;

    // 3B Kartezyen nokta (küre üzerinde)
    const cosPhi = Math.cos(phi);
    const x0 = cosPhi * Math.sin(lambda - lam0);
    const y0 = Math.sin(phi);
    const z0 = cosPhi * Math.cos(lambda - lam0);

    // Enlem eğimi (X ekseninde dönüş)
    const y1 = y0 * Math.cos(phi0) - z0 * Math.sin(phi0);
    const z1 = y0 * Math.sin(phi0) + z0 * Math.cos(phi0);

    return {
      x: cx + x0 * radius,
      y: cy - y1 * radius,
      z: z1,
      visible: z1 > 0.08
    };
  }

  /**
   * 3D Küresel Mars Gezegenini (NASA Mars Trek 3D Globe görünümü) çizer
   */
  renderGlobe(ctx, state) {
    const {
      width, height, rotLat, rotLon, zoom, craters, activeCrater,
      basemapOpacity, filterAcidRain, filterDustStorm,
      showGraticule, showNomenclature
    } = state;

    ctx.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.43 * Math.min(Math.max(zoom, 0.55), 2.3);

    // 1. Mars Atmosferi Kehribar/Turuncu Dış Halesi (NASA Mars Trek imza ışıması)
    const atmoGrad = ctx.createRadialGradient(cx, cy, radius * 0.94, cx, cy, radius * 1.11);
    atmoGrad.addColorStop(0.0, "rgba(235, 130, 75, 0.55)");
    atmoGrad.addColorStop(0.35, "rgba(210, 95, 45, 0.28)");
    atmoGrad.addColorStop(1.0, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = atmoGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.11, 0, Math.PI * 2);
    ctx.fill();

    // 2. Küre Piksel Projeksiyonunu Çiz (Hızlı CPU Ray-Sphere Sampler)
    const s = this.sphereSize;
    const half = s / 2;
    const invHalf = 1 / half;
    const imgData = this.sphereImgData;
    const out = imgData.data;
    const tex = this.albedoPixels;
    const tw = this.albedoWidth;
    const th = this.albedoHeight;

    const phi0 = (rotLat * Math.PI) / 180;
    const lam0 = (rotLon * Math.PI) / 180;
    const sinP0 = Math.sin(phi0);
    const cosP0 = Math.cos(phi0);

    // Güneş ışığı vektörü (sol-üstten hafif derinlik gölgesi)
    const lx = -0.35;
    const ly = 0.25;
    const lz = 0.9;

    const twoPi = Math.PI * 2;
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

        // X ekseni etrafında ters enlem dönüşü
        const vy = ny * cosP0 + nz * sinP0;
        const vz = -ny * sinP0 + nz * cosP0;
        const vx = nx;

        const lat = Math.asin(Math.max(-1, Math.min(1, vy)));
        let lon = lam0 + Math.atan2(vx, vz);
        lon = ((lon + Math.PI) % twoPi + twoPi) % twoPi - Math.PI;

        const u = Math.min(tw - 1, Math.max(0, ((lon + Math.PI) / twoPi) * tw) | 0);
        const v = Math.min(th - 1, Math.max(0, ((Math.PI / 2 - lat) / Math.PI) * th) | 0);
        const tidx = (v * tw + u) * 4;

        // Küresel gölgeleme + kenar atmosfer sıcaklığı
        const diff = Math.max(0.28, nx * lx + ny * ly + nz * lz);
        const limb = Math.pow(1.0 - nz, 2.6);

        out[idx] = Math.min(255, tex[tidx] * diff + limb * 155);
        out[idx + 1] = Math.min(255, tex[tidx + 1] * diff + limb * 72);
        out[idx + 2] = Math.min(255, tex[tidx + 2] * diff + limb * 35);
        out[idx + 3] = Math.round(255 * opacityMult);
      }
    }

    this.sphereCtx.putImageData(imgData, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.sphereCanvas, cx - radius, cy - radius, radius * 2, radius * 2);

    // Keskin atmosfer rim çizgisi
    ctx.strokeStyle = "rgba(244, 145, 92, 0.78)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 3. İsteğe Bağlı Küresel Enlem/Boylam Ağı (Graticule)
    if (showGraticule) {
      this.drawSphereGraticule(ctx, rotLat, rotLon, cx, cy, radius);
    }

    // 4. Sol Alt Tehlike Filtrelerinin Gezegen Ölçeğindeki Etkisi
    if (filterDustStorm) {
      this.drawGlobalDustBand(ctx, rotLat, rotLon, cx, cy, radius);
    }
    if (filterAcidRain) {
      this.drawGlobalAcidBelt(ctx, rotLat, rotLon, cx, cy, radius);
    }

    // 5. Mars Yüzey Adlandırmaları (Nomenclature)
    if (showNomenclature) {
      this.drawGlobalNomenclature(ctx, rotLat, rotLon, cx, cy, radius);
    }

    // 6. Tıklanabilir Hedef Krater İşaretçileri
    const hitTargets = [];
    craters.forEach((crater) => {
      const p = this.projectLatLonToSphere(crater.coordinates.lat, crater.coordinates.lon, rotLat, rotLon, cx, cy, radius);
      if (!p.visible) return;

      const isActive = activeCrater && activeCrater.id === crater.id;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isActive ? 9 : 6, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#e03c31" : "#ffffff";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#000000";
      ctx.stroke();

      // Dış ping halkası
      ctx.beginPath();
      ctx.arc(p.x, p.y, isActive ? 16 : 11, 0, Math.PI * 2);
      ctx.strokeStyle = isActive ? "rgba(224, 60, 49, 0.85)" : "rgba(255, 255, 255, 0.55)";
      ctx.lineWidth = 1.4;
      ctx.stroke();

      ctx.font = "bold 11px 'Public Sans Web', 'Public Sans', sans-serif";
      const label = crater.id === "gale-crater" ? `★ ${crater.name}` : crater.name;
      const twLabel = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(10, 10, 12, 0.84)";
      ctx.fillRect(p.x + 12, p.y - 10, twLabel + 10, 20);
      ctx.strokeStyle = isActive ? "#e03c31" : "rgba(255,255,255,0.4)";
      ctx.lineWidth = 1;
      ctx.strokeRect(p.x + 12, p.y - 10, twLabel + 10, 20);

      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, p.x + 17, p.y + 4);

      hitTargets.push({ crater, x: p.x, y: p.y, r: 22 });
    });

    ctx.restore();
    return hitTargets;
  }

  /**
   * 3D Küre üzerinde enlem/boylam graticule çizgilerini çizer
   */
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

  /**
   * Gezegen ölçeğinde IAU Mars bölge adlarını yerleştirir
   */
  drawGlobalNomenclature(ctx, rotLat, rotLon, cx, cy, radius) {
    const places = [
      { name: "VALLES MARINERIS", lat: -13, lon: -65 },
      { name: "OLYMPUS MONS", lat: 18.6, lon: -133.8 },
      { name: "SYRTIS MAJOR", lat: 8.4, lon: 69.5 },
      { name: "HELLAS PLANITIA", lat: -42.4, lon: 70.5 },
      { name: "ARABIA TERRA", lat: 21, lon: 25 }
    ];
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillStyle = "rgba(255, 240, 225, 0.72)";
    places.forEach((pl) => {
      const p = this.projectLatLonToSphere(pl.lat, pl.lon, rotLat, rotLon, cx, cy, radius);
      if (p.visible && p.z > 0.25) {
        ctx.fillText(pl.name, p.x - 36, p.y);
      }
    });
  }

  /**
   * Küre üzerinde global kum fırtınası koridorlarını gösterir
   */
  drawGlobalDustBand(ctx, rotLat, rotLon, cx, cy, radius) {
    const stormCenters = [{ lat: -18, lon: 95 }, { lat: 12, lon: 145 }];
    stormCenters.forEach((st) => {
      const p = this.projectLatLonToSphere(st.lat, st.lon, rotLat, rotLon, cx, cy, radius);
      if (!p.visible) return;
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, radius * 0.28);
      g.addColorStop(0, "rgba(220, 38, 38, 0.36)");
      g.addColorStop(1, "rgba(220, 38, 38, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.28, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /**
   * Küre üzerinde volkanik/sülfat asidik sis bölgelerini gösterir
   */
  drawGlobalAcidBelt(ctx, rotLat, rotLon, cx, cy, radius) {
    const acidZones = [{ lat: -5, lon: 137 }, { lat: -10, lon: -95 }];
    acidZones.forEach((az) => {
      const p = this.projectLatLonToSphere(az.lat, az.lon, rotLat, rotLon, cx, cy, radius);
      if (!p.visible) return;
      const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, radius * 0.22);
      g.addColorStop(0, "rgba(245, 158, 11, 0.34)");
      g.addColorStop(1, "rgba(245, 158, 11, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /**
   * Küresel 2D Equirectangular (NASA Mars Trek EPSG:104905) projeksiyonunu çizer
   */
  renderEquirectangular2D(ctx, state) {
    const { width, height, craters, activeCrater, basemapOpacity, showGraticule } = state;
    ctx.clearRect(0, 0, width, height);

    const mapW = Math.min(width * 0.88, height * 1.76);
    const mapH = mapW * 0.5;
    const ox = (width - mapW) / 2;
    const oy = (height - mapH) / 2;

    ctx.save();
    ctx.globalAlpha = basemapOpacity ?? 1.0;
    ctx.drawImage(this.albedoCanvas, ox, oy, mapW, mapH);
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.strokeRect(ox, oy, mapW, mapH);

    if (showGraticule) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      for (let x = 1; x < 6; x++) {
        const px = ox + (mapW / 6) * x;
        ctx.beginPath(); ctx.moveTo(px, oy); ctx.lineTo(px, oy + mapH); ctx.stroke();
      }
      for (let y = 1; y < 4; y++) {
        const py = oy + (mapH / 4) * y;
        ctx.beginPath(); ctx.moveTo(ox, py); ctx.lineTo(ox + mapW, py); ctx.stroke();
      }
    }

    const hitTargets = [];
    craters.forEach((crater) => {
      const px = ox + ((crater.coordinates.lon + 180) / 360) * mapW;
      const py = oy + ((90 - crater.coordinates.lat) / 180) * mapH;
      const isActive = activeCrater && activeCrater.id === crater.id;

      ctx.beginPath();
      ctx.arc(px, py, isActive ? 8 : 5.5, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? "#e03c31" : "#ffffff";
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.font = "bold 11px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(crater.name, px + 10, py + 4);
      hitTargets.push({ crater, x: px, y: py, r: 20 });
    });

    return hitTargets;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc MarsGlobeRenderer küresel Mars projeksiyon sınıfı açıklaması.
   - Satır 7: MarsGlobeRenderer sınıfının dışa aktarılması.
   - Satır 8-22: constructor; offscreen albedo ve 3D küre tamponlarını hazırlar, dokuyu inşa eder.
   - Satır 24-30: hash2D; krater pütürlerini deterministik üretir.
   - Satır 32-119: buildMarsAlbedoTexture; Syrtis Major, Tharsis, Valles Marineris, Hellas ve kutup buzlarıyla Viking VIS benzeri küresel Mars yüzeyini çizer.
   - Satır 121-141: projectLatLonToSphere; enlem/boylam koordinatlarını küre döndürme açılarına göre 3B ekran noktasına çevirir.
   - Satır 143-239: renderGlobe; atmosferik kehribar halesi ve gerçek zamanlı güneş gölgelendirmeli 3D Mars küresini çizer, tıklanabilir kraterleri döndürür.
   - Satır 241-311: drawSphereGraticule, drawGlobalNomenclature, drawGlobalDustBand ve drawGlobalAcidBelt küresel katman yardımcıları.
   - Satır 313-358: renderEquirectangular2D; EPSG:104905 silindirik küresel 2D projeksiyonunu çizer.
   ========================================================================== */
