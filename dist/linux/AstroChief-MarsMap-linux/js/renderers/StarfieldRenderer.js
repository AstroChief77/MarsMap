/**
 * @file StarfieldRenderer.js
 * @description Sifir GPU bogulmasi (zero compositor overhead) icin on-tuval (offscreen) onbellekli
 * ve surukleme aninda otomatik duraklatilan derin uzay yildiz arka plan motoru.
 */

(function (ns) {
  "use strict";
  class StarfieldRenderer {
    /**
     * StarfieldRenderer yapici metodu
     * @param {string} canvasId - Yildiz tuvalinin DOM kimligi
     */
    constructor(canvasId = "starfield-canvas") {
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas ? this.canvas.getContext("2d", { alpha: false }) : null;
      this.baseCanvas = document.createElement("canvas");
      this.baseCtx = this.baseCanvas.getContext("2d", { alpha: false });
      this.stars = [];
      this.twinkleStars = [];
      this.enabled = true;
      this.interacting = false;
      this.rafId = null;
      this.lastDrawTs = 0;
      this.onResize = this.resize.bind(this);
    }

    init() {
      if (!this.canvas || !this.ctx) return;
      this.resize();
      this.startLoop();
      window.addEventListener("resize", this.onResize);
    }

    resize() {
      if (!this.canvas) return;
      const w = window.innerWidth || 1280;
      const h = window.innerHeight || 720;
      this.canvas.width = w;
      this.canvas.height = h;
      this.baseCanvas.width = w;
      this.baseCanvas.height = h;
      this.generateStars(240);
      this.bakeBaseLayer();
      this.drawFrame();
    }

    setEnabled(flag) {
      this.enabled = !!flag;
      if (this.canvas) {
        this.canvas.style.opacity = this.enabled ? "1" : "0.08";
      }
      this.drawFrame();
    }

    setInteracting(flag) {
      this.interacting = Boolean(flag);
    }

    generateStars(count) {
      this.stars = [];
      this.twinkleStars = [];
      const w = this.canvas.width || 1280;
      const h = this.canvas.height || 720;
      const palette = ["#ffffff", "#ebf2ff", "#fff4e2", "#ffd6c4"];
      for (let i = 0; i < count; i++) {
        const star = {
          x: (Math.random() * w) | 0,
          y: (Math.random() * h) | 0,
          s: Math.random() > 0.78 ? 2 : 1,
          a: Math.random() * 0.65 + 0.25,
          da: (Math.random() * 0.04 + 0.015) * (Math.random() > 0.5 ? 1 : -1),
          color: palette[i % palette.length]
        };
        if (i < 42) this.twinkleStars.push(star);
        else this.stars.push(star);
      }
    }

    bakeBaseLayer() {
      if (!this.baseCtx) return;
      const w = this.baseCanvas.width;
      const h = this.baseCanvas.height;
      this.baseCtx.fillStyle = "#000000";
      this.baseCtx.fillRect(0, 0, w, h);
      for (const s of this.stars) {
        this.baseCtx.globalAlpha = s.a;
        this.baseCtx.fillStyle = s.color;
        this.baseCtx.fillRect(s.x, s.y, s.s, s.s);
      }
      this.baseCtx.globalAlpha = 1.0;
    }

    drawFrame() {
      if (!this.ctx || !this.canvas) return;
      this.ctx.globalAlpha = 1.0;
      this.ctx.drawImage(this.baseCanvas, 0, 0);
      if (!this.enabled) return;

      for (const s of this.twinkleStars) {
        s.a += s.da;
        if (s.a > 0.95) { s.a = 0.95; s.da = -Math.abs(s.da); }
        else if (s.a < 0.20) { s.a = 0.20; s.da = Math.abs(s.da); }
        this.ctx.globalAlpha = s.a;
        this.ctx.fillStyle = s.color;
        this.ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      this.ctx.globalAlpha = 1.0;
    }

    startLoop() {
      const tick = (now) => {
        if (!this.interacting && this.enabled && now - this.lastDrawTs >= 120) {
          this.lastDrawTs = now;
          this.drawFrame();
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    destroy() {
      if (this.rafId) cancelAnimationFrame(this.rafId);
      window.removeEventListener("resize", this.onResize);
    }
  }

  ns.StarfieldRenderer = StarfieldRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc on-tuval (offscreen) onbellekli derin uzay yildiz arka plan motoru tanimi.
   - Satir 10-49: constructor, init, resize, setEnabled ve setInteracting; sabit yildizlari on-tuvale firinlar.
   - Satir 51-101: generateStars, bakeBaseLayer ve drawFrame; 240 yildizi tek blit + hafif fillRect ile cizer.
   - Satir 103-118: startLoop ve destroy; surukleme aninda GPU'yu yormamak icin arka plan cizimini duraklatir.
   ========================================================================== */
