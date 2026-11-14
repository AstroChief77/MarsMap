/**
 * @file StarfieldRenderer.js
 * @description Zifiri siyah uzay arka plani ve parildayan yildiz simulasyonu sinifi.
 */

export class StarfieldRenderer {
  /**
   * StarfieldRenderer yapici metodu
   * @param {string} canvasId - Yildiz tuvalinin DOM kimligi
   */
  constructor(canvasId = "starfield-canvas") {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.stars = [];
    this.enabled = true;
    this.rafId = null;
    this.onResize = this.resize.bind(this);
  }

  init() {
    if (!this.canvas || !this.ctx) return;
    this.resize();
    this.generateStars(280);
    this.startLoop();
    window.addEventListener("resize", this.onResize);
  }

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  setEnabled(flag) {
    this.enabled = !!flag;
    if (this.canvas) {
      this.canvas.style.opacity = this.enabled ? "1" : "0.08";
    }
  }

  generateStars(count) {
    this.stars = [];
    const palette = ["255,255,255", "235,242,255", "255,244,226", "255,214,196"];
    for (let i = 0; i < count; i++) {
      this.stars.push({
        x: Math.random() * this.canvas.width,
        y: Math.random() * this.canvas.height,
        r: Math.random() * 1.35 + 0.3,
        a: Math.random() * 0.75 + 0.2,
        da: (Math.random() * 0.015 + 0.004) * (Math.random() > 0.5 ? 1 : -1),
        rgb: palette[i % palette.length]
      });
    }
  }

  startLoop() {
    const tick = () => {
      if (!this.ctx || !this.canvas) return;
      this.ctx.fillStyle = "#000000";
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      if (this.enabled) {
        for (const s of this.stars) {
          s.a += s.da;
          if (s.a > 0.95 || s.a < 0.18) s.da *= -1;
          this.ctx.beginPath();
          this.ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          this.ctx.fillStyle = `rgba(${s.rgb}, ${s.a.toFixed(2)})`;
          this.ctx.fill();
        }
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

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-4: JSDoc siyah uzay ve yildiz cizim motoru tanimi.
   - Satir 6-26: constructor, init ve resize; tam ekran yildiz tuvalini hazirlar.
   - Satir 28-51: setEnabled ve generateStars; 280 adet farkli tayf renginde yildiz uretir.
   - Satir 53-77: startLoop ve destroy; parildama animasyonunu yonetir ve bellegi temizler.
   ========================================================================== */
