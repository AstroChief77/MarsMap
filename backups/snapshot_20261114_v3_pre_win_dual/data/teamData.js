/**
 * @file teamData.js
 * @description AstroChief NASA Space Apps 2026 ekip uyeleri ve gorev rolleri veri modulu.
 * Harici internet gorsel linki icermez; tamamen yerel rozet ve ikonlarla calisir.
 */

export const TEAM_MEMBERS_DATA = [
  {
    id: "atahan",
    name: "Atahan",
    initials: "AT",
    role: "Kaptan, Başkan, Lider, Diktatör",
    badge: "Kaptan / Lider",
    description: "Görev komutanı ve stratejik operasyonların baş koordinatörü. Yarışma hedeflerini ve rota vizyonunu yönetir."
  },
  {
    id: "buse",
    name: "Buse",
    initials: "BU",
    role: "Başkan Yardımcısı",
    badge: "Başkan Yrd.",
    description: "Komutan yardımcısı; ekip koordinasyonu, bilimsel sunum ve görev senkronizasyonunu sağlar."
  },
  {
    id: "akif",
    name: "Akif",
    initials: "AK",
    role: "Lead Developer",
    badge: "Lead Dev",
    description: "Sistem mimarı ve baş geliştirici. Modüler sınıf yapısı, render performansı ve temel çekirdeği yönetir."
  },
  {
    id: "rifat",
    name: "Rıfat",
    initials: "RI",
    role: "Coder",
    badge: "Coder",
    description: "Yazılım geliştirici; NASA/USGS veri seti entegrasyonu ve güvenli rota hesaplamaları üzerinde çalışır."
  },
  {
    id: "omer",
    name: "Ömer",
    initials: "OM",
    role: "Coder",
    badge: "Coder",
    description: "Yazılım geliştirici; 2D/3D harita katmanları, karo piramidi yükleme ve FPS koruma mekanizmasını geliştirir."
  },
  {
    id: "mustafa",
    name: "Mustafa",
    initials: "MU",
    role: "Coder",
    badge: "Coder",
    description: "Yazılım geliştirici; Uydular paneli arayüzü, atmosferik filtre görselleştirmeleri ve testleri yürütür."
  }
];

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc ekip veri modulu tanitimi ve cevrime kapali (yerel) rozet bilgisi.
   - Satir 7-49: TEAM_MEMBERS_DATA; readme.md icindeki 6 ekip uyesinin (Atahan, Buse, Akif, Rifat, Omer, Mustafa) ad, bas harf, rol ve aciklamalari.
   ========================================================================== */
