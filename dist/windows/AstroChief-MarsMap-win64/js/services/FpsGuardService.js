/**
 * @file FpsGuardService.js
 * @description Gercek zamanli FPS olcum ve koruma servisi.
 * Kural geregi: Herhangi bir ayar degistirildiginde FPS 10'un altina duserse,
 * degistirilen ayarin degismesi engellenir ve degistirilmeden onceki haline geri alinir.
 */

(function (ns) {
  "use strict";
  class FpsGuardService {
    /**
     * FpsGuardService yapici metodu
     * @param {number} minFpsThreshold - Minimum izin verilen FPS esigi (10)
     * @param {Function} onFpsUpdate - Canli FPS degeri guncellendiginde cagirilir
     */
    constructor(minFpsThreshold = 10, onFpsUpdate = null, guardWindowMs = 10000) {
      this.minFpsThreshold = minFpsThreshold;
      this.guardWindowMs = guardWindowMs;
      this.onFpsUpdate = onFpsUpdate;
      this.liveFps = 60;
      this.lastFrameTs = 0;
      this.sampleFrames = [];
      this.rafId = null;
      this.pendingGuard = null;
      this.simulatedFpsOverride = null;
    }

    /**
     * Arka planda hafif requestAnimationFrame FPS sayacini baslatir
     */
    start() {
      if (this.rafId) return;
      this.lastFrameTs = performance.now();

      const loop = (now) => {
        const dt = Math.max(1, now - this.lastFrameTs);
        this.lastFrameTs = now;
        const instantFps = this.simulatedFpsOverride !== null
          ? this.simulatedFpsOverride
          : Math.min(120, 1000 / dt);

        this.sampleFrames.push(instantFps);
        if (this.sampleFrames.length > 20) {
          this.sampleFrames.shift();
        }

        const avg = this.sampleFrames.reduce((acc, v) => acc + v, 0) / this.sampleFrames.length;
        this.liveFps = Math.round(avg);
        this.onFpsUpdate?.(this.liveFps);

        this.evaluatePendingGuard(instantFps, dt);
        this.rafId = requestAnimationFrame(loop);
      };

      this.rafId = requestAnimationFrame(loop);
    }

    /**
     * Tek karelik senkron cizim suresini (ms) dogrudan olcup anlik FPS dususunu yakalar
     * @param {number} renderDurationMs - Cizim fonksiyonunun harcadigi sure (ms)
     */
    recordRenderCost(renderDurationMs) {
      if (renderDurationMs <= 0) return;
      const renderFps = 1000 / renderDurationMs;
      if (this.pendingGuard && renderFps < this.minFpsThreshold) {
        this.pendingGuard.slowFrames += 1;
        this.pendingGuard.worstFps = Math.min(this.pendingGuard.worstFps, renderFps);
      }
    }

    /**
     * Bir ayar degistirilmeden once onceki durumu guvenceye alir ve degisiklik sonrasi FPS < 10 olursa geri alir
     * @param {Object} previousSnapshot - Degisiklik oncesi guvenli durum kopyasi
     * @param {string} settingLabel - Kullaniciya bildirilecek ayar adi
     * @param {Function} onRevert - FPS < 10 tespit edildiginde cagrilacak geri alma fonksiyonu
     */
    armSettingGuard(previousSnapshot, settingLabel, onRevert) {
      const now = performance.now();
      this.pendingGuard = {
        previousSnapshot: { ...previousSnapshot },
        settingLabel,
        onRevert,
        startedAt: now,
        belowThresholdSince: null,
        collected: [],
        slowFrames: 0,
        worstFps: 999
      };
    }

    /**
     * Bekleyen ayar degisikligi icin 10 saniyelik FPS penceresini degerlendirir
     */
    evaluatePendingGuard(instantFps, dt) {
      const g = this.pendingGuard;
      if (!g) return;

      const now = performance.now();
      g.collected.push(instantFps);

      const isSlowFrame = instantFps < this.minFpsThreshold || dt > 1000 / this.minFpsThreshold;
      if (isSlowFrame) {
        g.slowFrames += 1;
        g.worstFps = Math.min(g.worstFps, instantFps);
        if (g.belowThresholdSince === null) {
          g.belowThresholdSince = now;
        }
      } else {
        g.belowThresholdSince = null;
      }

      const elapsed = now - g.startedAt;
      const sustainedSlowMs = g.belowThresholdSince !== null ? (now - g.belowThresholdSince) : 0;
      const windowAvg = g.collected.reduce((a, b) => a + b, 0) / g.collected.length;

      // KURAL: Ayar degistirildikten sonra 10 saniye boyunca FPS < 10 kalirsa ayari geri al
      const sustained10s = sustainedSlowMs >= this.guardWindowMs;
      const failed10sWindow = elapsed >= this.guardWindowMs && windowAvg < this.minFpsThreshold;

      if (sustained10s || failed10sWindow) {
        const measured = Math.max(1, Math.round(Math.min(windowAvg, g.worstFps)));
        const revertFn = g.onRevert;
        const snap = g.previousSnapshot;
        const label = g.settingLabel;
        this.pendingGuard = null;
        revertFn?.(snap, measured, label);
        return;
      }

      // 10 saniye sonunda ortalama FPS >= 10 ise ayar guvenli kabul edilir
      if (elapsed >= this.guardWindowMs) {
        this.pendingGuard = null;
      }
    }

    /**
     * Test amacli veya olcum dogrulamasi icin FPS degerini dondurur
     */
    getLiveFps() {
      return this.liveFps;
    }

    /**
     * Otomatik testlerde dusuk FPS senaryosunu simule etmek icin yardimci
     */
    setSimulatedFpsForTest(fpsOrNull) {
      this.simulatedFpsOverride = fpsOrNull;
    }

    /**
     * Sayaci temiz sekilde durdurur
     */
    stop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }
  }

  ns.FpsGuardService = FpsGuardService;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc FPS < 10 (10 saniye) ayar degisikligi koruma servisi tanimi.
   - Satir 8-26: constructor; minimum 10 FPS esigini, 10000ms (10s) koruma penceresini ve canli olcum tamponunu kurar.
   - Satir 28-55: start; requestAnimationFrame dongusuyle anlik ve ortalama FPS degerini hesaplar.
   - Satir 57-68: recordRenderCost; tek cizim karesi 100ms'yi asarsa (<10 FPS) yavas kareyi kaydeder.
   - Satir 70-89: armSettingGuard; herhangi bir ayar degisikligi oncesi onceki guvenli durumu yedekler.
   - Satir 91-137: evaluatePendingGuard; 10 saniyelik olcum penceresinde kesintisiz veya ortalama FPS < 10 saptanirsa ayari geri alir.
   - Satir 139-162: getLiveFps, setSimulatedFpsForTest ve stop yardimci metodlari.
   ========================================================================== */
