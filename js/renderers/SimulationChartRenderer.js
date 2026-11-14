/**
 * @file SimulationChartRenderer.js
 * @description /demo simulasyon studyosu icin canli O2 (%), Batarya (%), MOLA Rakim Profili
 * ve %20 Walkback guvenlik esigini cizen HiDPI tuval grafik sinifi.
 */

(function (ns) {
  "use strict";

  class SimulationChartRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext("2d") : null;
    }

    setCanvas(canvas) {
      this.canvas = canvas;
      this.ctx = canvas ? canvas.getContext("2d") : null;
    }

    render(samples, progress, summary) {
      if (!this.canvas || !this.ctx) return;
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(220, Math.round(rect.width || 300));
      const h = Math.max(110, Math.round(rect.height || 130));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
      }

      const ctx = this.ctx;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const padL = 28;
      const padR = 10;
      const padT = 14;
      const padB = 18;
      const gw = Math.max(40, w - padL - padR);
      const gh = Math.max(30, h - padT - padB);

      ctx.fillStyle = "#0b0f18";
      ctx.fillRect(padL, padT, gw, gh);
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      ctx.strokeRect(padL, padT, gw, gh);

      // Yatay %20 (Walkback), %50, %100 izgarasi ve y-ekseni etiketleri
      ctx.font = "700 9px 'Public Sans Web', sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      [0, 20, 50, 100].forEach((pct) => {
        const y = padT + gh - (pct / 100) * gh;
        ctx.strokeStyle = pct === 20 ? "rgba(224, 62, 45, 0.58)" : "#1e293b";
        ctx.setLineDash(pct === 20 ? [4, 3] : []);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + gw, y);
        ctx.stroke();
        ctx.fillStyle = pct === 20 ? "#f87171" : "#94a3b8";
        ctx.fillText(`${pct}%`, padL - 4, y);
      });
      ctx.setLineDash([]);

      if (!Array.isArray(samples) || samples.length < 2) {
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "800 10.5px 'Public Sans Web', sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Ön görev parametreleri (O₂, Enerji, Su) girin...", padL + gw / 2, padT + gh / 2);
        return;
      }

      const minE = summary?.minElevM ?? -5000;
      const maxE = Math.max(minE + 200, summary?.maxElevM ?? 5000);
      const eSpan = maxE - minE;

      // 1. MOLA Rakim dolgu alani (saydam kirmizi)
      ctx.beginPath();
      ctx.moveTo(padL, padT + gh);
      samples.forEach((s, idx) => {
        const x = padL + (idx / (samples.length - 1)) * gw;
        const normE = Math.max(0, Math.min(1, (s.elevM - minE) / eSpan));
        const y = padT + gh - normE * gh * 0.85;
        ctx.lineTo(x, y);
      });
      ctx.lineTo(padL + gw, padT + gh);
      ctx.closePath();
      ctx.fillStyle = "rgba(224, 62, 45, 0.16)";
      ctx.fill();

      // 2. Batarya (%) yesil egrisi
      this.strokeSeries(ctx, samples, (s) => s.energyPct, padL, padT, gw, gh, "#22c55e", 2.0);
      // 3. Oksijen (%) mavi egrisi
      this.strokeSeries(ctx, samples, (s) => s.o2Pct, padL, padT, gw, gh, "#3b82f6", 2.4);

      // 4. Canli zaman imleci (parlak beyaz dikey cizgi + noktalar)
      const p = Math.max(0, Math.min(1, progress || 0));
      const cx = padL + p * gw;
      ctx.strokeStyle = "#f1f5f9";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, padT);
      ctx.lineTo(cx, padT + gh);
      ctx.stroke();

      const idx = Math.min(samples.length - 1, Math.round(p * (samples.length - 1)));
      const cur = samples[idx];
      if (cur) {
        this.drawDot(ctx, cx, padT + gh - (cur.energyPct / 100) * gh, "#22c55e");
        this.drawDot(ctx, cx, padT + gh - (cur.o2Pct / 100) * gh, "#3b82f6");
      }

      // Alt eksen kilometre etiketi
      ctx.fillStyle = "#94a3b8";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("0 km", padL, padT + gh + 4);
      ctx.textAlign = "right";
      ctx.fillText(`${(summary?.totalKm || 0).toFixed(0)} km`, padL + gw, padT + gh + 4);
    }

    strokeSeries(ctx, samples, valFn, padL, padT, gw, gh, color, width) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.beginPath();
      samples.forEach((s, idx) => {
        const x = padL + (idx / (samples.length - 1)) * gw;
        const v = Math.max(0, Math.min(100, valFn(s)));
        const y = padT + gh - (v / 100) * gh;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    }

    drawDot(ctx, x, y, color) {
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#0b0f18";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }

  ns.SimulationChartRenderer = SimulationChartRenderer;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc /demo simulasyon coklu egri tuval grafigi sinifi.
   - Satir 10-19: constructor ve setCanvas; 2D grafik baglamini hazirlar.
   - Satir 21-121: render; koyu uzay temali HiDPI tuvalde %20 Walkback esigi, MOLA rakim alani, Batarya (%22c55e) ve O2 (%3b82f6) egrileri ile canli imleci cizer.
   - Satir 123-148: strokeSeries ve drawDot; zaman serisi egrilerini ve aktif nokta isaretcilerini cizer.
   ========================================================================== */
