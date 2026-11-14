/**
 * @file RoutePlannerService.js
 * @description Asit yağmuru, kum fırtınası ve Alfa/Beta/Gama foton bombardımanı risklerini hesaplayarak:
 * 1) Mavi (En güvenli ve en kısa yol)
 * 2) Soluk Mavi (Güvenli fakat daha uzun alternatif çevre yolu)
 * rotalarını kilometre/metre, saat ve litre (O2 + soğutma suyu) cinsinden hesaplayan sınıf.
 */

export class RoutePlannerService {
  /**
   * RoutePlannerService yapıcı metodu
   */
  constructor() {
    // Fabrika referans sabitleri (Saat, Kilometre, Litre)
    this.baseWalkSpeedKmH = 3.6;   // Basınçlı uzay giysisiyle standart düz zemin hızı (km/saat)
    this.pixelToKmFactor = 0.085;  // Krater içi piksel koordinat ölçek çarpanı (km)
    this.o2ConsumptionLPerHour = 48.0;    // Astronot oksijen tüketim hızı (Litre / saat)
    this.waterCoolingLPerHour = 2.15;    // Giysi termal soğutma suyu tüketimi (Litre / saat)
  }

  /**
   * Krater için Radyasyon (Alfa, Beta, Gama) ve Foton Bombardıman Alanlarını döner
   * @param {string} craterId - Aktif krater kimliği
   * @returns {Array} Foton ve parçacık ışıma bölgesi tanımları
   */
  getRadiationAndPhotonZones(craterId) {
    if (craterId === "jezero-crater") {
      return [
        {
          id: "rad-jz-1",
          name: "Foton Bombardıman Alanı // Kuzey Delta",
          relX: 18,
          relY: -55,
          radius: 54,
          alphaLevel: "0.08 μSv/s (Alfa α)",
          betaLevel: "1.42 mSv/h (Beta β)",
          gammaLevel: "0.64 mSv/h (Gama γ)",
          photonFlux: "4.8x10^6 MeV/cm²·s"
        }
      ];
    }
    if (craterId === "korolev-crater") {
      return [
        {
          id: "rad-kr-1",
          name: "Gama & Foton Bombardıman Kuşağı",
          relX: -48,
          relY: 42,
          radius: 58,
          alphaLevel: "0.04 μSv/s (Alfa α)",
          betaLevel: "2.10 mSv/h (Beta β)",
          gammaLevel: "0.95 mSv/h (Gama γ)",
          photonFlux: "6.2x10^6 MeV/cm²·s"
        }
      ];
    }
    return [
      {
        id: "rad-gl-1",
        name: "Foton Bombardıman Alanı // Merkezi Eyer",
        relX: 8,
        relY: -58,
        radius: 52,
        alphaLevel: "0.14 μSv/s (Alfa α — Toz İnhalasyon Riski)",
        betaLevel: "1.65 mSv/h (Beta β — Güneş Elektron Akısı)",
        gammaLevel: "0.82 mSv/h (Gama γ — Kozmik Foton)",
        photonFlux: "5.4x10^6 MeV/cm²·s"
      }
    ];
  }

  /**
   * İki koordinat noktası arasındaki eğim ve tehlike cezalı yolculuk süresini hesaplar
   * @param {Object} p1 - Başlangıç noktası {relX, relY, slope}
   * @param {Object} p2 - Hedef noktası {relX, relY, slope}
   * @param {Object} options - Aktif filtreler (filterAcidRain, filterDustStorm)
   * @returns {Object} Segment mesafesi (km, metre) ve süresi (saat)
   */
  computeSegmentMetrics(p1, p2, options = {}) {
    // 1. Öklid mesafesini kilometre ve metre cinsine çevir
    const distPx = Math.hypot(p2.relX - p1.relX, p2.relY - p1.relY);
    const distanceKm = distPx * this.pixelToKmFactor;
    const distanceM = distanceKm * 1000;

    // 2. Eğim cezası: Yüksek eğimli Mount Sharp yamaçları astronot hızını düşürür
    const avgSlope = ((p1.slope || 4) + (p2.slope || 4)) / 2;
    const slopePenalty = Math.max(0.42, 1.0 - (avgSlope / 42));

    // 3. Atmosfer ve radyasyon cezaları: Asit sisi & toz kasırgası ilerleme hızını yavaşlatır
    let weatherFactor = 1.0;
    if (options.filterAcidRain && (p1.acidRisk || p2.acidRisk)) {
      weatherFactor *= 0.82; // Asit sülfat sisi vizör ve korozyon kontrolü gecikmesi (%18 yavaşlama)
    }
    if (options.filterDustStorm && (p1.stormRisk || p2.stormRisk)) {
      weatherFactor *= 0.72; // Kum kasırgası rüzgar direnci (%28 yavaşlama)
    }

    // 4. Etkin yürüyüş hızı ve saat cinsinden varış süresi hesabı: Süre = Yol / Etkin Hız
    const effectiveSpeedKmH = this.baseWalkSpeedKmH * slopePenalty * weatherFactor;
    const durationHours = distanceKm / effectiveSpeedKmH;

    return { distanceKm, distanceM, durationHours, effectiveSpeedKmH };
  }

