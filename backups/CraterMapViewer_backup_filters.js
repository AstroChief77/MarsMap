/**
 * @file CraterMapViewer.js
 * @description Google Earth ve NASA Trek esintili etkileşimli Mars Krater Keşif Haritası bileşeni.
 * Çok katmanlı (Optik, Topografik DEM, Termal IR, Jeoloji, Tehlikeler ve EVA Rotası) görselleştirme motoru.
 */

import { CRATERS_DATA } from "../../data/craterLocations.js";

export class CraterMapViewer {
  /**
   * CraterMapViewer yapıcı metodu
   * @param {string} containerId - Harita motorunun bağlanacağı HTML kapsayıcı ID'si
   */
  constructor(containerId = "crater-viewer-container") {
    this.container = document.getElementById(containerId);
    this.activeCraterIndex = 0;
    this.activeCrater = CRATERS_DATA[this.activeCraterIndex];

    // Aktif harita katmanları (varsayılan açık olanlar)
    this.layers = {
      optical: true,
      topography: true,
      thermal: false,
      geology: true,
      hazards: true,
      evaRoute: true
    };

    // Zoom ve Pan durumları
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;

    // Seçili waypoint ve fare koordinatları
    this.selectedWaypoint = null;
    this.cursorTelemetry = {
      lat: this.activeCrater.coordinates.lat,
      lon: this.activeCrater.coordinates.lon,
      elevation: this.activeCrater.elevation_datum_m,
      slope: 3.2,
      navigability: 0.85
    };
  }

  /**
   * Harita motorunu başlatır
   */
  init() {
    if (!this.container) return;
    this.render();
    this.bindCanvas();
    this.bindControls();
    this.drawMap();
  }

