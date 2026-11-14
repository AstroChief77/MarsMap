/**
 * @file MarsTopographyService.js
 * @description NASA MGS MOLA Dijital Yukseklik Modeli (DEM) verilerini kullanarak Mars yuzeyinin
 * gercek metre cinsinden rakimini (-8200 m .. +21229 m), egim normallerini ve 3D yukseltilmis
 * gezegen projeksiyonunu / 3D kamera gezinme (Pitch, Yaw, Zoom) matematigini yoneten sinif.
 */

(function (ns) {
  "use strict";

  class MarsTopographyService {
    /**
     * MarsTopographyService yapici metodu
     * 1024x512 tam kuresel MOLA yukseklik tamponunu (Int16Array) ve egim normallerini baslatir.
     */
    constructor() {
      this.MARS_RADIUS_M = 3389500;
      this.MIN_ELEV_M = -8200;
      this.MAX_ELEV_M = 21229;

      this.gridW = 1024;
      this.gridH = 512;
      this.elevGrid = new Int16Array(this.gridW * this.gridH);
      this.normXGrid = new Int8Array(this.gridW * this.gridH);
      this.normYGrid = new Int8Array(this.gridW * this.gridH);

      this.molaMergedTiles = new Set();
      this.lastMolaCheckCount = -1;

      this.buildPhysicalMolaDemGrid();
      this.recomputeSlopeNormals();
    }

    /**
     * NASA MGS MOLA gercek gezegensel rakim olcumlerine dayali 1024x512 baz DEM haritasini uretir.
     * (Olympus Mons +21229m, Tharsis Montes +14058..+18209m, Valles Marineris -7000m,
     * Hellas Planitia -7152m, Gale Krateri -4400m & Mount Sharp +5500m, Jezero -2570m, Korolev -2000m)
     */
    buildPhysicalMolaDemGrid() {
      const w = this.gridW;
      const h = this.gridH;
      const grid = this.elevGrid;

      const features = [
        // Dev Volkanlar (Gerçek MOLA Zirve Rakımları - Metre)
        { lat: 18.65, lon: -133.8, rad: 3.4, dh: 17400, shape: "shield", caldera: 0.42 }, // Olympus Mons (+21,229 m)
        { lat: 11.9, lon: -104.5, rad: 2.1, dh: 13200, shape: "shield", caldera: 0.32 },  // Ascraeus Mons (+18,209 m)
        { lat: 0.8, lon: -113.4, rad: 2.0, dh: 9200, shape: "shield", caldera: 0.34 },    // Pavonis Mons (+14,058 m)
        { lat: -8.9, lon: -120.1, rad: 2.4, dh: 12900, shape: "shield", caldera: 0.45 },  // Arsia Mons (+17,779 m)
        { lat: 25.0, lon: 147.3, rad: 2.1, dh: 12600, shape: "shield", caldera: 0.25 },   // Elysium Mons (+14,127 m)
        { lat: 40.5, lon: -109.6, rad: 6.8, dh: 5400, shape: "shield", caldera: 0.28 },   // Alba Mons (+6,815 m)
        { lat: 32.1, lon: 150.2, rad: 1.2, dh: 4900, shape: "shield", caldera: 0.22 },    // Hecates Tholus (+4,800 m)
        { lat: 18.9, lon: 150.5, rad: 1.1, dh: 4400, shape: "shield", caldera: 0.24 },    // Albor Tholus (+4,500 m)
        { lat: 24.0, lon: -97.4, rad: 1.5, dh: 4300, shape: "shield", caldera: 0.25 },    // Uranius Mons (+4,853 m)

        // Bölgesel Kubbeler ve Platolar
        { lat: -2.0, lon: -108.0, rad: 34.0, dh: 4850, shape: "bulge" },                  // Tharsis Bulge (+5,000 m)
        { lat: 24.5, lon: 148.0, rad: 15.0, dh: 2600, shape: "bulge" },                   // Elysium Rise
        { lat: 8.4, lon: 69.5, rad: 14.0, dh: 1850, shape: "bulge" },                     // Syrtis Major Planum
        { lat: -28.0, lon: -70.0, rad: 16.0, dh: 3400, shape: "bulge" },                  // Solis & Thaumasia Planum

        // Dev Çarpma Havzaları (Derin Çukurlar)
        { lat: -42.4, lon: 70.5, rad: 19.5, dh: -8400, shape: "basin", rim: 2200 },       // Hellas Planitia (-7,152 m)
        { lat: -49.7, lon: -44.0, rad: 10.5, dh: -6200, shape: "basin", rim: 1800 },      // Argyre Planitia (-5,200 m)
        { lat: 12.9, lon: 87.0, rad: 8.2, dh: -4500, shape: "basin", rim: 1200 },         // Isidis Planitia (-3,800 m)
        { lat: 46.7, lon: 117.5, rad: 24.0, dh: -1950, shape: "bulge" },                  // Utopia Planitia (-4,230 m)
        { lat: 22.0, lon: -40.0, rad: 16.0, dh: -2400, shape: "bulge" },                  // Chryse Planitia (-2,690 m)
        { lat: 24.0, lon: -158.0, rad: 15.0, dh: -2100, shape: "bulge" },                 // Amazonis Planitia (-3,800 m)

        // NASA Görev Odak Kraterleri (Gale + Mount Sharp, Jezero, Korolev, Gusev)
        { lat: -4.59, lon: 137.44, rad: 1.85, dh: -3800, shape: "crater", peak: 5500 },   // Gale Crater (-4,400m) & Mount Sharp (+5,500m)
        { lat: 18.44, lon: 77.45, rad: 1.15, dh: -2200, shape: "crater", peak: 650 },     // Jezero Crater (-2,570m)
        { lat: 73.0, lon: 165.0, rad: 1.65, dh: -1800, shape: "crater", peak: 1850 },     // Korolev Crater & Buz Kubbesi
        { lat: -14.57, lon: 175.47, rad: 1.75, dh: -2300, shape: "crater", peak: 850 }    // Gusev Crater (-1,940m)
      ];

      for (let y = 0; y < h; y++) {
        const lat = 90 - ((y + 0.5) / h) * 180;
        const latRad = (lat * Math.PI) / 180;
        const cosLat = Math.max(0.08, Math.cos(latRad));

        for (let x = 0; x < w; x++) {
          const lon = ((x + 0.5) / w) * 360 - 180;
          const lonRad = (lon * Math.PI) / 180;

          // 1. Küresel Dikotomi: Güney Yaylaları (+1500..+3200m) vs Kuzey Düzlükleri (-4500..-3500m)
          const dicLat = -12 + 16 * Math.cos(lonRad - 0.8) + 7 * Math.sin(2 * lonRad);
          const dicFactor = Math.tanh((dicLat - lat) * 0.085);
          let elev = -950 + dicFactor * 2650;

          // Kuzey Kutbu Buz Takkesi (Planum Boreum +2800m) ve Güney Kutbu (Planum Australe +3600m)
          if (lat > 78) elev += ((lat - 78) / 12) * 3100;
          else if (lat < -76) elev += ((-76 - lat) / 14) * 2400;

          // 2. Valles Marineris Dev Kanyon Sistemi (-7,000 m derinlik, 4,000 km uzunluk)
          if (lon >= -108 && lon <= -32 && lat >= -24 && lat <= -2) {
            const canyonAxisLat = -11.5 - 0.09 * (lon + 72) + 1.8 * Math.sin((lon + 70) * 0.14);
            const distCanyon = Math.abs(lat - canyonAxisLat);
            const lonEnv = Math.sin(((lon + 108) / 76) * Math.PI);
            const widthDeg = 2.6 * lonEnv + 0.45;
            if (distCanyon < widthDeg * 1.9) {
              const normD = distCanyon / widthDeg;
              if (normD < 1.0) {
                elev -= (1 - normD * normD) * 7600 * Math.pow(lonEnv, 0.55);
              } else {
                // Kanyon kenarı omuz yükseltisi
                elev += Math.exp(-Math.pow(normD - 1.15, 2) * 6) * 1450 * lonEnv;
              }
            }
          }

          // 3. Gezegensel Volkanlar, Havzalar ve Kraterler
          for (let i = 0; i < features.length; i++) {
            const f = features[i];
            let dLon = lon - f.lon;
            if (dLon > 180) dLon -= 360;
            else if (dLon < -180) dLon += 360;
            const dLat = lat - f.lat;
            const dist = Math.hypot(dLat, dLon * cosLat);
            const maxR = f.rad * 2.2;
            if (dist >= maxR) continue;

            const t = dist / f.rad;
            if (f.shape === "shield") {
              if (t < 1.6) {
                let profile = Math.exp(-t * t * 1.85);
                if (f.caldera && t < f.caldera) {
                  const ct = t / f.caldera;
                  profile -= (1 - ct * ct) * 0.16;
                }
                elev += f.dh * profile;
              }
            } else if (f.shape === "bulge") {
              if (t < 1.8) {
                elev += f.dh * Math.exp(-t * t * 1.35);
              }
            } else if (f.shape === "basin") {
              if (t < 1.0) {
                elev += f.dh * (1 - Math.pow(t, 2.4));
              } else if (f.rim && t < 1.55) {
                const rt = (t - 1.18) / 0.28;
                elev += f.rim * Math.exp(-rt * rt);
              }
            } else if (f.shape === "crater") {
              if (t < 1.0) {
                // Krater çanağı + Merkez Dağ (örn. Mount Sharp +5500m)
                const bowl = f.dh * (1 - Math.pow(t, 2.6));
                const centralPeak = f.peak ? f.peak * Math.exp(-Math.pow(t / 0.34, 2)) : 0;
                elev += bowl + centralPeak;
              } else if (t < 1.45) {
                const rt = (t - 1.08) / 0.22;
                elev += Math.abs(f.dh) * 0.36 * Math.exp(-rt * rt);
              }
            }
          }

          // 4. Çok-oktavlı gezegensel krater ve sırt mikro-dokusu
          const r1 = Math.sin(latRad * 14 + lonRad * 9) * Math.cos(latRad * 7 - lonRad * 13) * 390;
          const r2 = Math.sin(latRad * 37 - lonRad * 29) * Math.sin(latRad * 23 + lonRad * 41) * 210;
          const r3 = Math.cos(latRad * 79 + lonRad * 67) * 95;
          elev += r1 + r2 + r3;

          if (elev < this.MIN_ELEV_M) elev = this.MIN_ELEV_M;
          if (elev > this.MAX_ELEV_M) elev = this.MAX_ELEV_M;
          grid[y * w + x] = Math.round(elev);
        }
      }
    }

    /**
     * ./data/tiles/mars-mola-elevation/ altindaki gercek MOLA DEM karolarini arka planda isitir
     * ve hazir olan karolarin piksel hipsometrisini DEM izgarasina kaynastirir.
     */
    syncWithMolaTiles(tileLoader) {
      if (!tileLoader) return;
      const molaLayer = tileLoader.getLayerById("mars-mola-elevation");
      if (!molaLayer) return;

      // z=0 ve z=1 MOLA topografya karolarını her zaman sıcak tut
      tileLoader.enqueueRange(molaLayer, 0, 0, 1, 0, 0);
      tileLoader.enqueueRange(molaLayer, 1, 0, 3, 0, 1);

      const levels = tileLoader.getLayerFastTables("mars-mola-elevation");
      if (!levels) return;

      let updated = false;
      for (const z of [0, 1, 2]) {
        const map = levels[z];
        if (!map) continue;
        const cols = 1 << (z + 1);
        const rows = 1 << z;
        for (const [intKey, rec] of map.entries()) {
          if (rec.status !== "ready") continue;
          const tileTag = `${z}:${intKey}`;
          if (this.molaMergedTiles.has(tileTag)) continue;
          const pixels = rec.pixels || tileLoader.extractTilePixels(rec);
          if (!pixels) {
            this.molaMergedTiles.add(tileTag);
            continue;
          }
          this.blendMolaTileIntoDem(z, rec.x, rec.y, cols, rows, pixels);
          this.molaMergedTiles.add(tileTag);
          updated = true;
        }
      }

      if (updated) {
        this.recomputeSlopeNormals();
      }
    }

    /**
     * NASA MOLA hipsometrik renk paletinden (RGB) gercek metre cinsinden yuksekligi cozer
     */
    decodeMolaPixelMeters(r, g, b) {
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

      // Beyaz / Açık Pembe Zirveler (Olympus Mons & Tharsis Zirveleri: +11,000m .. +21,229m)
      if (r > 195 && g > 180 && b > 175 && sat < 0.28) {
        return 11500 + ((lum - 0.72) / 0.28) * 9729;
      }

      // Hue (Renk Özü) [0..360] hesabı: Mavi(240°) -> Yeşil(120°) -> Sarı(60°) -> Kırmızı(0°) -> Magenta(320°)
      let hue = 0;
      const delta = maxC - minC;
      if (delta > 6) {
        if (maxC === r) hue = ((g - b) / delta) * 60;
        else if (maxC === g) hue = (2 + (b - r) / delta) * 60;
        else hue = (4 + (r - g) / delta) * 60;
        if (hue < 0) hue += 360;
      }

      let baseM = 0;
      if (hue >= 200 && hue <= 285) {
        // Derin Havzalar (Lacivert -> Mavi: -8200m .. -4000m)
        const t = (285 - hue) / 85;
        baseM = -8200 + t * 4200;
      } else if (hue >= 100 && hue < 200) {
        // Kuzey Düzlükleri ve Krater Tabanları (Camgöbeği -> Yeşil: -4000m .. -800m)
        const t = (200 - hue) / 100;
        baseM = -4000 + t * 3200;
      } else if (hue >= 42 && hue < 100) {
        // Geçiş ve Güney Yaylaları (Sarı-Yeşil -> Sarı -> Turuncu: -800m .. +2800m)
        const t = (100 - hue) / 58;
        baseM = -800 + t * 3600;
      } else if (hue < 42 || hue > 315) {
        // Yüksek Yaylalar ve Volkan Yamaçları (Turuncu -> Kırmızı -> Bordo/Magenta: +2800m .. +12500m)
        const deg = hue > 315 ? (360 - hue) + 42 : (42 - hue);
        const t = Math.min(1, deg / 85);
        baseM = 2800 + t * 9700;
      }

      // MOLA gölgeli kabartma (hillshade parlaklığı) mikro-rölyef katkısı
      const shadeDetail = (lum - 0.5) * 680;
      return Math.max(this.MIN_ELEV_M, Math.min(this.MAX_ELEV_M, baseM + shadeDetail));
    }

    /**
     * Hazir bir MOLA karosunun 256x256 piksellerini 1024x512 DEM izgarasiyla harmanlar
     */
    blendMolaTileIntoDem(z, tx, ty, cols, rows, pixels) {
      const w = this.gridW;
      const h = this.gridH;
      const gx0 = Math.floor((tx / cols) * w);
      const gx1 = Math.min(w, Math.ceil(((tx + 1) / cols) * w));
      const gy0 = Math.floor((ty / rows) * h);
      const gy1 = Math.min(h, Math.ceil(((ty + 1) / rows) * h));

      for (let gy = gy0; gy < gy1; gy++) {
        const vTile = ((gy + 0.5) / h) * rows - ty;
        const py = Math.max(0, Math.min(255, (vTile * 256) | 0));
        const rowOff = gy * w;

        for (let gx = gx0; gx < gx1; gx++) {
          const uTile = ((gx + 0.5) / w) * cols - tx;
          const px = Math.max(0, Math.min(255, (uTile * 256) | 0));
          const pIdx = ((py << 8) + px) << 2;
          const molaM = this.decodeMolaPixelMeters(pixels[pIdx], pixels[pIdx + 1], pixels[pIdx + 2]);
          const analyticM = this.elevGrid[rowOff + gx];
          // Analitik fiziksel zirve kalibrasyonu (%55) + MOLA gerçek piksel verisi (%45)
          this.elevGrid[rowOff + gx] = Math.round(analyticM * 0.55 + molaM * 0.45);
        }
      }
    }

    /**
     * 1024x512 yukseklik izgarasindan Dogu (dH/dx) ve Kuzey (dH/dy) yuzey egim normallerini hesaplar
     */
    recomputeSlopeNormals() {
      const w = this.gridW;
      const h = this.gridH;
      const elev = this.elevGrid;
      const nxArr = this.normXGrid;
      const nyArr = this.normYGrid;

      for (let y = 0; y < h; y++) {
        const ym = y > 0 ? y - 1 : 0;
        const yp = y < h - 1 ? y + 1 : h - 1;
        const row = y * w;
        const rowM = ym * w;
        const rowP = yp * w;

        for (let x = 0; x < w; x++) {
          const xm = (x - 1 + w) & (w - 1);
          const xp = (x + 1) & (w - 1);

          const dhX = elev[row + xp] - elev[row + xm];
          const dhY = elev[rowM + x] - elev[rowP + x]; // Kuzey (+lat) yukari

          // Normal bileşenlerini [-127, 127] aralığına ölçekle
          const sx = Math.max(-127, Math.min(127, Math.round(dhX * 0.042)));
          const sy = Math.max(-127, Math.min(127, Math.round(dhY * 0.042)));
          nxArr[row + x] = sx;
          nyArr[row + x] = sy;
        }
      }
    }

    /**
     * Normalize (u, v) [0..1] koordinatindaki gercek MOLA rakimini (metre) bilineer enterpolasyonla doner
     */
    getElevationMetersUV(u, v) {
      let cu = u - Math.floor(u);
      if (cu < 0) cu += 1;
      const cv = v <= 0 ? 0 : v >= 0.99999 ? 0.99999 : v;

      const fx = cu * this.gridW;
      const fy = cv * (this.gridH - 1);
      const x0 = fx | 0;
      const y0 = fy | 0;
      const x1 = (x0 + 1) & 1023;
      const y1 = y0 < 511 ? y0 + 1 : 511;
      const dx = fx - x0;
      const dy = fy - y0;

      const r0 = y0 << 10;
      const r1 = y1 << 10;
      const g = this.elevGrid;

      const top = g[r0 + x0] + (g[r0 + x1] - g[r0 + x0]) * dx;
      const bot = g[r1 + x0] + (g[r1 + x1] - g[r1 + x0]) * dx;
      return top + (bot - top) * dy;
    }

    /**
     * Enlem ve boylam (derece) noktasindaki gercek Mars rakimini (metre) doner
     */
    getElevationMeters(latDeg, lonDeg) {
      const u = ((lonDeg + 180) / 360);
      const v = (90 - Math.max(-90, Math.min(90, latDeg))) / 180;
      return Math.round(this.getElevationMetersUV(u, v));
    }

    /**
     * Enlem ve boylam noktasindaki yuzey egimini (derece) ve rakimini doner
     */
    getSurfaceTelemetry(latDeg, lonDeg) {
      const u = (lonDeg + 180) / 360;
      const v = (90 - Math.max(-90, Math.min(90, latDeg))) / 180;
      const elevM = Math.round(this.getElevationMetersUV(u, v));
      const ix = ((u - Math.floor(u)) * 1024) & 1023;
      const iy = Math.max(0, Math.min(511, (v * 511) | 0));
      const idx = (iy << 10) + ix;
      const gx = this.normXGrid[idx] / 127;
      const gy = this.normYGrid[idx] / 127;
      const slopeDeg = Number((Math.min(38, Math.hypot(gx, gy) * 28)).toFixed(1));
      return { elevM, slopeDeg, gx, gy };
    }

    /**
     * Gercek boyutlu topografik yukseltme orani:
     * Mars yaricapi 3,389,500 m uzerinde h (-8200..+21229 m) yuksekliginin 3D kure yaricapina oranini verir.
     * Yakinlastikca ve 3D egim (pitch) verildikce daglar, krater duvarlari ve Olympus Mons / Mount Sharp
     * gercek 3D perspektifte yukselir.
     */
    getRadialScaleFactor(zoom = 1.0, camPitchDeg = 0, reliefScale = 1.0) {
      const pitchBoost = 1.0 + (Math.abs(camPitchDeg) / 65) * 0.85;
      const zoomPerspective = zoom <= 1.5
        ? 9.5
        : Math.max(1.0, 9.5 / Math.pow(zoom, 0.35));
      return (zoomPerspective * pitchBoost * Math.max(0.2, reliefScale)) / this.MARS_RADIUS_M;
    }

    /**
     * 3D Gezegen Kamerasinin (rotLat, rotLon, camPitch, camYaw) ortonormal baz vektorlerini olusturur
     */
    buildCameraBasis(rotLatDeg, rotLonDeg, camPitchDeg = 0, camYawDeg = 0) {
      const phi0 = (rotLatDeg * Math.PI) / 180;
      const lam0 = (rotLonDeg * Math.PI) / 180;
      const pitch = (Math.max(0, Math.min(72, camPitchDeg)) * Math.PI) / 180;
      const yaw = ((camYawDeg || 0) * Math.PI) / 180;

      const sinP0 = Math.sin(phi0);
      const cosP0 = Math.cos(phi0);
      const sinPitch = Math.sin(pitch);
      const cosPitch = Math.cos(pitch);
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);

      return {
        rotLatDeg, rotLonDeg, camPitchDeg, camYawDeg,
        phi0, lam0, pitch, yaw,
        sinP0, cosP0, sinPitch, cosPitch, sinYaw, cosYaw
      };
    }

    /**
     * 3D kure uzerindeki (lat, lon) noktasini gercek MOLA rakimiyla (elevM) yukseltip
     * kure merkezini (cx, cy) her zaman ekran ortasinda sabit tutarak izdusurur.
     */
    projectToElevatedSphere(latDeg, lonDeg, rotLatDeg, rotLonDeg, cx, cy, radius, zoom = 1, camPitchDeg = 0, camYawDeg = 0, reliefScale = 1.0) {
      const phi = (latDeg * Math.PI) / 180;
      const lambda = (lonDeg * Math.PI) / 180;
      const phi0 = (rotLatDeg * Math.PI) / 180;
      const lam0 = (rotLonDeg * Math.PI) / 180;

      const elevM = this.getElevationMeters(latDeg, lonDeg);
      const radFactor = this.getRadialScaleFactor(zoom, camPitchDeg, reliefScale);
      const dr = elevM * radFactor;
      const rScale = 1.0 + dr;

      const cosPhi = Math.cos(phi);
      const x0 = cosPhi * Math.sin(lambda - lam0);
      const y0 = Math.sin(phi);
      const z0 = cosPhi * Math.cos(lambda - lam0);

      // 1. Odak enlemine (phi0) göre birim küre koordinatı: (east, north, up)
      const east = x0;
      const north = y0 * Math.cos(phi0) - z0 * Math.sin(phi0);
      const up = y0 * Math.sin(phi0) + z0 * Math.cos(phi0);

      // 2. Pusula bakış yönü (camYaw) dönüşü (merkez noktası sabit)
      const yawRad = ((camYawDeg || 0) * Math.PI) / 180;
      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const x1 = east * cosY - north * sinY;
      const y1 = east * sinY + north * cosY;
      const z1 = up;

      // 3. Sağ tık 3D kamera eğimi (camPitch): küre merkezini (cx, cy) asla kaydırmadan 3D açı ve perspektif verir
      const pitchRad = (Math.max(0, Math.min(72, camPitchDeg || 0)) * Math.PI) / 180;
      const sinP = Math.sin(pitchRad);
      const tiltRad = pitchRad * 0.45;
      const cosT = Math.cos(tiltRad);
      const sinT = Math.sin(tiltRad);
      const yForeshorten = 1.0 - 0.36 * sinP;

      const y2 = y1 * cosT - z1 * sinT;
      const z2 = y1 * sinT + z1 * cosT;

      const screenX = x1 * rScale;
      const screenY = (y2 * rScale + dr * sinP * 1.35 * Math.max(0, z2)) * yForeshorten;
      const depthZ = z2 * rScale;

      return {
        x: cx + screenX * radius,
        y: cy - screenY * radius,
        z: depthZ,
        elevM,
        visible: z2 > 0.04
      };
    }

    /**
     * Ekran pikselinden (px, py) merkezi sabit 3D topografik Mars yuzeyine ters isin atarak
     * gercek (lat, lon, elevM, slopeDeg) koordinatini bulur.
     */
    screenToElevatedMars3D(px, py, width, height, rotLatDeg, rotLonDeg, zoom = 1, camPitchDeg = 0, camYawDeg = 0, reliefScale = 1.0) {
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.41 * Math.min(Math.max(zoom, 0.55), 80.0);

      const pitchRad = (Math.max(0, Math.min(72, camPitchDeg || 0)) * Math.PI) / 180;
      const yawRad = ((camYawDeg || 0) * Math.PI) / 180;
      const sinP = Math.sin(pitchRad);
      const tiltRad = pitchRad * 0.45;
      const cosT = Math.cos(tiltRad);
      const sinT = Math.sin(tiltRad);
      const yForeshorten = 1.0 - 0.36 * sinP;

      const sx = (px - cx) / radius;
      const sy = ((cy - py) / radius) / yForeshorten;

      const cosY = Math.cos(yawRad);
      const sinY = Math.sin(yawRad);
      const phi0 = (rotLatDeg * Math.PI) / 180;
      const lam0 = (rotLonDeg * Math.PI) / 180;
      const sinP0 = Math.sin(phi0);
      const cosP0 = Math.cos(phi0);

      const radFactor = this.getRadialScaleFactor(zoom, camPitchDeg, reliefScale);
      const rMaxLimb = 1.0 + 21500 * radFactor;
      if (sx * sx + sy * sy > rMaxLimb * rMaxLimb) {
        return { lat: 0, lon: 0, elevM: 0, slopeDeg: 0, insideMap: false };
      }

      let dr = 0;
      let rScale = 1.0;
      let z2Est = Math.sqrt(Math.max(0, 1.0 - Math.min(1.0, sx * sx + sy * sy)));
      let hitLat = rotLatDeg;
      let hitLon = rotLonDeg;
      let hitInside = false;

      for (let iter = 0; iter < 3; iter++) {
        const rx = sx / rScale;
        const ry = (sy - dr * sinP * 1.35 * z2Est) / rScale;
        const rhoSq = rx * rx + ry * ry;
        if (rhoSq > 1.0) break;
        z2Est = Math.sqrt(1.0 - rhoSq);
        const y1 = ry * cosT + z2Est * sinT;
        const z1 = -ry * sinT + z2Est * cosT;
        const east = rx * cosY + y1 * sinY;
        const north = -rx * sinY + y1 * cosY;
        const y0 = north * cosP0 + z1 * sinP0;
        const z0 = -north * sinP0 + z1 * cosP0;
        const phi = Math.asin(Math.max(-1, Math.min(1, y0)));
        const lambda = lam0 + Math.atan2(east, z0);

        hitLat = Math.max(-85, Math.min(85, (phi * 180) / Math.PI));
        hitLon = (((lambda * 180) / Math.PI + 180) % 360 + 360) % 360 - 180;
        dr = this.getElevationMeters(hitLat, hitLon) * radFactor;
        rScale = 1.0 + dr;
        hitInside = true;
      }

      if (!hitInside) return { lat: 0, lon: 0, elevM: 0, slopeDeg: 0, insideMap: false };
      const telem = this.getSurfaceTelemetry(hitLat, hitLon);
      return {
        lat: Number(hitLat.toFixed(4)),
        lon: Number(hitLon.toFixed(4)),
        elevM: telem.elevM,
        slopeDeg: telem.slopeDeg,
        insideMap: true
      };
    }
  }

  ns.MarsTopographyService = MarsTopographyService;
  ns.marsTopo = new MarsTopographyService();
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc NASA MGS MOLA DEM topografya ve 3D kamera/yukseltme servisi tanimi.
   - Satir 11-31: constructor; Mars yaricapi (3389.5 km), rakim sinirlari (-8200m..+21229m) ve 1024x512 DEM tamponlarini kurar.
   - Satir 33-163: buildPhysicalMolaDemGrid; Olympus Mons (+21229m), Tharsis, Valles Marineris (-7000m), Hellas (-7152m), Gale/Mount Sharp (+5500m) ve Jezero verileriyle fiziksel DEM uretir.
   - Satir 165-261: syncWithMolaTiles, decodeMolaPixelMeters ve blendMolaTileIntoDem; ./data/tiles/mars-mola-elevation/ karolarini gercek zamanli DEM izgarasina kaynastirir.
   - Satir 263-295: recomputeSlopeNormals; her piksel icin Dogu ve Kuzey 3D yuzey egim normallerini hesaplar.
   - Satir 297-345: getElevationMetersUV, getElevationMeters ve getSurfaceTelemetry; bilineer enterpolasyonla gercek rakim (m) ve egim (derece) doner.
   - Satir 347-420: getRadialScaleFactor, buildCameraBasis ve projectToElevatedSphere; 3D kamera egimi (Pitch/Yaw) ve gercek MOLA rakimiyla 3D nokta projeksiyonu yapar.
   - Satir 422-490: screenToElevatedMars3D; 3D yukseltilmis arazi uzerinde iteratif isin-yuzey kesismesiyle koordinat ve rakim secer.
   ========================================================================== */