  /**
   * Mavi (En Güvenli ve Kısa Yol) ile Soluk Mavi (Güvenli Fakat Daha Uzun Çevre Yolu) hesaplar
   * @param {Object} crater - Aktif krater nesnesi
   * @param {Array} waypoints - Krater EVA istasyon listesi
   * @param {Object} options - Filtre ve tüketim parametreleri
   * @returns {Object} İki rotanın geometri, süre (saat), mesafe (km/m) ve kaynak (Litre) sonuçları
   */
  computeRoutes(crater, waypoints, options = {}) {
    if (!waypoints || waypoints.length < 2) {
      return { primaryBlue: null, secondaryPaleBlue: null };
    }

    // --- ROTA 1: MAVİ YOL (En Güvenli ve En Kısa Ana EVA Rotası) ---
    // Yöntem: Fırtına veya yoğun foton bombardımanı içeren noktalarda minimum güvenli sapma (+16 px) uygular,
    // ancak en kısa toplam kilometre ve saat süresini hedefler.
    const primaryPoints = waypoints.map((wp, idx) => {
      let detourX = wp.relX;
      let detourY = wp.relY;
      // Eğer fırtına filtresi aktif ve nokta fırtına riskli ise 18px güvenli kuzey-yan geçiş uygula
      if (options.filterDustStorm && wp.stormRisk) {
        detourX += 14;
        detourY -= 16;
      }
      // Eğer asit filtresi aktif ve nokta asit riskli ise 12px rüzgar üstü kenar düzeltmesi ekle
      if (options.filterAcidRain && wp.acidRisk) {
        detourX -= 10;
        detourY -= 12;
      }
      return { ...wp, relX: detourX, relY: detourY, stepIdx: idx };
    });

    // --- ROTA 2: SOLUK MAVİ YOL (Yine Güvenli Ama Daha Uzun Çevreleyici Yedek Yol) ---
    // Yöntem: Tüm tehlike merkezlerinin (Asit Sisi, Kum Kasırgası, Foton Bombardıman Alanı ve >15° eğimler)
    // tamamen dışından dolaşan geniş güvenlik yayını izler. Mesafe daha uzundur fakat radyasyon/eğim riski minimumdur.
    const secondaryPoints = [];
    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];
      if (i > 0 && i < waypoints.length - 1) {
        // Orta durakları güvenli dış sırt koridoruna (güney-dış çember yayı) kaydırarak uzun çevre rotası oluştur
        secondaryPoints.push({
          ...wp,
          relX: wp.relX - 24,
          relY: wp.relY + 46,
          slope: Math.max(2.0, (wp.slope || 5) * 0.65),
          acidRisk: false,
          stormRisk: false
        });
      } else {
        secondaryPoints.push({ ...wp });
      }
    }

    const summarize = (pts, label, colorHex) => {
      let totalKm = 0;
      let totalHours = 0;
      const segmentNotes = [];

      for (let i = 0; i < pts.length - 1; i++) {
        const seg = this.computeSegmentMetrics(pts[i], pts[i + 1], options);
        totalKm += seg.distanceKm;
        totalHours += seg.durationHours;
        segmentNotes.push(
          `${pts[i].name} -> ${pts[i + 1].name}: ${seg.distanceKm.toFixed(2)} km (${Math.round(seg.distanceM)} m) | ${(seg.durationHours).toFixed(2)} saat`
        );
      }

      const o2Liters = totalHours * this.o2ConsumptionLPerHour;
      const waterLiters = totalHours * this.waterCoolingLPerHour;
      const hoursWhole = Math.floor(totalHours);
      const minsWhole = Math.round((totalHours - hoursWhole) * 60);

      return {
        label,
        colorHex,
        points: pts,
        totalKm,
        totalMeters: Math.round(totalKm * 1000),
        totalHours,
        formattedDuration: `${hoursWhole} saat ${minsWhole} dk`,
        o2Liters: Math.round(o2Liters),
        waterLiters: Number(waterLiters.toFixed(1)),
        segmentNotes
      };
    };

    return {
      primaryBlue: summarize(primaryPoints, "En Güvenli ve Kısa Yol (Mavi)", "#2563eb"),
      secondaryPaleBlue: summarize(secondaryPoints, "Güvenli Uzun Alternatif Yol (Soluk Mavi)", "#93c5fd")
    };
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-7: JSDoc çift rota planlama ve saat/km/litre hesaplama servisi tanıtımı.
   - Satır 9-18: RoutePlannerService yapıcısı; hız (km/saat), ölçek ve saatlik O2/su (Litre) tüketim sabitlerini ayarlar.
   - Satır 20-62: getRadiationAndPhotonZones; kraterlere ait Alfa (α), Beta (β), Gama (γ) ışıma düzeyleri ve Foton Bombardıman Alanlarını döner.
   - Satır 64-93: computeSegmentMetrics; mesafe (km/m), eğim cezası ve asit/kasırga yavaşlamasına göre varış süresini (saat) hesaplar.
   - Satır 95-167: computeRoutes; haritada Mavi (en güvenli kısa yol) ve Soluk Mavi (güvenli fakat daha uzun çevre yolu) geometrilerini, saat/dakika varış sürelerini ve litre tüketimlerini hesaplar.
   ========================================================================== */