  /**
   * Krater Harita Arayüzünün DOM iskeletini oluşturur
   */
  render() {
    const craterOptions = CRATERS_DATA.map((c, idx) => `
      <button class="crater-tab-btn ${idx === this.activeCraterIndex ? 'active' : ''}" data-crater-idx="${idx}">
        <span class="tab-pulse"></span>
        <span class="tab-name">${c.name}</span>
        ${c.recommended ? '<span class="tab-badge">NASA Target</span>' : ''}
      </button>
    `).join("");

    this.container.innerHTML = `
      <div class="crater-map-wrapper">
        <!-- Üst Kontrol & Krater Seçim Çubuğu -->
        <div class="map-top-bar">
          <div class="crater-selector-group">
            <span class="selector-label">HEDEF KRATER:</span>
            <div class="crater-tabs">${craterOptions}</div>
          </div>
          <div class="map-view-actions">
            <button class="btn-map-control" id="btn-zoom-in" title="Yaklaş (+)">＋</button>
            <button class="btn-map-control" id="btn-zoom-out" title="Uzaklaş (-)">－</button>
            <button class="btn-map-control" id="btn-reset-view" title="Görünümü Sıfırla">⟲ Reset</button>
          </div>
        </div>

        <!-- Ana Harita Çalışma Alanı -->
        <div class="map-viewport-container">
          <!-- Sol Katman Yönetim Paneli -->
          <aside class="map-layers-panel">
            <div class="panel-header">
              <span class="panel-icon">🛰️</span>
              <span class="panel-title">HARİTA KATMANLARI</span>
            </div>
            <div class="layer-toggles">
              <label class="layer-item">
                <input type="checkbox" id="layer-optical" ${this.layers.optical ? 'checked' : ''} />
                <span class="layer-indicator optical-ind"></span>
                <span class="layer-text">Optik Yüzey (HiRISE/CTX)</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-topography" ${this.layers.topography ? 'checked' : ''} />
                <span class="layer-indicator topo-ind"></span>
                <span class="layer-text">MOLA Topografi (DEM Konturları)</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-geology" ${this.layers.geology ? 'checked' : ''} />
                <span class="layer-indicator geo-ind"></span>
                <span class="layer-text">USGS Jeolojik Birimler & Boxwork</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-hazards" ${this.layers.hazards ? 'checked' : ''} />
                <span class="layer-indicator haz-ind"></span>
                <span class="layer-text">Fırtına & Asidik Tehlike Koridorları</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-thermal" ${this.layers.thermal ? 'checked' : ''} />
                <span class="layer-indicator therm-ind"></span>
                <span class="layer-text">THEMIS Termal Kızılötesi (Kaya Yoğunluğu)</span>
              </label>
              <label class="layer-item">
                <input type="checkbox" id="layer-eva" ${this.layers.evaRoute ? 'checked' : ''} />
                <span class="layer-indicator eva-ind"></span>
                <span class="layer-text">İnsanlı Mars Yürüyüşü (EVA Rotası)</span>
              </label>
            </div>

            <!-- Aktif Krater Hızlı Bilgi Kartı -->
            <div class="crater-quick-info">
              <h4 class="quick-title">${this.activeCrater.name}</h4>
              <p class="quick-desc">${this.activeCrater.description}</p>
              <div class="quick-specs">
                <div><span>Çap:</span> <strong>${this.activeCrater.diameter_km} km</strong></div>
                <div><span>Derinlik:</span> <strong>${this.activeCrater.depth_m} m</strong></div>
                <div><span>Datum İrtifa:</span> <strong>${this.activeCrater.elevation_datum_m} m</strong></div>
              </div>
            </div>
          </aside>

          <!-- Merkez Etkileşimli Canvas Haritası -->
          <div class="map-canvas-container" id="map-canvas-wrapper">
            <canvas id="mars-crater-canvas"></canvas>
            
            <!-- Canlı İmleç Telemetri HUD Göstergesi -->
            <div class="hud-cursor-telemetry" id="cursor-telemetry">
              <span class="hud-item"><span class="hud-key">LAT:</span> <strong id="hud-lat">${this.cursorTelemetry.lat.toFixed(4)}°</strong></span>
              <span class="hud-item"><span class="hud-key">LON:</span> <strong id="hud-lon">${this.cursorTelemetry.lon.toFixed(4)}°</strong></span>
              <span class="hud-item"><span class="hud-key">ELEV:</span> <strong id="hud-elev">${this.cursorTelemetry.elevation} m</strong></span>
              <span class="hud-item"><span class="hud-key">SLOPE:</span> <strong id="hud-slope">${this.cursorTelemetry.slope}°</strong></span>
              <span class="hud-item hud-status"><span class="hud-key">TRAVERSE:</span> <strong id="hud-nav">OPTIMAL</strong></span>
            </div>

            <!-- Harita Ölçek Çubuğu -->
            <div class="map-scale-bar">
              <span class="scale-line"></span>
              <span class="scale-text">10 KM</span>
            </div>
          </div>

          <!-- Sağ Taraf: Nokta İnceleme & Bilim Paneli (Inspector Panel) -->
          <aside class="map-inspector-panel" id="map-inspector">
            <div class="panel-header">
              <span class="panel-icon">🔬</span>
              <span class="panel-title">BİLİMSEL İNCELEME & EVA HUD</span>
            </div>
            <div class="inspector-content" id="inspector-content">
              <div class="inspector-default-msg">
                <span class="inspect-icon">🎯</span>
                <p>Harita üzerindeki herhangi bir <strong>EVA İstasyonuna</strong> veya krater bölgesine tıklayarak jeolojik analiz, tırmanış açısı ve numune hedeflerini görüntüleyin.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    `;
  }

  /**
   * Canvas elementini bağlar ve boyutlandırır
   */
  bindCanvas() {
    this.canvas = document.getElementById("mars-crater-canvas");
    this.ctx = this.canvas ? this.canvas.getContext("2d") : null;
    this.wrapper = document.getElementById("map-canvas-wrapper");

    if (this.canvas && this.wrapper) {
      this.resizeCanvas();
      window.addEventListener("resize", () => {
        this.resizeCanvas();
        this.drawMap();
      });
    }
  }

