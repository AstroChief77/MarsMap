/**
 * @file RouteGeometryHelper.js
 * @description Kuresel Haversine mesafe olcumu ve tehlike merkezlerinden kacinan guvenli yol egri geometrileri.
 * Karmaşıklığı azaltmak için saf matematiksel rota fonksiyonları ayrı modülde tutulmuştur.
 */

export class RouteGeometryHelper {
  /**
   * Mars ortalama yaricapi uzerinden iki (lat, lon) noktasi arasindaki gercek mesafeyi (km) hesaplar
   * @param {number} lat1 - Baslangic enlemi
   * @param {number} lon1 - Baslangic boylami
   * @param {number} lat2 - Hedef enlemi
   * @param {number} lon2 - Hedef boylami
   * @returns {number} Kilometre cinsinden yuzey mesafesi
   */
  haversineMarsKm(lat1, lon1, lat2, lon2) {
    const marsRadiusKm = 3389.5;
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    let dLonDeg = lon2 - lon1;
    if (dLonDeg > 180) dLonDeg -= 360;
    if (dLonDeg < -180) dLonDeg += 360;
    const dLon = dLonDeg * toRad;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return marsRadiusKm * c;
  }

  /**
   * Boylam farkini [-180, 180] araligina normalize eder
   */
  shortestDeltaLon(lonA, lonB) {
    let d = lonB - lonA;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }

  /**
   * Boylami [-180, 180] araliginda tutar
   */
  wrapLon(lon) {
    return ((lon + 180) % 360 + 360) % 360 - 180;
  }

  /**
   * Iki cografik nokta arasinda aktif tehlike merkezlerinden (Asit Yagmuru, Firtina, Foton)
   * itici vektorlerle kacinan coklu ara noktali guvenli rota geometrisi uretir
   * @param {Object} start - {lat, lon, name}
   * @param {Object} end - {lat, lon, name}
   * @param {Array} hazards - {lat, lon, radiusDeg, weight}
   * @param {number} safetyMarginMult - 1.0 (Mavi kisa yol) veya 1.85 (Soluk Mavi uzun guvenli yay)
   * @param {number} biasSign - Uzun yedek yol icin acisal yay yonu (+1 / -1)
   * @returns {Array} [{lat, lon}] nokta dizisi
   */
  buildSafeGlobalPath(start, end, hazards, safetyMarginMult = 1.0, biasSign = 1) {
    const steps = 16;
    const dLon = this.shortestDeltaLon(start.lon, end.lon);
    const dLat = end.lat - start.lat;
    const pathLenDeg = Math.hypot(dLat, dLon) || 1;
    const perpLat = (-dLon / pathLenDeg) * biasSign;
    const perpLon = (dLat / pathLenDeg) * biasSign;

    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      let lat = start.lat + dLat * t;
      let lon = start.lon + dLon * t;

      // Yol uzerindeki tehlikelere yakinsa guvenli cevre yayi uygula (uclar haric)
      if (i > 0 && i < steps) {
        const envelope = Math.sin(t * Math.PI);

        // Soluk Mavi (uzun guvenli yol) icin dogal genis koridor yayi
        if (safetyMarginMult > 1.2) {
          const arcDeg = Math.min(26, pathLenDeg * 0.24) * (safetyMarginMult - 0.75) * envelope;
          lat += perpLat * arcDeg;
          lon += perpLon * arcDeg;
        }

        // Her bir aktif Asit / Firtina / Foton bolgesinden itme kuvveti uygula
        for (const hz of hazards) {
          const hLonDiff = this.shortestDeltaLon(hz.lon, lon);
          const hLatDiff = lat - hz.lat;
          const dist = Math.hypot(hLatDiff, hLonDiff);
          const avoidRadius = hz.radiusDeg * (1.12 * safetyMarginMult);

          if (dist < avoidRadius) {
            const pushStrength = (avoidRadius - dist) * (hz.weight || 1.05);
            if (dist < 0.5) {
              lat += perpLat * pushStrength;
              lon += perpLon * pushStrength;
            } else {
              lat += (hLatDiff / dist) * pushStrength;
              lon += (hLonDiff / dist) * pushStrength;
            }
          }
        }
      }

      pts.push({
        lat: Math.max(-84, Math.min(84, lat)),
        lon: this.wrapLon(lon)
      });
    }
    return pts;
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc kuresel rota geometrisi ve tehlike kacinma matematik yardimcisi.
   - Satir 7-29: haversineMarsKm; 3389.5 km Mars yaricapiyla iki koordinat arasi gercek mesafeyi (km) hesaplar.
   - Satir 31-45: shortestDeltaLon ve wrapLon; antimeridyen (±180 boylam) gecislerini normalize eder.
   - Satir 47-105: buildSafeGlobalPath; Asit/Firtina/Foton dairelerinden itici vektorlerle kacinan Mavi (kisa) ve Soluk Mavi (uzun guvenli) rota noktalarini uretir.
   ========================================================================== */
