/**
 * @file app.js
 * @description AstroChief Mars Navigator ana baslatici sinifi.
 * Yildiz tuvalini ve MarsNavigatorController ana uygulamasini ayaga kaldirir.
 */

import { StarfieldRenderer } from "./renderers/StarfieldRenderer.js";
import { MarsNavigatorController } from "./components/MarsNavigatorController.js";

export class AstroChiefApp {
  /**
   * AstroChiefApp yapici metodu
   */
  constructor() {
    this.starfield = new StarfieldRenderer("starfield-canvas");
    this.navigator = new MarsNavigatorController(this.starfield);
  }

  /**
   * Uygulamayi baslatir
   */
  async start() {
    this.starfield.init();
    await this.navigator.init();
    window.__astroChiefApp = this;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const app = new AstroChiefApp();
  app.start();
});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc AstroChief Mars Navigator giris noktasi tanimi.
   - Satir 7-8: StarfieldRenderer ve MarsNavigatorController siniflarinin ice aktarilmasi.
   - Satir 10-25: AstroChiefApp sinifi; yildiz arkaplanini ve varsayilan 2D harita koordinasyonunu baslatir.
   - Satir 27-30: DOMContentLoaded olayinda uygulamayi calistirir.
   ========================================================================== */
