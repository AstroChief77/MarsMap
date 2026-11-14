/**
 * @file app.js
 * @description AstroChief Mars Crater Navigator ana koordinasyon sınıfı.
 * Kurumsal Google Maps tarzı header, kenar çubuğu, yıldız tuvali ve alt bölümleri başlatır.
 */

import { Starfield } from "./components/Starfield.js";
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
    this.navbar = new Navbar("navbar-container");
    this.craterViewer = new CraterMapViewer("crater-viewer-container", this.starfield);
    this.details = new DetailsSection("details-container");
    this.resources = new ResourcesSection("resources-container");
    this.teams = new TeamSection("teams-container");
    this.footer = new Footer("footer-container");
  }

  /**
   * Uygulamayı sırasıyla ayağa kaldırır
   */
  start() {
    this.starfield.init();

    // Kurumsal Header ile Harita Denetleyicisini birbirine bağla (Sol Üst Factory Reset + Arama + Sidebar)
    this.navbar.init(
      {
        onFactoryReset: () => this.craterViewer.performFactoryReset(),
        onChangeSetting: (key, val) => this.craterViewer.updateSetting(key, val),
        onToggleSidebar: () => this.craterViewer.toggleSidebar(),
        onSearchQuery: (q) => this.craterViewer.setSearchQuery(q)
      },
      this.craterViewer
    );

    this.craterViewer.init();
    this.details.init();
    this.resources.init();
    this.teams.init();
    this.footer.init();

    this.initSmoothScroll();
  }

  /**
   * Sayfa içi çapa kaydırmasını yumuşatır
   */
  initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", function (e) {
        const targetId = this.getAttribute("href");
        if (targetId === "#") return;
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new AstroChiefApp();
  app.start();
});

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc ana uygulama koordinatörü tanıtımı.
   - Satır 7-13: Yıldız simülasyonu, kurumsal Header, harita denetleyicisi ve içerik bölümlerinin içe aktarılması.
   - Satır 15-26: constructor; tüm alt bileşen örneklerini oluşturur.
   - Satır 28-50: start; yıldız tuvalini, Header ayar/arama bağlarını, haritayı ve Challenge bölümlerini başlatır.
   - Satır 52-70: initSmoothScroll ve DOMContentLoaded başlatıcı bloğu.
   ========================================================================== */
