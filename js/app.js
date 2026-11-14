/**
 * @file app.js
 * @description AstroChief Mars Kuresi ana baslatici sinifi (Navbar olmadan tam ekran).
 * Yildiz simülasyonu ve data/tiles karo tabanli MarsGlobeViewer bilesenini baslatir.
 */

import { Starfield } from "./components/Starfield.js";
import { MarsGlobeViewer } from "./components/MarsGlobeViewer.js";
import { MissionChat } from "./components/MissionChat.js";

export class AstroChiefApp {
  /**
   * AstroChiefApp yapici metodu
   */
  constructor() {
    this.starfield = new Starfield("starfield-canvas");
    this.globeViewer = new MarsGlobeViewer("mars-globe-container", this.starfield);
    this.missionChat = new MissionChat();
  }

  /**
   * Yildiz tuvalini ve yerel karo tabanli Mars kuresini baslatir
   */
  async start() {
    this.starfield.init();
    await this.globeViewer.init();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new AstroChiefApp();
  app.start();
});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc minimal Mars Kuresi giris koordinatörü tanıtımı.
   - Satir 7-9: Starfield, MarsGlobeViewer ve MissionChat modullerinin içe aktarılması.
   - Satir 11-23: AstroChiefApp; yildizli Mars kuresini ve Gorev Iletisim bilesenini ayağa kaldırır.
   - Satir 25-28: DOMContentLoaded olayinda uygulamayi calistirir.
   ========================================================================== */
