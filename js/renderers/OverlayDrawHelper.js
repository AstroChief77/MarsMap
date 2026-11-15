/**
 * @file OverlayDrawHelper.js
 * @description 2D ve 3D Mars haritalari uzerine yuzeye yapiskan organik Isi Haritasi (Heatmap)
 * olarak Asit Yagmuru (Mavi), Kum Firtinasi (Kizil-Turuncu) ve Radyasyon (Mor) kusaklari ile
 * krater pinlerini cizen yardimci sinif. Daire/GUI cizgisi yerine 3D küreyle bütünlesik doku üretir.
 */

(function (ns) {
  "use strict";

  const HEAT_W = 1024;
  const HEAT_H = 512;
  const MASK_W = 128;
  const MASK_H = 64;

  // 1024x512 piksel birim küre koordinatlari (kutup ve antimeridyende sıfır dikiş)
  let _sphereLookup = null;
  function getSphereLookup() {
    if (_sphereLookup) return _sphereLookup;
    const ux = new Float32Array(HEAT_W * HEAT_H);
    const uy = new Float32Array(HEAT_W * HEAT_H);
    const uz = new Float32Array(HEAT_W * HEAT_H);
    const halfPi = Math.PI * 0.5;
    for (let y = 0; y < HEAT_H; y++) {
      const lat = halfPi - ((y + 0.5) / HEAT_H) * Math.PI;
      const cosPhi = Math.cos(lat);
      const sinPhi = Math.sin(lat);
      const row = y * HEAT_W;
      for (let x = 0; x < HEAT_W; x++) {
        const lon = ((x + 0.5) / HEAT_W) * Math.PI * 2 - Math.PI;
        const idx = row + x;
        ux[idx] = cosPhi * Math.cos(lon);
        uy[idx] = sinPhi;
        uz[idx] = cosPhi * Math.sin(lon);
      }
    }
    _sphereLookup = { ux, uy, uz };
    return _sphereLookup;
  }

  function hashString(str) {
    let h = 2166136261;
    const s = String(str || "zone");
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
  }

  function latLonToUnit(latDeg, lonDeg) {
    const phi = (latDeg * Math.PI) / 180;
    const lam = (lonDeg * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    return { x: cosPhi * Math.cos(lam), y: Math.sin(phi), z: cosPhi * Math.sin(lam) };
  }

  function buildOrganicLobes(zone) {
    const h0 = hashString(zone.id);
    const h1 = hashString(zone.id + "_a");
    const h2 = hashString(zone.id + "_b");
    const deg2rad = Math.PI / 180;
    const baseRad = Math.max(4, zone.radiusDeg || 12) * deg2rad;
    const cPhi = (zone.lat * Math.PI) / 180;
    const cLam = (zone.lon * Math.PI) / 180;
    const cosP = Math.max(0.22, Math.cos(cPhi));
    const tilt = h0 * Math.PI * 2;
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    const makeLobe = (oxDeg, oyDeg, rScale, weight) => {
      const rx = oxDeg * cosT - oyDeg * sinT;
      const ry = oxDeg * sinT + oyDeg * cosT;
      const lLat = Math.max(-86, Math.min(86, zone.lat + ry));
      const lLon = zone.lon + rx / cosP;
      const u = latLonToUnit(lLat, lLon);
      const rRad = baseRad * rScale;
      return { x: u.x, y: u.y, z: u.z, invR2: 1 / Math.max(1e-5, rRad * rRad), weight };
    };

    const rDeg = Math.max(4, zone.radiusDeg || 12);
    return {
      seed: h0 * 17.3 + h1 * 9.1,
      axisAngle: tilt,
      maxRadRad: baseRad * 1.62,
      center: latLonToUnit(zone.lat, zone.lon),
      lobes: [
        makeLobe(0, 0, 0.92, 1.0),
        makeLobe(rDeg * (0.36 + 0.16 * h1), rDeg * (0.14 - 0.24 * h2), 0.66, 0.78),
        makeLobe(-rDeg * (0.34 + 0.14 * h2), rDeg * (0.22 + 0.14 * h0), 0.60, 0.72),
        makeLobe(rDeg * (0.06 - 0.22 * h0), -rDeg * (0.38 + 0.12 * h1), 0.54, 0.65)
      ]
    };
  }

  // Isi haritasi renk rampalari (Asit = Mavi, Firtina = Kizil/Turuncu/Altin, Radyasyon = Mor/Eflatun)
  function sampleHeatmapColor(kind, d, alphaScale) {
    if (d <= 0.03) return null;
    const clamped = d > 1 ? 1 : d;
    let r = 0, g = 0, b = 0, a = 0;

    if (kind === "acid") {
      if (clamped < 0.35) {
        const t = clamped / 0.35;
        r = 29 + 8 * t;
        g = 78 + 42 * t;
        b = 216 + 24 * t;
      } else if (clamped < 0.70) {
        const t = (clamped - 0.35) / 0.35;
        r = 37 - 20 * t;
        g = 120 + 68 * t;
        b = 240 + 10 * t;
      } else {
        const t = (clamped - 0.70) / 0.30;
        r = 17 + 135 * t;
        g = 188 + 44 * t;
        b = 250 + 5 * t;
      }
      a = Math.min(0.52, 0.40 * Math.pow(clamped, 0.68) * alphaScale);
    } else if (kind === "storm") {
      if (clamped < 0.35) {
        const t = clamped / 0.35;
        r = 185 + 45 * t;
        g = 38 + 30 * t;
        b = 14 + 12 * t;
      } else if (clamped < 0.70) {
        const t = (clamped - 0.35) / 0.35;
        r = 230 + 19 * t;
        g = 68 + 62 * t;
        b = 26 - 4 * t;
      } else {
        const t = (clamped - 0.70) / 0.30;
        r = 249 + 5 * t;
        g = 130 + 88 * t;
        b = 22 + 95 * t;
      }
      a = Math.min(0.52, 0.38 * Math.pow(clamped, 0.68) * alphaScale);
    } else {
      if (clamped < 0.35) {
        const t = clamped / 0.35;
        r = 91 + 48 * t;
        g = 33 + 52 * t;
        b = 182 + 64 * t;
      } else if (clamped < 0.70) {
        const t = (clamped - 0.35) / 0.35;
        r = 139 + 64 * t;
        g = 85 - 24 * t;
        b = 246 - 24 * t;
      } else {
        const t = (clamped - 0.70) / 0.30;
        r = 203 + 45 * t;
        g = 61 + 125 * t;
        b = 222 + 30 * t;
      }
      a = Math.min(0.48, 0.36 * Math.pow(clamped, 0.70) * alphaScale);
    }

    return { r, g, b, a };
  }

  class OverlayDrawHelper {
    constructor() {
      this._viewW = 4096;
      this._viewH = 4096;
      this._avoidRects = [];
      this._placedRects = [];
    }

    /**
     * Her cizim karesinin basinda cakismasiz etiket yerleşimi icin sahne ve HUD sinir kutularini sifirlar
     */
    beginLabelFrame(viewW = 4096, viewH = 4096, avoidRects = []) {
      this._viewW = Math.max(1, viewW || 4096);
      this._viewH = Math.max(1, viewH || 4096);
      this._avoidRects = Array.isArray(avoidRects)
        ? avoidRects.filter((r) => r && r.w > 0 && r.h > 0).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h }))
        : [];
      this._placedRects = [];
    }

    _rectsOverlap(a, b, pad = 5) {
      return !(
        a.x + a.w + pad <= b.x ||
        b.x + b.w + pad <= a.x ||
        a.y + a.h + pad <= b.y ||
        b.y + b.h + pad <= a.y
      );
    }

    _overlapArea(a, b, pad = 4) {
      const ix = Math.max(0, Math.min(a.x + a.w + pad, b.x + b.w + pad) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h + pad, b.y + b.h + pad) - Math.max(a.y, b.y));
      return ix * iy;
    }

    reserveRect(x, y, w, h) {
      if (!this._placedRects) this.beginLabelFrame();
      this._placedRects.push({ x, y, w, h });
    }

    isPointInAvoidRect(px, py, pad = 2) {
      return this._avoidRects.some(
        (r) => px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad
      );
    }

    /**
     * Etiket kutusunu HUD panelleri ve daha yuksek oncelikli etiketlerle cakismayacak en temiz konuma yerlestirir
     */
    claimLabelSlot(prefX, prefY, w, h, offsets = [[0, 0]], allowFallback = true) {
      if (!this._placedRects) this.beginLabelFrame();
      const vw = this._viewW || 4096;
      const vh = this._viewH || 4096;
      const margin = 8;
      const inView = (rx, ry) => (rx >= margin && ry >= margin && rx + w <= vw - margin && ry + h <= vh - margin);
      const isFree = (cand) => !this._avoidRects.some((r) => this._rectsOverlap(cand, r, 6)) && !this._placedRects.some((r) => this._rectsOverlap(cand, r, 5));

      for (const [ox, oy] of offsets) {
        const rx = prefX + ox;
        const ry = prefY + oy;
        const cand = { x: rx, y: ry, w, h };
        if (inView(rx, ry) && isFree(cand)) {
          this._placedRects.push(cand);
          return { x: rx, y: ry, w, h, placed: true, shifted: ox !== 0 || oy !== 0 };
        }
        // HUD kenarindan yatay iterek bosluk ara
        for (const ar of this._avoidRects) {
          if (!this._rectsOverlap(cand, ar, 6)) continue;
          for (const nx of [ar.x + ar.w + 8, ar.x - w - 8]) {
            const pushed = { x: nx, y: ry, w, h };
            if (inView(nx, ry) && isFree(pushed)) {
              this._placedRects.push(pushed);
              return { x: nx, y: ry, w, h, placed: true, shifted: true };
            }
          }
        }
      }

      if (!allowFallback) {
        return { x: prefX, y: prefY, w, h, placed: false, shifted: false };
      }

      const maxX = Math.max(margin, vw - w - margin);
      const maxY = Math.max(margin, vh - h - margin);
      let best = null;
      let bestScore = Infinity;

      for (const [ox, oy] of offsets) {
        const rx = Math.max(margin, Math.min(maxX, prefX + ox));
        const ry = Math.max(margin, Math.min(maxY, prefY + oy));
        const cand = { x: rx, y: ry, w, h };
        let score = 0;
        for (const ar of this._avoidRects) score += this._overlapArea(cand, ar, 6) * 50;
        for (const pr of this._placedRects) score += this._overlapArea(cand, pr, 5);
        score += Math.hypot(ox, oy) * 0.01;
        if (score < bestScore) {
          bestScore = score;
          best = cand;
        }
      }

      if (!best) {
        best = {
          x: Math.max(margin, Math.min(maxX, prefX)),
          y: Math.max(margin, Math.min(maxY, prefY)),
          w,
          h
        };
      }
      this._placedRects.push(best);
      return { x: best.x, y: best.y, w, h, placed: true, shifted: true };
    }

    drawRoundRectPath(ctx, x, y, w, h, r) {
      const rr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.lineTo(x + w - rr, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
      ctx.lineTo(x + w, y + h - rr);
      ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
      ctx.lineTo(x + rr, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
      ctx.lineTo(x, y + rr);
      ctx.quadraticCurveTo(x, y, x + rr, y);
      ctx.closePath();
    }

    /**
     * Orbital Titanium Slate standartlarinda buzlu yarim saydam, ince cerceveli ve sol renk seritli etiket hapi cizer
     */
    drawRoundedPill(ctx, x, y, w, h, radius = 3, accentHex = "#64748b", isStrong = false) {
      const r = Math.min(radius, 4);
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.52)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      this.drawRoundRectPath(ctx, x, y, w, h, r);
      ctx.fillStyle = isStrong ? "rgba(20, 28, 43, 0.96)" : "rgba(15, 21, 32, 0.93)";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;

      if (accentHex) {
        ctx.save();
        this.drawRoundRectPath(ctx, x, y, w, h, r);
        ctx.clip();
        ctx.fillStyle = accentHex;
        ctx.fillRect(x, y, 3, h);
        ctx.restore();
      }

      this.drawRoundRectPath(ctx, x, y, w, h, r);
      ctx.strokeStyle = isStrong ? accentHex : "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = isStrong ? 1.2 : 1;
      ctx.stroke();
      ctx.restore();
    }

    /**
     * 3D kure uzerine cografik nokta projeksiyonu uygular (3D kamera egimi Pitch/Yaw + MOLA yuksekligi destekli)
     */
    projectToSphere(latDeg, lonDeg, rotLatDeg, rotLonDeg, cx, cy, radius, camPitch = 0, camYaw = 0, elevM = 0, radFactor = 0, rCenter = 1.0) {
      const phi = (latDeg * Math.PI) / 180;
      const lambda = (lonDeg * Math.PI) / 180;
      const phi0 = (rotLatDeg * Math.PI) / 180;
      const lam0 = (rotLonDeg * Math.PI) / 180;

      const rPt = 1.0 + (elevM || 0) * (radFactor || 0);
      const cosPhi = Math.cos(phi);
      const east = rPt * cosPhi * Math.sin(lambda - lam0);
      const y0 = rPt * Math.sin(phi);
      const z0 = rPt * cosPhi * Math.cos(lambda - lam0);

      const cosP0 = Math.cos(phi0), sinP0 = Math.sin(phi0);
      const north = y0 * cosP0 - z0 * sinP0;
      const up = y0 * sinP0 + z0 * cosP0;

      const yawRad = ((camYaw || 0) * Math.PI) / 180;
      const cosY = Math.cos(yawRad), sinY = Math.sin(yawRad);
      const nx = east * cosY - north * sinY;
      const ry = east * sinY + north * cosY;

      const pitchRad = (Math.max(0, Math.min(72, camPitch || 0)) * Math.PI) / 180;
      const cosP = Math.cos(pitchRad), sinP = Math.sin(pitchRad);
      const du = up - rCenter;
      const ny = ry * cosP + du * sinP;
      const camDepth = (-ry * sinP + du * cosP) / Math.max(0.5, rPt);

      return { x: cx + nx * radius, y: cy - ny * radius, z: camDepth, visible: camDepth > -0.15 && up > -0.35 };
    }

    /**
     * Kuresel Asit Yagmuru (Mavi), Kum Firtinasi ve Radyasyon alanlarini 3D yuzeye yapiskan
     * organik isi haritasi (1024x512 RGBA + 128x64 hiz maskesi + 2D canvas) olarak uretir ve onbellekler
     */
    getGlobalHeatmapAtlas(hazardBundle) {
      if (!hazardBundle) return null;
      const { acidZones = [], stormZones = [], radiationZones = [], acidSpec, stormSpec } = hazardBundle;
      const aMult = acidSpec?.alphaMult || 1.0;
      const sMult = stormSpec?.alphaMult || 1.0;
      const acidScale = Math.max(0.76, Math.min(1.24, 0.72 + 0.28 * aMult));
      const stormScale = Math.max(0.76, Math.min(1.24, 0.72 + 0.28 * sMult));

      const keyParts = [
        `A:${acidZones.map((z) => `${z.id}:${z.radiusDeg.toFixed(1)}`).join(",")}:${acidScale.toFixed(2)}`,
        `S:${stormZones.map((z) => `${z.id}:${z.radiusDeg.toFixed(1)}`).join(",")}:${stormScale.toFixed(2)}`,
        `R:${radiationZones.map((z) => `${z.id}:${z.radiusDeg.toFixed(1)}`).join(",")}`
      ];
      const key = keyParts.join("|");

      if (ns._sharedHazardHeatmap && ns._sharedHazardHeatmap.key === key) {
        return ns._sharedHazardHeatmap;
      }

      if (acidZones.length === 0 && stormZones.length === 0 && radiationZones.length === 0) {
        const empty = { key, hasData: false, width: HEAT_W, height: HEAT_H, data: null, mask: null, canvas: null };
        ns._sharedHazardHeatmap = empty;
        return empty;
      }

      const canvas = ns._sharedHazardHeatmap?.canvas || document.createElement("canvas");
      if (canvas.width !== HEAT_W) canvas.width = HEAT_W;
      if (canvas.height !== HEAT_H) canvas.height = HEAT_H;
      const hCtx = canvas.getContext("2d");
      const imgData = hCtx.createImageData(HEAT_W, HEAT_H);
      const data = imgData.data;
      const mask = new Uint8Array(MASK_W * MASK_H);
      const { ux, uy, uz } = getSphereLookup();

      const groups = [
        { kind: "radiation", zones: radiationZones.map(buildOrganicLobes), alphaScale: 1.0 },
        { kind: "storm", zones: stormZones.map(buildOrganicLobes), alphaScale: stormScale },
        { kind: "acid", zones: acidZones.map(buildOrganicLobes), alphaScale: acidScale }
      ];

      // Her tehlike grubunun kuresel alandaki maksimum yogunlugunu ayri kanallarda hesapla
      const totalPix = HEAT_W * HEAT_H;
      const acidField = acidZones.length ? new Float32Array(totalPix) : null;
      const stormField = stormZones.length ? new Float32Array(totalPix) : null;
      const radField = radiationZones.length ? new Float32Array(totalPix) : null;
      const fieldByKind = { acid: acidField, storm: stormField, radiation: radField };

      for (const grp of groups) {
        const field = fieldByKind[grp.kind];
        if (!field || grp.zones.length === 0) continue;

        for (const zObj of grp.zones) {
          const { center, maxRadRad, lobes, seed } = zObj;
          const minCos = Math.cos(Math.min(Math.PI, maxRadRad));

          for (let y = 0; y < HEAT_H; y++) {
            const row = y * HEAT_W;
            for (let x = 0; x < HEAT_W; x++) {
              const idx = row + x;
              const px = ux[idx], py = uy[idx], pz = uz[idx];
              const cDot = px * center.x + py * center.y + pz * center.z;
              if (cDot < minCos) continue;

              // Kuresel yuzeye yapiskan coklu-cekim organik dalga turbulansi (dairesel olmayan bulut)
              const turb = 0.84 + 0.16 * Math.sin(px * 16.5 + py * 19.2 + pz * 12.8 + seed)
                                       * Math.cos(py * 22.1 - pz * 14.7 + px * 11.3);
              const tBoost = turb * turb;
              let sumG = 0;
              for (let k = 0; k < lobes.length; k++) {
                const lb = lobes[k];
                const dSq = Math.max(0, 2 * (1 - (px * lb.x + py * lb.y + pz * lb.z)));
                const arg = dSq * lb.invR2 * tBoost * 2.55;
                if (arg < 6.5) sumG += lb.weight * Math.exp(-arg);
              }
              if (sumG > 0.02) {
                const d = 1 - Math.exp(-1.55 * sumG);
                if (d > field[idx]) field[idx] = d;
              }
            }
          }
        }
      }

      for (let y = 0; y < HEAT_H; y++) {
        const row = y * HEAT_W;
        const mRow = (y >> 3) * MASK_W;
        for (let x = 0; x < HEAT_W; x++) {
          const idx = row + x;
          let rAcc = 0, gAcc = 0, bAcc = 0, aAcc = 0;

          const layers = [
            { kind: "radiation", val: radField ? radField[idx] : 0, sc: 1.0 },
            { kind: "storm", val: stormField ? stormField[idx] : 0, sc: stormScale },
            { kind: "acid", val: acidField ? acidField[idx] : 0, sc: acidScale }
          ];

          for (let li = 0; li < 3; li++) {
            const L = layers[li];
            if (L.val <= 0.03) continue;
            const c = sampleHeatmapColor(L.kind, (L.val - 0.03) / 0.97, L.sc);
            if (!c || c.a <= 0.005) continue;
            // Porter-Duff uzerine ekleme: ust katmanlar alttakiyle camur olmadan parlak harmanlanir
            const prevA = aAcc;
            const outA = c.a + prevA * (1 - c.a);
            if (outA > 0) {
              rAcc = (c.r * c.a + rAcc * prevA * (1 - c.a)) / outA;
              gAcc = (c.g * c.a + gAcc * prevA * (1 - c.a)) / outA;
              bAcc = (c.b * c.a + bAcc * prevA * (1 - c.a)) / outA;
              aAcc = outA;
            }
          }

          if (aAcc > 0.008) {
            const o = idx << 2;
            const aByte = Math.min(145, Math.round(aAcc * 255));
            data[o] = Math.min(255, rAcc | 0);
            data[o + 1] = Math.min(255, gAcc | 0);
            data[o + 2] = Math.min(255, bAcc | 0);
            data[o + 3] = aByte;
            const mIdx = mRow + (x >> 3);
            if (aByte > mask[mIdx]) mask[mIdx] = aByte;
          }
        }
      }

      hCtx.putImageData(imgData, 0, 0);
      const atlas = { key, hasData: true, width: HEAT_W, height: HEAT_H, data, mask, canvas };
      ns._sharedHazardHeatmap = atlas;
      return atlas;
    }

    /**
     * Krater ici radyasyon/tehlike alanini keskin daire olmadan coklu-cekimli organik isi bulutu olarak cizer
     */
    drawLocalHeatmapPlume(ctx, px, py, radPx, labelText, viewW = 4096, viewH = 4096) {
      if (radPx <= 1) return;
      if (px + radPx * 1.4 < -20 || px - radPx * 1.4 > viewW + 20 || py + radPx * 1.4 < -20 || py - radPx * 1.4 > viewH + 20) {
        return;
      }

      const lobes = [
        { ox: 0, oy: 0, sr: 1.15, a0: 0.34 },
        { ox: radPx * 0.36, oy: -radPx * 0.18, sr: 0.76, a0: 0.25 },
        { ox: -radPx * 0.32, oy: radPx * 0.24, sr: 0.72, a0: 0.24 },
        { ox: radPx * 0.14, oy: radPx * 0.34, sr: 0.64, a0: 0.20 }
      ];

      ctx.save();
      for (const lb of lobes) {
        const lx = px + lb.ox;
        const ly = py + lb.oy;
        const lr = Math.min(radPx * lb.sr, Math.max(viewW, viewH) * 2.0);
        const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, lr);
        g.addColorStop(0.0, `rgba(232, 121, 249, ${lb.a0})`);
        g.addColorStop(0.45, `rgba(168, 85, 247, ${(lb.a0 * 0.72).toFixed(2)})`);
        g.addColorStop(0.78, `rgba(109, 40, 217, ${(lb.a0 * 0.28).toFixed(2)})`);
        g.addColorStop(1.0, "rgba(109, 40, 217, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(lx - lr, ly - lr, lr * 2, lr * 2);
      }
      ctx.restore();

      if (labelText && px >= -140 && px <= viewW + 140 && py >= -30 && py <= viewH + 30) {
        this.drawDangerLabel(ctx, px, py, labelText, "#8e5aa8", radPx);
      }
    }

    _drawPillIcon(ctx, kind, cx, cy) {
      ctx.save();
      ctx.translate(cx, cy);
      if (kind === "acid") {
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.moveTo(0, -4.5);
        ctx.quadraticCurveTo(3.8, 0.2, 3.0, 2.2);
        ctx.arc(0, 1.5, 3.0, 0.25, Math.PI - 0.25);
        ctx.closePath();
        ctx.fill();
      } else if (kind === "storm") {
        ctx.strokeStyle = "#fb923c";
        ctx.lineWidth = 1.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-4, -2.5); ctx.lineTo(4, -2.5);
        ctx.moveTo(-2.8, 0.2); ctx.lineTo(2.8, 0.2);
        ctx.moveTo(-1.4, 2.9); ctx.lineTo(1.4, 2.9);
        ctx.stroke();
      } else if (kind === "rad") {
        ctx.fillStyle = "#e879f9";
        for (let i = 0; i < 3; i++) {
          const a = (i * Math.PI * 2) / 3 - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.arc(0, 0, 4.4, a - 0.45, a + 0.45); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = "#e8edf5";
        ctx.beginPath(); ctx.arc(0, 0, 1.3, 0, Math.PI * 2); ctx.fill();
      } else if (kind === "origin" || kind === "dest") {
        ctx.strokeStyle = "#e8edf5";
        ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(0, 0, 3.3, 0, Math.PI * 2); ctx.stroke();
        if (kind === "dest") {
          ctx.beginPath();
          ctx.moveTo(-5, 0); ctx.lineTo(-2, 0); ctx.moveTo(2, 0); ctx.lineTo(5, 0);
          ctx.moveTo(0, -5); ctx.lineTo(0, -2); ctx.moveTo(0, 2); ctx.lineTo(0, 5);
          ctx.stroke();
        } else {
          ctx.fillStyle = "#e8edf5";
          ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.restore();
    }

    drawCompactHazardLabel(ctx, px, py, labelText, accentHex = "#64748b", allowFallback = false, iconKind = null) {
      ctx.save();
      ctx.font = "700 10px 'Public Sans Web', sans-serif";
      const iconPad = iconKind ? 12 : 0;
      const boxW = Math.ceil(ctx.measureText(labelText).width + 18 + iconPad);
      const boxH = 19;
      const offsets = [
        [0, 0], [0, -23], [0, 23],
        [-(boxW * 0.55 + 8), -16], [boxW * 0.55 + 8, -16],
        [-(boxW * 0.55 + 8), 16], [boxW * 0.55 + 8, 16]
      ];
      const slot = this.claimLabelSlot(px - boxW / 2, py - 9.5, boxW, boxH, offsets, allowFallback);
      if (!slot.placed) { ctx.restore(); return; }

      this.drawRoundedPill(ctx, slot.x, slot.y, boxW, boxH, 6, accentHex, false);
      if (iconKind) this._drawPillIcon(ctx, iconKind, slot.x + 12, slot.y + boxH / 2);
      ctx.fillStyle = "#e8edf5";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(labelText, slot.x + 9 + iconPad, slot.y + boxH / 2 + 0.5);
      ctx.restore();
    }

    /**
     * Asit Yagmuru, Kum Firtinasi ve Radyasyon kusak etiketlerini yuksek oncelikli pinlerle cakismadan cizer
     */
    drawGlobalHazardLabels(ctx, mode, projFn, hazardBundle, zoom, viewW = 4096, viewH = 4096) {
      if (!hazardBundle) return;
      const { acidZones = [], stormZones = [], radiationZones = [] } = hazardBundle;
      const drawLabels = (zones, iconKind, accentHex, minZoom) => {
        if (zoom < minZoom) return;
        for (const z of zones) {
          const p = projFn(z.lat, z.lon);
          if (!p) continue;
          if (mode === "3d" && (!p.visible || p.z < 0.25)) continue;
          if (p.x < -80 || p.x > viewW + 80 || p.y < -30 || p.y > viewH + 30) continue;
          const dLat = Math.max(4, z.radiusDeg || 12);
          const edge = projFn(z.lat + (z.lat > 70 ? -dLat : dLat), z.lon);
          const cloudRadPx = edge ? Math.hypot(edge.x - p.x, edge.y - p.y) : 80;
          this.drawDangerLabel(ctx, p.x, p.y, z.name, accentHex, cloudRadPx);
        }
      };

      drawLabels(acidZones, "acid", "#3f8aa8", 0.85);
      drawLabels(stormZones, "storm", "#b8512f", 0.85);
      drawLabels(radiationZones, "rad", "#8e5aa8", 0.90);
    }

    /**
     * 2D veya 3D projeksiyonda tum aktif Asit Yagmuru (Mavi), Firtina ve Foton isi haritalarini (ve istenirse etiketlerini) cizer.
     */
    drawGlobalHazards(ctx, mode, projFn, hazardBundle, zoom, viewW = 4096, viewH = 4096, map2DBounds = null, drawLabelsNow = true) {
      if (!hazardBundle) return;

      // 2D haritada yuzey kilitli isi haritasi atlasini tum gorunur sarmalara ciz (sıfır daire)
      if (mode === "2d" && map2DBounds) {
        const atlas = this.getGlobalHeatmapAtlas(hazardBundle);
        if (atlas && atlas.hasData && atlas.canvas) {
          const { ox, oy, mapW, mapH } = map2DBounds;
          ctx.save();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          for (const wrapX of [-mapW, 0, mapW]) {
            const bx = ox + wrapX;
            if (bx + mapW < 0 || bx > viewW) continue;
            ctx.drawImage(atlas.canvas, bx, oy, mapW, mapH);
          }
          ctx.restore();
        }
      }

      if (drawLabelsNow) {
        this.drawGlobalHazardLabels(ctx, mode, projFn, hazardBundle, zoom, viewW, viewH);
      }
    }

    /**
     * Kuresel harita uzerinde krater ve NASA inis sahasi isaretcilerini cizer, tiklama hedeflerini dondurur
     */
    drawMarkers(ctx, projFn, craters, landingSites, activeCraterId) {
      const hitTargets = [];

      if (Array.isArray(landingSites)) {
        for (const site of landingSites) {
          const p = projFn(site.latitude, site.longitude);
          if (!p || !p.visible) continue;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(226, 232, 240, 0.90)";
          ctx.fill();
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
      }

      for (const crater of craters) {
        const p = projFn(crater.coordinates.lat, crater.coordinates.lon);
        if (!p || !p.visible) continue;
        const isActive = crater.id === activeCraterId;

        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 8 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? "#dc362e" : "#e2e8f0";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#0f172a";
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(p.x, p.y, isActive ? 14 : 10, 0, Math.PI * 2);
        ctx.strokeStyle = isActive ? "rgba(220, 54, 46, 0.90)" : "rgba(226, 232, 240, 0.56)";
        ctx.lineWidth = 1.4;
        ctx.stroke();

        this.reserveRect(p.x - 10, p.y - 10, 20, 20);
        hitTargets.push({ crater, x: p.x, y: p.y, r: 22 });

        if (p.x < -20 || p.x > (this._viewW || 4096) + 20 || p.y < -20 || p.y > (this._viewH || 4096) + 20 || this.isPointInAvoidRect(p.x, p.y, 4)) {
          continue;
        }

        ctx.save();
        ctx.font = "800 11px 'Public Sans Web', sans-serif";
        const label = crater.name;
        const boxW = Math.ceil(ctx.measureText(label).width + 18);
        const boxH = 22;
        const prefX = p.x + 12;
        const prefY = p.y - 11;
        const offsets = [
          [0, 0], [0, 23], [0, -23],
          [-(boxW + 24), 0], [-(boxW + 24), 23], [-(boxW + 24), -23],
          [-(boxW * 0.5 + 12), -30], [-(boxW * 0.5 + 12), 20]
        ];
        const slot = this.claimLabelSlot(prefX, prefY, boxW, boxH, offsets, false);
        if (slot.placed) {
          this.drawRoundedPill(ctx, slot.x, slot.y, boxW, boxH, 7, isActive ? "#dc362e" : "#64748b", isActive);
          ctx.fillStyle = "#e8edf5";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText(label, slot.x + 9, slot.y + boxH / 2 + 0.5);
        }
        ctx.restore();
      }

      return hitTargets;
    }

    /**
     * Kullanici tarafindan secilen Mevcut Konum (A) ve Varis Noktasi (B) isaretcilerini cizer
     */
    drawCustomEndpoints(ctx, projFn, origin, destination) {
      const drawEndpoint = (pt, tag, bgHex, borderHex) => {
        if (!pt || pt.lat === undefined || pt.lon === undefined) return;
        const p = projFn(pt.lat, pt.lon);
        if (!p || !p.visible) return;

        ctx.save();
        ctx.beginPath();
        ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = borderHex;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = bgHex;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#e8edf5";
        ctx.stroke();

        ctx.font = "900 10px 'Public Sans Web', sans-serif";
        ctx.fillStyle = "#f8fafc";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tag, p.x, p.y + 0.5);

        this.reserveRect(p.x - 12, p.y - 12, 24, 24);

        if (p.x >= -24 && p.x <= (this._viewW || 4096) + 24 && p.y >= -24 && p.y <= (this._viewH || 4096) + 24) {
          const originLbl = ns.i18n ? ns.i18n.t("originWord") : "Konumumuz";
          const destLbl = ns.i18n ? ns.i18n.t("destWord") : "Hedef";
          const caption = `${tag} · ${tag === "A" ? originLbl : destLbl} (${pt.lat.toFixed(1)}°, ${pt.lon.toFixed(1)}°)`;
          ctx.font = "800 10px 'Public Sans Web', sans-serif";
          const boxW = Math.ceil(ctx.measureText(caption).width + 28);
          const boxH = 20;
          const offsets = [
            [0, 0], [0, -22], [-(boxW + 30), 0], [0, 20],
            [-(boxW + 30), -22], [-(boxW + 30), 20],
            [-(boxW * 0.5 + 15), -38], [-(boxW * 0.5 + 15), 24]
          ];
          const slot = this.claimLabelSlot(p.x + 15, p.y - 24, boxW, boxH, offsets, true);
          if (slot.placed) {
            this.drawRoundedPill(ctx, slot.x, slot.y, boxW, boxH, 6, bgHex, true);
            this._drawPillIcon(ctx, tag === "A" ? "origin" : "dest", slot.x + 12, slot.y + boxH / 2);
            ctx.fillStyle = "#e8edf5";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(caption, slot.x + 21, slot.y + boxH / 2 + 0.5);
          }
        }
        ctx.restore();
      };

      drawEndpoint(origin, "A", "#2563eb", "rgba(37, 99, 235, 0.85)");
      drawEndpoint(destination, "B", "#d92b2b", "rgba(217, 43, 43, 0.9)");
    }
  }

  ns.OverlayDrawHelper = OverlayDrawHelper;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-14: JSDoc ve 1024x512 kuresel organik isi haritasi (heatmap) boyut sabitleri.
   - Satir 17-159: getSphereLookup, buildOrganicLobes ve sampleHeatmapColor; kuresel birim vektor
     uzerinde dairesel olmayan cok-loblu Asit (Mavi), Firtina (Kizil-Altin) ve Radyasyon (Mor) isi haritasi rampalarini hesaplar.
   - Satir 161-278: beginLabelFrame, isPointInAvoidRect, claimLabelSlot (HUD kenar itme dahil) ve drawRoundedPill; harita etiketlerini cakismasiz konumlandirir.
   - Satir 280-487: projectToSphere ve getGlobalHeatmapAtlas; 3D kamera projeksiyonu ile 1024x512 tehlike isi haritasi dokusunu onbellekler.
   - Satir 489-610: drawLocalHeatmapPlume, _drawPillIcon (vektor simge cizimi), drawCompactHazardLabel, drawGlobalHazardLabels ve drawGlobalHazards.
   - Satir 612-768: drawMarkers ve drawCustomEndpoints; NASA inis sahalari, kraterler ve A/B noktalarini vektor simgeli hap etiketleriyle cizer.
   ========================================================================== */
