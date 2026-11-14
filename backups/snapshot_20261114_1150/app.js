/**
 * @file app.js
 * @description AstroChief Mars Crater Navigator ana uygulama yöneticisi (Orchestrator).
 * Yıldız simülasyonu, krater harita motoru ve telemetri bileşenlerini koordine eder.
 */

import { Starfield } from "./components/Starfield.js";
import { HudTelemetry } from "./components/HudTelemetry.js";
import { Navbar } from "./components/Navbar.js";
import { CraterMapViewer } from "./components/CraterMapViewer.js";
import { DetailsSection } from "./components/DetailsSection.js";
import { ResourcesSection } from "./components/ResourcesSection.js";
import { TeamSection } from "./components/TeamSection.js";
import { Footer } from "./components/Footer.js";

export class AstroChiefApp {
  /**
   * AstroChiefApp yapıcı metodu
   */
  constructor() {
    this.starfield = new Starfield("starfield-canvas");
    this.hudTelemetry = new HudTelemetry("hud-telemetry-container");
    this.navbar = new Navbar("navbar-container");
    this.craterViewer = new CraterMapViewer("crater-viewer-container");
    this.details = new DetailsSection("details-container");
    this.resources = new ResourcesSection("resources-container");
    this.teams = new TeamSection("teams-container");
    this.footer = new Footer("footer-container");
  }

  /**
   * Uygulamayı ve tüm alt bileşenleri sırasıyla başlatır
   */
  start() {
    console.log("[AstroChief] Mars Crater Navigator başlatılıyor...");

    // 1. Zifiri siyah uzay ve yıldız motorunu başlat
    this.starfield.init();

    // 2. Telemetri ve Navigasyon
    this.hudTelemetry.init();
    this.navbar.init();

    // 3. Google Earth / NASA Trek Tarzı Etkileşimli Krater Haritası
    this.craterViewer.init();

    // 4. Detay, Kaynak, Ekip ve Alt Bilgi Bileşenleri
    this.details.init();
    this.resources.init();
    this.teams.init();
    this.footer.init();

    this.initSmoothScroll();
    console.log("[AstroChief] Sistem aktif: Mars Krater Keşif Haritası Çevrimiçi.");
  }

  /**
   * Pürüzsüz sayfa içi kaydırma
   */
  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", function (e) {
        const targetId = this.getAttribute("href");
        if (targetId === "#") return;
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        }
      });
    });
  }
}

// DOM hazır olduğunda uygulamayı çalıştır
document.addEventListener("DOMContentLoaded", () => {
  const app = new AstroChiefApp();
  app.start();
});

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc ana modül açıklaması ve koordinasyon tanımı.
   - Satır 7-14: Starfield, HudTelemetry, Navbar, CraterMapViewer, Details, Resources, Teams ve Footer bileşenlerinin içe aktarımı.
   - Satır 16: AstroChiefApp sınıfının dışa aktarılması.
   - Satır 17-29: constructor; ilgili DOM konteyner ID'leri ile tüm alt sınıfları başlatır.
   - Satır 31-52: start metodu; yıldız simülasyonunu, canlı telemetri çubuğunu, krater harita motorunu ve alt bölümleri sırayla ayağa kaldırır.
   - Satır 54-71: initSmoothScroll; tüm çapa linkleri için pürüzsüz kaydırma sağlar.
   - Satır 73-77: DOMContentLoaded dinleyicisi; sayfa yüklendiğinde uygulamayı otomatik başlatır.
   - Satır 78: Dosya sonu.
   ========================================================================== */
