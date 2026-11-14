/**
 * @file FpsGuardService.js
 * @description Gercek zamanli FPS olcum ve koruma servisi.
 * Kural geregi: Herhangi bir ayar degistirildiginde FPS 10'un altina duserse,
 * degistirilen ayarin degismesi engellenir ve degistirilmeden onceki haline geri alinir.
 */

export class FpsGuardService {
  /**
   * FpsGuardService yapici metodu
   * @param {number} minFpsThreshold - Minimum izin verilen FPS esigi (10)
   * @param {Function} onFpsUpdate - Canli FPS degeri guncellendiginde cagirilir
   */
  constructor(minFpsThreshold = 10, onFpsUpdate = null) {
    this.minFpsThreshold = minFpsThreshold;
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
    this.pendingGuard = {
      previousSnapshot: { ...previousSnapshot },
      settingLabel,
      onRevert,
      startedAt: performance.now(),
      collected: [],
      slowFrames: 0,
      worstFps: 999
    };
  }

  /**
   * Bekleyen ayar degisikligi icin FPS penceresini degerlendirir
   */
  evaluatePendingGuard(instantFps, dt) {
    const g = this.pendingGuard;
    if (!g) return;

    g.collected.push(instantFps);
    if (instantFps < this.minFpsThreshold || dt > 1000 / this.minFpsThreshold) {
      g.slowFrames += 1;
      g.worstFps = Math.min(g.worstFps, instantFps);
    }

    const elapsed = performance.now() - g.startedAt;
    const windowAvg = g.collected.reduce((a, b) => a + b, 0) / g.collected.length;

    // 1. Anlik coklu agir kare (2+ kare > 100ms) veya pencere sonunda ortalama FPS < 10 ise GERI AL
    const failedEarly = g.slowFrames >= 2 && (this.simulatedFpsOverride !== null || elapsed > 220);
    const failedWindow = elapsed >= 650 && windowAvg < this.minFpsThreshold;

    if (failedEarly || failedWindow) {
      const measured = Math.max(1, Math.round(Math.min(windowAvg, g.worstFps)));
      const revertFn = g.onRevert;
      const snap = g.previousSnapshot;
      const label = g.settingLabel;
      this.pendingGuard = null;
      revertFn?.(snap, measured, label);
      return;
    }

    // 650ms sonunda FPS >= 10 ise ayar guvenli kabul edilir
    if (elapsed >= 650) {
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

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc FPS < 10 ayar degisikligi koruma servisi tanimi.
   - Satir 8-22: constructor; minimum 10 FPS esigini ve canli olcum tamponunu kurar.
   - Satir 24-50: start; requestAnimationFrame dongusuyle anlik ve ortalama FPS degerini hesaplar.
   - Satir 52-63: recordRenderCost; tek cizim karesi 100ms'yi asarsa (<10 FPS) yavas kareyi kaydeder.
   - Satir 65-79: armSettingGuard; herhangi bir ayar degisikligi oncesi onceki guvenli durumu yedekler.
   - Satir 81-112: evaluatePendingGuard; olcum penceresinde FPS < 10 saptanirsa ayari degistirilmeden onceki haline dondurur.
   - Satir 114-135: getLiveFps, setSimulatedFpsForTest ve stop yardimci metodlari.
   ========================================================================== */