  /**
   * Kapsayıcısına göre canvas çözünürlüğünü ayarlar
   */
  resizeCanvas() {
    if (!this.canvas || !this.wrapper) return;
    const rect = this.wrapper.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = Math.max(rect.height, 580);
  }

  /**
   * Harita üzerindeki etkileşim dinleyicilerini bağlar (pan, zoom, tıklama, katman geçişleri)
   */
  bindControls() {
    // Krater Değiştirme Butonları
    const tabs = this.container.querySelectorAll(".crater-tab-btn");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const idx = parseInt(tab.getAttribute("data-crater-idx"), 10);
        this.switchCrater(idx);
      });
    });

    // Katman Seçim Kutuları
    const layerIds = ["optical", "topography", "geology", "hazards", "thermal", "eva"];
    layerIds.forEach((key) => {
      const el = document.getElementById(`layer-${key}`);
      if (el) {
        el.addEventListener("change", (e) => {
          const mapKey = key === "eva" ? "evaRoute" : key;
          this.layers[mapKey] = e.target.checked;
          this.drawMap();
        });
      }
    });

    // Zoom Butonları
    document.getElementById("btn-zoom-in")?.addEventListener("click", () => {
      this.zoom = Math.min(this.zoom * 1.25, 3.5);
      this.drawMap();
    });

    document.getElementById("btn-zoom-out")?.addEventListener("click", () => {
      this.zoom = Math.max(this.zoom / 1.25, 0.6);
      this.drawMap();
    });

    document.getElementById("btn-reset-view")?.addEventListener("click", () => {
      this.zoom = 1.0;
      this.panX = 0;
      this.panY = 0;
      this.drawMap();
    });

    // Mouse Pan & Click Dinleyicileri
    if (this.canvas) {
      this.canvas.addEventListener("mousedown", (e) => {
        this.isDragging = true;
        this.dragStartX = e.clientX - this.panX;
        this.dragStartY = e.clientY - this.panY;
      });

      window.addEventListener("mouseup", () => {
        this.isDragging = false;
      });

      this.canvas.addEventListener("mousemove", (e) => {
        if (this.isDragging) {
          this.panX = e.clientX - this.dragStartX;
          this.panY = e.clientY - this.dragStartY;
          this.drawMap();
        }
        this.handleCanvasMouseMove(e);
      });

      this.canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 0.9;
        this.zoom = Math.min(Math.max(this.zoom * factor, 0.5), 4.0);
        this.drawMap();
      });

      this.canvas.addEventListener("click", (e) => {
        this.handleCanvasClick(e);
      });
    }
  }

  /**
   * Aktif krateri değiştirir ve haritayı yeniler
   * @param {number} index - Krater indeksi
   */
  switchCrater(index) {
    if (index < 0 || index >= CRATERS_DATA.length) return;
    this.activeCraterIndex = index;
    this.activeCrater = CRATERS_DATA[index];
    this.zoom = this.activeCrater.default_zoom || 1.0;
    this.panX = 0;
    this.panY = 0;
    this.selectedWaypoint = null;
    this.render();
    this.bindCanvas();
    this.bindControls();
    this.drawMap();
  }

  /**
   * Fare hareketi sırasında telemetri koordinatlarını ve yükseklik tahminini günceller
   * @param {MouseEvent} e - Fare olayı
   */
  handleCanvasMouseMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left - this.canvas.width / 2 - this.panX;
    const y = e.clientY - rect.top - this.canvas.height / 2 - this.panY;

    // Gerçekçi Mars koordinat projeksiyonu
    const distFromCenter = Math.sqrt(x * x + y * y);
    const scaleFactor = 0.0008 / this.zoom;

    const lat = this.activeCrater.coordinates.lat - y * scaleFactor;
    const lon = this.activeCrater.coordinates.lon + x * scaleFactor;

    // Krater topoğrafya yükseklik modeli (kenarlarda yüksek, merkezde derin, Mount Sharp zirvesinde yüksek)
    let elev = this.activeCrater.elevation_datum_m;
    if (this.activeCrater.id === "gale-crater") {
      // Gale merkezinde 5.5 km'lik Mount Sharp konisi
      const peakDist = Math.sqrt((x - 20) * (x - 20) + (y + 10) * (y + 10));
      if (peakDist < 160 * this.zoom) {
        elev += (160 * this.zoom - peakDist) * 18;
      }
    } else {
      elev += distFromCenter * 4;
    }

    const slope = Math.min(Math.max((distFromCenter / 15) * (elev > -3000 ? 1.6 : 0.8), 1.2), 32.0);

    document.getElementById("hud-lat").innerText = `${lat.toFixed(4)}°`;
    document.getElementById("hud-lon").innerText = `${lon.toFixed(4)}°`;
    document.getElementById("hud-elev").innerText = `${Math.round(elev)} m`;
    document.getElementById("hud-slope").innerText = `${slope.toFixed(1)}°`;

    const navEl = document.getElementById("hud-nav");
    if (navEl) {
      if (slope > 25) {
        navEl.innerText = "TEHLİKELİ EĞİM";
        navEl.style.color = "#ff4444";
      } else if (slope > 15) {
        navEl.innerText = "DİKKAT (DİK)";
        navEl.style.color = "#f4a261";
      } else {
        navEl.innerText = "GÜVENLİ ROTA";
        navEl.style.color = "#22c55e";
      }
    }
  }

  /**
   * Canvas üzerinde waypoint tıklamalarını tespit eder ve sağ paneli günceller
   * @param {MouseEvent} e - Fare tıklama olayı
   */
  handleCanvasClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const waypoints = this.getCraterWaypoints();
    const centerX = this.canvas.width / 2 + this.panX;
    const centerY = this.canvas.height / 2 + this.panY;

    let clicked = null;
    for (const wp of waypoints) {
      const screenX = centerX + wp.relX * this.zoom;
      const screenY = centerY + wp.relY * this.zoom;
      const dist = Math.hypot(clickX - screenX, clickY - screenY);

      if (dist < 18) {
        clicked = wp;
        break;
      }
    }

    if (clicked) {
      this.selectedWaypoint = clicked;
      this.updateInspectorPanel(clicked);
      this.drawMap();
    }
  }

  /**
   * Seçili krater için gerçek bilimsel waypoint noktalarını döner
   * @returns {Array} Waypoint listesi
   */
  getCraterWaypoints() {
    if (this.activeCrater.id === "gale-crater") {
      return [
        {
          id: "wp-1",
          name: "Bradbury Landing (Touchdown)",
          sol: 0,
          elev: -4400,
          slope: "1.2°",
          geology: "Alüvyon ovası, bazalt çakılları",
          science: "Yüzeye iniş teyidi, ilk atmosferik ölçüm ve rover kalibrasyonu.",
          relX: -140,
          relY: -80,
          status: "Tamamlandı",
          type: "base"
        },
        {
          id: "wp-2",
          name: "Yellowknife Bay",
          sol: 125,
          elev: -4420,
          slope: "2.5°",
          geology: "Kil taşı, antik tatlı su göl tabanı",
          science: "Mars'ta ilk antik yaşanabilir göl ortamının ve C, H, N, O, P, S elementlerinin keşfi.",
          relX: -90,
          relY: -45,
          status: "Önemli Keşif",
          type: "lake"
        },
        {
          id: "wp-3",
          name: "Pahrump Hills (Dağ Tabanı)",
          sol: 753,
          elev: -4450,
          slope: "6.8°",
          geology: "Murray formasyonu bazal katmanı",
          science: "Mount Sharp'ın taban katmanının başlangıcı, mineral damarları incelemesi.",
          relX: -30,
          relY: -10,
          status: "Keşif Noktası",
          type: "outcrop"
        },
        {
          id: "wp-4",
          name: "Vera Rubin Ridge (Hematit)",
          sol: 1800,
          elev: -4210,
          slope: "18.0°",
          geology: "Sert hematit kristalli sırt",
          science: "Demir oksit mineralizasyonu ve yeraltı suyu kimyasının değişimi.",
          relX: 40,
          relY: 30,
          status: "Zorlu Tırmanış",
          type: "ridge"
        },
        {
          id: "wp-5",
          name: "Boxwork Sırtları & Sülfat Ünitesi",
          sol: 3400,
          elev: -4020,
          slope: "12.5°",
          geology: "Kalsiyum/Magnezyum sülfat, Boxwork ağları",
          science: "2025-2026 NASA Space Apps ana hedefi: Kuruyan Mars iklimi ve asidik su damarlarının oluşturduğu kutu şekilli sırtlar.",
          relX: 95,
          relY: 75,
          status: "Meydan Okuma Hedefi",
          type: "boxwork",
          highlight: true
        },
        {
          id: "wp-6",
          name: "Gediz Vallis Kanalı",
          sol: 4100,
          elev: -3900,
          slope: "16.2°",
          geology: "Devasa kaya moloz akıntısı ve sel yatağı",
          science: "Mount Sharp yamaçlarından akan son şiddetli su ve çamur sellerinin bıraktığı bloklar.",
          relX: 150,
          relY: 120,
          status: "Son Bilimsel İstasyon",
          type: "channel"
        }
      ];
    } else {
      // Jezero Krateri Waypointleri
      return [
        {
          id: "j-wp-1",
          name: "Octavia E. Butler İniş Sahası",
          sol: 0,
          elev: -2570,
          slope: "1.0°",
          geology: "Krater tabanı olivinli bazalt",
          science: "Perseverance ve Ingenuity ilk kalkış/sürüş bölgesi.",
          relX: -110,
          relY: -60,
          status: "Tamamlandı",
          type: "base"
        },
        {
          id: "j-wp-2",
          name: "Three Forks (Örnek Deposu)",
          sol: 650,
          elev: -2530,
          slope: "3.5°",
          geology: "Delta alt katmanı ince çökeller",
          science: "Dünya'ya getirilecek 10 adet mühürlü tüpün bırakıldığı resmi numune deposu.",
          relX: -30,
          relY: -20,
          status: "Kritik Depo",
          type: "depot",
          highlight: true
        },
        {
          id: "j-wp-3",
          name: "Neretva Vallis Delta Önü",
          sol: 1100,
          elev: -2480,
          slope: "14.0°",
          geology: "Delta yelpazesi, smektit kili ve karbonat",
          science: "Mikrobiyal biyoimzalar aramak için en ideal antik nehir giriş deltası.",
          relX: 60,
          relY: 40,
          status: "Aktif Saha",
          type: "delta"
        }
      ];
    }
  }

  /**
   * Tıklanan waypoint bilgilerini sağdaki denetçi panelinde görüntüler
   * @param {Object} wp - Waypoint nesnesi
   */
  updateInspectorPanel(wp) {
    const inspector = document.getElementById("inspector-content");
    if (!inspector) return;

    inspector.innerHTML = `
      <div class="inspect-card active-inspect">
        <div class="inspect-badge ${wp.highlight ? 'badge-highlight' : ''}">${wp.status}</div>
        <h3 class="inspect-title">${wp.name}</h3>
        
        <div class="inspect-metrics-grid">
          <div class="metric-box">
            <span class="m-label">İrtifa:</span>
            <span class="m-val">${wp.elev} m</span>
          </div>
          <div class="metric-box">
            <span class="m-label">Eğim Açısı:</span>
            <span class="m-val">${wp.slope}</span>
          </div>
          <div class="metric-box">
            <span class="m-label">Zaman:</span>
            <span class="m-val">Sol ${wp.sol}</span>
          </div>
          <div class="metric-box">
            <span class="m-label">O2 Marjı:</span>
            <span class="m-val text-green">%92 Güvenli</span>
          </div>
        </div>

        <div class="inspect-section">
          <h4 class="sub-label">🔬 JEOLOJİK FORMASYON</h4>
          <p class="sub-text">${wp.geology}</p>
        </div>

        <div class="inspect-section">
          <h4 class="sub-label">🎯 ASTRONOT BİLİMSEL HEDEFİ</h4>
          <p class="sub-text">${wp.science}</p>
        </div>

        <div class="inspect-section">
          <h4 class="sub-label">🛡️ MARSWALK GÜVENLİK YÖNERGESİ</h4>
          <p class="sub-text">
            ${wp.elev > -4100 ? 'Dik tırmanış için krampon tutucuları aktif edin. Gevşek yamaç taşlarına dikkat edin.' : 'Zemin sert ve düz. Astronot tekerlekli aracı ve yürüyüş için optimal koşul.'}
          </p>
        </div>
      </div>
    `;
  }

  /**
   * Haritayı katman katman Canvas üzerine çizer
   */
  drawMap() {
    if (!this.ctx || !this.canvas) return;
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Temizle
    ctx.clearRect(0, 0, w, h);

    const centerX = w / 2 + this.panX;
    const centerY = h / 2 + this.panY;
    const radius = Math.min(w, h) * 0.42 * this.zoom;

    ctx.save();

    // 1. KATMAN: Zemin ve Krater Dış Çevresi (Zifiri siyah uzayda Mars yüzeyi)
    ctx.fillStyle = "#0c0d12";
    ctx.fillRect(0, 0, w, h);

    // 2. KATMAN: Optik Uydu Katmanı (Krater Çanağı ve Ejecta Battaniyesi)
    if (this.layers.optical) {
      // Krater dış püskürtü çemberi (Ejecta blanket)
      const ejectaGrad = ctx.createRadialGradient(centerX, centerY, radius * 0.7, centerX, centerY, radius * 1.5);
      ejectaGrad.addColorStop(0, "rgba(50, 32, 24, 0.65)");
      ejectaGrad.addColorStop(0.7, "rgba(35, 22, 16, 0.4)");
      ejectaGrad.addColorStop(1, "rgba(12, 13, 18, 0)");
      ctx.fillStyle = ejectaGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Krater taban çanağı
      const craterFloorGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
      craterFloorGrad.addColorStop(0, "#2c1c14");
      craterFloorGrad.addColorStop(0.65, "#3d271c");
      craterFloorGrad.addColorStop(0.92, "#4a2f22");
      craterFloorGrad.addColorStop(1, "#18100c");
      ctx.fillStyle = craterFloorGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();

      // Krater kenar duvarı (Rim Scarp)
      ctx.strokeStyle = "rgba(255, 140, 100, 0.55)";
      ctx.lineWidth = 3.5 * this.zoom;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.stroke();

      // İç gölgelendirme çizgileri
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
      ctx.lineWidth = 6 * this.zoom;
      ctx.beginPath();
      ctx.arc(centerX + 4, centerY + 4, radius - 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 3. KATMAN: MOLA Topografik DEM Konturları
    if (this.layers.topography) {
      this.drawTopographyContours(ctx, centerX, centerY, radius);
    }

    // 4. KATMAN: Termal Kızılötesi (THEMIS Kaya Yoğunluğu)
    if (this.layers.thermal) {
      this.drawThermalLayer(ctx, centerX, centerY, radius);
    }

    // 5. KATMAN: USGS Jeolojik Birimler & Boxwork Formasyonları
    if (this.layers.geology) {
      this.drawGeologyLayer(ctx, centerX, centerY, radius);
    }

    // 6. KATMAN: Fırtına & Asidik Tehlike Koridorları
    if (this.layers.hazards) {
      this.drawHazardsLayer(ctx, centerX, centerY, radius);
    }

    // 7. KATMAN: İnsanlı Mars Yürüyüşü (EVA Rotası ve Waypointler)
    if (this.layers.evaRoute) {
      this.drawEvaRoute(ctx, centerX, centerY);
    }

    ctx.restore();
  }

  /**
   * Topografik yükseklik eşyükselti eğrilerini çizer
   */
  drawTopographyContours(ctx, cx, cy, r) {
    ctx.lineWidth = 1.2;
    const contourSteps = 6;

    for (let i = 1; i <= contourSteps; i++) {
      const stepR = (r / (contourSteps + 1)) * i;
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.18 + i * 0.06})`;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, stepR, 0, Math.PI * 2);
      ctx.stroke();

      // İrtifa etiketi
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(56, 189, 248, 0.75)";
      ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
      const elevText = `${Math.round(this.activeCrater.elevation_datum_m + i * 350)}m`;
      ctx.fillText(elevText, cx + stepR - 15, cy - 6);
    }
  }

  /**
   * Termal kaya yoğunluğu katmanını çizer
   */
  drawThermalLayer(ctx, cx, cy, r) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    const thermGrad = ctx.createRadialGradient(cx + 30, cy - 20, 10, cx, cy, r * 0.85);
    thermGrad.addColorStop(0, "#a855f7");
    thermGrad.addColorStop(0.5, "#3b82f6");
    thermGrad.addColorStop(1, "transparent");
    ctx.fillStyle = thermGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.85, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Jeolojik birimleri ve Space Apps 2026 Boxwork oluşumlarını çizer
   */
  drawGeologyLayer(ctx, cx, cy, r) {
    ctx.save();
    if (this.activeCrater.id === "gale-crater") {
      // Boxwork Ağı (Curiosity 2025 keşfi - meydan okuma odak alanı)
      ctx.strokeStyle = "rgba(255, 215, 0, 0.75)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 2]);

      const boxX = cx + 95 * this.zoom;
      const boxY = cy + 75 * this.zoom;

      // Kutu şeklinde jeolojik mineral sırtları (Boxwork reticulate ridges)
      for (let offset = -25; offset <= 25; offset += 10) {
        ctx.beginPath();
        ctx.moveTo(boxX + offset * this.zoom, boxY - 20 * this.zoom);
        ctx.lineTo(boxX + offset * this.zoom, boxY + 20 * this.zoom);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(boxX - 20 * this.zoom, boxY + offset * this.zoom);
        ctx.lineTo(boxX + 20 * this.zoom, boxY + offset * this.zoom);
        ctx.stroke();
      }

      ctx.setLineDash([]);
      ctx.fillStyle = "#ffd700";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.fillText("⚑ BOXWORK FORMASYONLARI (2025-26 HEDEFİ)", boxX - 70, boxY - 28 * this.zoom);
    }
    ctx.restore();
  }

  /**
   * Toz fırtınası koridorlarını ve asidik tehlike uyarılarını çizer
   */
  drawHazardsLayer(ctx, cx, cy, r) {
    ctx.save();
    // Rüzgar ve toz koridoru oku
    ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([8, 6]);

    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, cy + r * 0.5);
    ctx.lineTo(cx - r * 0.2, cy + r * 0.15);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(239, 68, 68, 0.85)";
    ctx.font = "bold 9px 'Public Sans Web', 'Public Sans', sans-serif";
    ctx.fillText("⚠ MEVSİMSEL RÜZGAR / TOZ JETİ", cx - r * 0.75, cy + r * 0.55);
    ctx.restore();
  }

  /**
   * İnsanlı keşif rotasını (EVA Marswalk) ve waypoint istasyonlarını çizer
   */
  drawEvaRoute(ctx, cx, cy) {
    const waypoints = this.getCraterWaypoints();
    if (waypoints.length < 2) return;

    // Rota Çizgisi
    ctx.save();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 3.2;
    ctx.shadowColor = "rgba(34, 197, 94, 0.8)";
    ctx.shadowBlur = 8;

    ctx.beginPath();
    waypoints.forEach((wp, idx) => {
      const x = cx + wp.relX * this.zoom;
      const y = cy + wp.relY * this.zoom;
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Waypoint İstasyon Noktaları
    waypoints.forEach((wp) => {
      const x = cx + wp.relX * this.zoom;
      const y = cy + wp.relY * this.zoom;
      const isSelected = this.selectedWaypoint && this.selectedWaypoint.id === wp.id;

      // Radar parlama halkası
      ctx.beginPath();
      ctx.arc(x, y, (wp.highlight ? 10 : 7) * this.zoom, 0, Math.PI * 2);
      ctx.fillStyle = wp.highlight ? "#ffd700" : (isSelected ? "#38bdf8" : "#22c55e");
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, (wp.highlight ? 15 : 11) * this.zoom, 0, Math.PI * 2);
      ctx.strokeStyle = wp.highlight ? "rgba(255, 215, 0, 0.5)" : "rgba(34, 197, 94, 0.4)";
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // İstasyon Adı Etiketi
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 10px 'Public Sans Web', 'Public Sans', sans-serif";
      ctx.shadowColor = "#000000";
      ctx.shadowBlur = 4;
      ctx.fillText(wp.name, x + 12 * this.zoom, y + 4);
      ctx.shadowBlur = 0;
    });

    ctx.restore();
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-5: JSDoc sınıf tanıtımı ve modül açıklaması.
   - Satır 7: CRATERS_DATA veri setinin içe aktarılması.
   - Satır 9: CraterMapViewer sınıf tanımı.
   - Satır 10-40: constructor; kapsayıcı DOM, aktif krater, katman bayrakları (optik, topo, termal, jeoloji, hazard, eva), zoom/pan ve telemetri durumlarını başlatır.
   - Satır 42-49: init metodu; render, canvas bağlama, olay dinleyicileri ve ilk çizimi tetikler.
   - Satır 51-140: render metodu; üst çubuk krater sekmeleri, sol katman panel anahtarları, merkez canvas kapsayıcısı ve sağ bilim denetçi panelini üretir.
   - Satır 142-160: bindCanvas ve resizeCanvas; canvas boyutlarını duyarlı (responsive) olarak ayarlar.
   - Satır 162-230: bindControls; zoom (+/-), pan fare sürükleme, tekerlek yakınlaştırma, katman checkbox ve tıklama olaylarını bağlar.
   - Satır 232-245: switchCrater; kullanıcı başka bir kratere geçtiğinde kamerayı sıfırlayıp yeni koordinatları çizer.
   - Satır 247-285: handleCanvasMouseMove; fare krater üzerinde gezinirken gerçekçi Mars enlem, boylam, yükseklik ve eğimini hesaplar ve ekrandaki HUD telemetrisini anlık günceller.
   - Satır 287-315: handleCanvasClick; tıklanan ekran koordinatına en yakın waypoint noktasını tespit eder ve sağdaki inceleme panelini açar.
   - Satır 317-410: getCraterWaypoints; Gale Krateri (Mount Sharp, Boxwork, Gediz Vallis) veya Jezero Krateri (Three Forks, Delta) bilimsel duraklarını döner.
   - Satır 412-455: updateInspectorPanel; seçilen noktanın irtifa, eğim, jeolojik yapısı ve astronot güvenlik yönergesini sağ panele yazar.
   - Satır 457-530: drawMap; tüm aktif katmanları (optik krater çanağı, kenar duvarı, DEM, termal, jeoloji, rotalar) sırayla 2D canvas üzerine render eder.
   - Satır 532-650: drawTopographyContours, drawThermalLayer, drawGeologyLayer (Space Apps 2026 Boxwork sırtları), drawHazardsLayer ve drawEvaRoute yardımcı çizim metotları.
   - Satır 651: CraterMapViewer sınıfının sonu.
   ========================================================================== */
