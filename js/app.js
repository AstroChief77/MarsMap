/**
 * @file app.js
 * @description AstroChief ana uygulama giriş noktası ve bileşen yöneticisi (Orchestrator).
 */

import { Navbar } from "./components/Navbar.js";
import { RoverSection } from "./components/RoverSection.js";
import { DetailsSection } from "./components/DetailsSection.js";
import { ResourcesSection } from "./components/ResourcesSection.js";
import { TeamSection } from "./components/TeamSection.js";
import { Footer } from "./components/Footer.js";

export class AstroChiefApp {
  /**
   * AstroChiefApp yapıcı metodu
   */
  constructor() {
    this.navbar = new Navbar("navbar-container");
    this.rover = new RoverSection("rover-container");
    this.details = new DetailsSection("details-container");
    this.resources = new ResourcesSection("resources-container");
    this.teams = new TeamSection("teams-container");
    this.footer = new Footer("footer-container");
  }

  /**
   * Uygulamayı ve alt bileşenlerini sırasıyla başlatır
   */
  start() {
    console.log("[AstroChiefApp] Görev kontrol sistemi başlatılıyor...");

    this.navbar.init();
    this.rover.init();
    this.details.init();
    this.resources.init();
    this.teams.init();
    this.footer.init();

    this.initSmoothScroll();
    this.logSystemStatus();
  }

  /**
   * Sayfa içi çapa (anchor) bağlantıları için akıcı kaydırma (smooth scroll) etkinleştirir
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

  /**
   * Konsola sistem ve telemetri durumunu yazdırır
   */
  logSystemStatus() {
    console.log(
      "%c[AstroChief] Mars Exploration Portal Online.",
      "color: #ff5722; font-weight: bold; font-size: 14px;"
    );
  }
}

// DOM tamamen yüklendiğinde uygulamayı otomatik başlat
document.addEventListener("DOMContentLoaded", () => {
  const app = new AstroChiefApp();
  app.start();
});

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc app.js dosya açıklaması ve orkestrasyon tanımı.
   - Satır 6-10: Navbar, DetailsSection, ResourcesSection, TeamSection ve Footer bileşenlerinin içe aktarılması.
   - Satır 12: AstroChiefApp sınıfı bildirimi.
   - Satır 13-22: constructor metodu; alt bileşenleri ilgili DOM konteyner kimlikleri ile başlatır.
   - Satır 24-37: start metodu; konsol logu bırakır, bileşenlerin init metotlarını tetikler, smooth scroll ve sistem durumunu çalıştırır.
   - Satır 39-56: initSmoothScroll metodu; tüm içi çapa bağlantılarını pürüzsüz kaydırma ile bağlar.
   - Satır 58-65: logSystemStatus metodu; konsola renkli telemetri hazır mesajı gönderir.
   - Satır 66: AstroChiefApp sınıfının sonu.
   - Satır 68-72: DOMContentLoaded dinleyicisi; sayfa hazır olduğunda AstroChiefApp nesnesini oluşturup start() metodunu çağırır.
   ========================================================================== */
