/**
 * @file Starfield.js
 * @description Zifiri siyah uzay arkaplanı ve gerçekçi parıldayan yıldız simülasyonu sınıfı.
 */

export class Starfield {
  /**
   * Starfield yapıcı metodu
   * @param {string} canvasId - Yıldızların çizileceği Canvas element ID'si
   */
  constructor(canvasId = "starfield-canvas") {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.stars = [];
    this.numStars = 320;
    this.animationFrameId = null;
    this.handleResize = this.resize.bind(this);
  }

  /**
   * Starfield bileşenini başlatır
   */
  init() {
    if (!this.canvas || !this.ctx) return;
    this.resize();
    this.createStars();
    this.animate();
    window.addEventListener("resize", this.handleResize);
  }

  /**
   * Ekran boyutuna göre canvas ölçülerini günceller
   */
  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  /**
   * Rastgele konumlarda ve parlaklıklarda yıldız nesneleri üretir
   */
  createStars() {
    this.stars = [];
    const width = this.canvas.width;
    const height = this.canvas.height;

    for (let i = 0; i < this.numStars; i++) {
      this.stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.4 + 0.3,
        alpha: Math.random() * 0.8 + 0.2,
        twinkleSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        color: this.getRandomStarColor()
      });
    }
  }

  /**
   * Yıldız tayf sınıfına göre ince renk tonu döner (beyaz, hafif mavi, hafif sarı/kızıl)
   * @returns {string} RGB renk dizesi
   */
  getRandomStarColor() {
    const colors = [
      "255, 255, 255", // Standart beyaz
      "240, 245, 255", // Mavi-beyaz (O/B sınıfı)
      "255, 245, 230", // Sarı-beyaz (F/G sınıfı)
      "255, 220, 200"  // Hafif kırmızımsı (M sınıfı devler)
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Yıldızları zifiri siyah zemin üzerine çizer ve hafif parıldama animasyonu uygular
   */
  animate() {
    if (!this.ctx || !this.canvas) return;

    this.ctx.fillStyle = "#000000";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (const star of this.stars) {
      star.alpha += star.twinkleSpeed;
      if (star.alpha > 0.95) {
        star.alpha = 0.95;
        star.twinkleSpeed = -Math.abs(star.twinkleSpeed);
      } else if (star.alpha < 0.2) {
        star.alpha = 0.2;
        star.twinkleSpeed = Math.abs(star.twinkleSpeed);
      }

      this.ctx.beginPath();
      this.ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(${star.color}, ${star.alpha})`;
      this.ctx.shadowBlur = star.radius > 1.2 ? 6 : 0;
      this.ctx.shadowColor = `rgba(${star.color}, 0.8)`;
      this.ctx.fill();
    }

    this.animationFrameId = requestAnimationFrame(() => this.animate());
  }

  /**
   * Animasyon döngüsünü durdurur
   */
  destroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    window.removeEventListener("resize", this.handleResize);
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc sınıf tanıtımı ve modül bilgisi.
   - Satır 6: Starfield sınıfının export bildirimi.
   - Satır 7-16: constructor metodu; canvas, 2D context, 320 adet yıldız dizisi ve resize dinleyicisi başlatılır.
   - Satır 18-28: init metodu; canvas boyutlandırma, yıldız üretimi ve animasyon döngüsünü başlatır.
   - Satır 30-36: resize metodu; canvas genişlik ve yüksekliğini pencere ölçülerine eşitler.
   - Satır 38-54: createStars metodu; konum, yarıçap, alfa ve parıldama hızına sahip yıldız nesneleri oluşturur.
   - Satır 56-68: getRandomStarColor metodu; gerçekçi tayf sınıflarına göre yıldız renkleri atar.
   - Satır 70-98: animate metodu; zifiri siyah zemin çizer, yıldızların parıldamasını (twinkle) hesaplar ve requestAnimationFrame ile yeniler.
   - Satır 100-108: destroy metodu; animasyon karesini iptal eder ve bellek sızıntısını önler.
   - Satır 109: Starfield sınıfı bitişi.
   ========================================================================== */
