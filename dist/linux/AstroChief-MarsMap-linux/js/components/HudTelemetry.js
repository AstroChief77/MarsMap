/**
 * @file HudTelemetry.js
 * @description Astronot kaskı (HUD) ve Görev Kontrol canlı telemetri çubuğu bileşeni.
 */

export class HudTelemetry {
  /**
   * HudTelemetry yapıcı metodu
   * @param {string} containerId - Telemetri bileşeninin bağlanacağı element ID'si
   */
  constructor(containerId = "hud-telemetry-container") {
    this.container = document.getElementById(containerId);
    this.timerId = null;
    this.elapsedSeconds = 15480; // 04:18:00
  }

  /**
   * Bileşeni başlatır ve zamanlayıcıyı kurar
   */
  init() {
    if (!this.container) return;
    this.render();
    this.startClock();
  }

  /**
   * HUD telemetri HTML şablonunu oluşturur
   */
  render() {
    this.container.innerHTML = `
      <div class="hud-top-telemetry-bar">
        <div class="hud-brand-indicator">
          <span class="blinking-status-dot"></span>
          <span class="hud-brand-title">ASTRONAUT EVA HUD // MARS CRATER MAPPER</span>
          <span class="hud-event-tag">NASA SPACE APPS 2026</span>
        </div>

        <div class="hud-metrics-row">
          <div class="hud-metric-pill">
            <span class="pill-label">EVA GÖREV SAATİ:</span>
            <span class="pill-value text-green" id="hud-eva-clock">SOL 2031 // 04:18:00</span>
          </div>
          <div class="hud-metric-pill">
            <span class="pill-label">YAŞAM DESTEK (O2):</span>
            <span class="pill-value text-cyan">94% (6.2 SAAT)</span>
          </div>
          <div class="hud-metric-pill">
            <span class="pill-label">RADYASYON DOZU:</span>
            <span class="pill-value text-amber">18.4 μSv/h (GÜVENLİ)</span>
          </div>
          <div class="hud-metric-pill">
            <span class="pill-label">HABİTAT BAĞLANTISI:</span>
            <span class="pill-value text-green">100% ONLINE (ORBITER RELAY)</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Her saniye görev saatini ilerleten zamanlayıcıyı çalıştırır
   */
  startClock() {
    this.timerId = setInterval(() => {
      this.elapsedSeconds++;
      const hrs = String(Math.floor(this.elapsedSeconds / 3600)).padStart(2, "0");
      const mins = String(Math.floor((this.elapsedSeconds % 3600) / 60)).padStart(2, "0");
      const secs = String(this.elapsedSeconds % 60).padStart(2, "0");
      const clockEl = document.getElementById("hud-eva-clock");
      if (clockEl) {
        clockEl.innerText = `SOL 2031 // ${hrs}:${mins}:${secs}`;
      }
    }, 1000);
  }

  /**
   * Bileşeni temizler
   */
  destroy() {
    if (this.timerId) clearInterval(this.timerId);
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc sınıf açıklaması.
   - Satır 6: HudTelemetry sınıfı bildirimi.
   - Satır 7-15: constructor; kapsayıcı ID'si ve saniye sayacı başlatma.
   - Satır 17-23: init metodu; render ve saat başlatma.
   - Satır 25-50: render metodu; astronot baş üstü göstergesi (HUD) telemetri hapları (EVA saati, O2 rezervi, radyasyon dozu, orbiter veri bağı).
   - Satır 52-64: startClock; her saniye çalışan interval ile sayacı güncelleme.
   - Satır 66-70: destroy; zamanlayıcıyı sonlandırma.
   - Satır 71: HudTelemetry sınıfı sonu.
   ========================================================================== */
