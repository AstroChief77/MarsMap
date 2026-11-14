/**
 * @file StarfieldRenderer.js
 * @description Sifir GPU bogulmasi (zero compositor overhead) icin on-tuval (offscreen) onbellekli
 * Acik Gri Studio radyal arka plan, ince yorunge halkalari ve mikroyildiz arka plan motoru.
 */

(function (ns) {
  "use strict";
  class StarfieldRenderer {
    /**
     * StarfieldRenderer yapici metodu
     * @param {string} canvasId - Arka plan tuvalinin DOM kimligi
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
      this.generateStars(190);
      this.bakeBaseLayer();
      this.drawFrame();
    }

    drawBackdropGradient(ctx, w, h) {
      const cx = w * 0.5;
      const cy = h * 0.48;
      const maxR = Math.max(w, h) * 0.72;
      const grad = ctx.createRadialGradient(cx, cy, maxR * 0.06, cx, cy, maxR);
      grad.addColorStop(0.0, "#edf0f5");
      grad.addColorStop(0.58, "#dfe4ec");
      grad.addColorStop(1.0, "#cfd7e3");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    setEnabled(flag) {
      this.enabled = !!flag;
      if (this.canvas) {
        this.canvas.style.opacity = this.enabled ? "1" : "0";
      }
      if (!this.enabled) {
        if (this.rafId) {
          cancelAnimationFrame(this.rafId);
          this.rafId = null;
        }
        if (this.ctx && this.canvas) {
          this.drawBackdropGradient(this.ctx, this.canvas.width, this.canvas.height);
        }
        return;
      }
      this.drawFrame();
      this.startLoop();
    }

    setInteracting(flag) {
      const next = Boolean(flag);
      if (this.interacting === next) return;
      this.interacting = next;
      if (next && this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      } else if (!next && this.enabled) {
        this.startLoop();
      }
    }

    generateStars(count) {
      this.stars = [];
      this.twinkleStars = [];
      const w = this.canvas.width || 1280;
      const h = this.canvas.height || 720;
      const palette = ["#ffffff", "#ffffff", "#94a3b8", "#64748b", "#cbd5e1"];
      for (let i = 0; i < count; i++) {
        const star = {
          x: (Math.random() * w) | 0,
          y: (Math.random() * h) | 0,
          s: Math.random() > 0.80 ? 2 : 1,
          a: Math.random() * 0.45 + 0.22,
          da: (Math.random() * 0.03 + 0.01) * (Math.random() > 0.5 ? 1 : -1),
          color: palette[i % palette.length]
        };
        if (i < 34) this.twinkleStars.push(star);
        else this.stars.push(star);
      }
    }

    bakeBaseLayer() {
      if (!this.baseCtx) return;
      const ctx = this.baseCtx;
      const w = this.baseCanvas.width;
      const h = this.baseCanvas.height;
      this.drawBackdropGradient(ctx, w, h);

      // Ince telemetri yorunge halkalari ve eksen cizgileri
      const cx = w * 0.5;
      const cy = h * 0.5;
      const baseR = Math.min(w, h) * 0.44;
      ctx.save();
      ctx.strokeStyle = "rgba(100, 116, 139, 0.11)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      [1.04, 1.24, 1.48].forEach((mult) => {
        ctx.beginPath();
        ctx.arc(cx, cy, baseR * mult, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.strokeStyle = "rgba(100, 116, 139, 0.08)";
      for (let deg = 0; deg < 360; deg += 45) {
        const rad = (deg * Math.PI) / 180;
        const r0 = baseR * 1.03;
        const r1 = baseR * 1.08;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * r0, cy + Math.sin(rad) * r0);
        ctx.lineTo(cx + Math.cos(rad) * r1, cy + Math.sin(rad) * r1);
        ctx.stroke();
      }
      ctx.restore();

      for (const s of this.stars) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      ctx.globalAlpha = 1.0;
    }

    drawFrame() {
      if (!this.enabled || !this.ctx || !this.canvas) return;
      this.ctx.globalAlpha = 1.0;
      this.ctx.drawImage(this.baseCanvas, 0, 0);

      for (const s of this.twinkleStars) {
        s.a += s.da;
        if (s.a > 0.72) { s.a = 0.72; s.da = -Math.abs(s.da); }
        else if (s.a < 0.18) { s.a = 0.18; s.da = Math.abs(s.da); }
        this.ctx.globalAlpha = s.a;
        this.ctx.fillStyle = s.color;
        this.ctx.fillRect(s.x, s.y, s.s, s.s);
      }
      this.ctx.globalAlpha = 1.0;
    }

    startLoop() {
      if (this.rafId || !this.enabled || this.interacting) return;
      const tick = (now) => {
        if (!this.enabled || this.interacting) {
          this.rafId = null;
          return;
        }
        if (now - this.lastDrawTs >= 120) {
          this.lastDrawTs = now;
          this.drawFrame();
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    }

    destroy() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      window.removeEventListener("resize", this.onResize);
    }
  }

  ns.StarfieldRenderer = StarfieldRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc Acik Gri Studio arka plan, ince yorunge halkalari ve mikroyildiz motoru tanimi.
   - Satir 10-69: constructor, init, resize, drawBackdropGradient ve setEnabled; acik gri radyal gecis zeminini uretir.
   - Satir 71-147: generateStars, bakeBaseLayer ve drawFrame; yorunge halkalari ve 190 noktali acik gri yildiz izgarasini cizer.
   - Satir 149-189: startLoop ve destroy; surukleme sirasinda CPU/GPU kullanimini duraklatir.
   ========================================================================== */

