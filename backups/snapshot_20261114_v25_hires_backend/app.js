/**
 * @file app.js
 * @description AstroChief Mars Kuresi ana baslatici sinifi (Navbar olmadan tam ekran).
 * Yildiz simülasyonu ve data/tiles karo tabanli MarsGlobeViewer bilesenini baslatir.
 */

import { Starfield } from "./components/Starfield.js";
import { MarsGlobeViewer } from "./components/MarsGlobeViewer.js";

export class AstroChiefApp {
  /**
   * AstroChiefApp yapici metodu
   */
  constructor() {
    this.starfield = new Starfield("starfield-canvas");
    this.globeViewer = new MarsGlobeViewer("mars-globe-container", this.starfield);
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
   - Satir 7-8: Starfield ve MarsGlobeViewer modullerinin içe aktarılması.
   - Satir 10-25: AstroChiefApp; navbar ve pathfind panelleri olmadan yildizli Mars kuresini ayağa kaldırır.
   - Satir 27-30: DOMContentLoaded olayinda uygulamayi calistirir.
   ========================================================================== */
