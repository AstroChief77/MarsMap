/**
 * @file ResourcesSection.js
 * @description NASA kaynakları, veri bağlantıları ve resmi feragatname (disclaimer) bölümünü yöneten sınıf.
 */

import { ResourceItem } from "../models/ResourceItem.js";
import { RESOURCES_DATA, NASA_DISCLAIMER } from "../../data/resourcesData.js";

export class ResourcesSection {
  /**
   * ResourcesSection yapıcı metodu
   * @param {string} containerId - Bölümün yerleştirileceği kapsayıcı element ID'si
   */
  constructor(containerId = "resources-container") {
    this.container = document.getElementById(containerId);
    this.resources = RESOURCES_DATA.map((item) => new ResourceItem(item));
  }

  /**
   * Bölümü başlatır ve içeriği üretir
   */
  init() {
    if (!this.container) return;
    this.render();
  }

  /**
   * Resources HTML çıktısını hazırlar
   */
  render() {
    const cardsHtml = this.resources.map((res) => res.renderCard()).join("");

    this.container.innerHTML = `
      <section id="resources" class="section-resources">
        <div class="section-header">
          <div class="section-badge">Data Repositories</div>
          <h2 class="section-title">NASA Data & Resources</h2>
          <p class="section-subtitle">
            AstroChief görevinde faydalanılan resmi NASA veri portalları, jeolojik harita katmanları ve rover ham görsel arşivleri.
          </p>
        </div>

        <!-- NASA Resmi Uyarı / Feragatname Kutusu (Disclaimer) -->
        <div class="nasa-disclaimer-box" role="note" aria-label="NASA Yasal Uyarı Metni">
          <div class="disclaimer-header">
            <span class="disclaimer-icon">⚖️</span>
            <h4 class="disclaimer-title">${NASA_DISCLAIMER.title}</h4>
          </div>
          <p class="disclaimer-text">
            ${NASA_DISCLAIMER.text}
          </p>
        </div>

        <!-- Kaynak Kartları Izgarası (Grid) -->
        <div class="resources-grid">
          ${cardsHtml}
        </div>
      </section>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc sınıf ve dosya tanımı.
   - Satır 6-7: ResourceItem model sınıfı ve resourcesData veri setinin içe aktarılması (import).
   - Satır 9: ResourcesSection sınıfının tanımlanması.
   - Satır 10-17: constructor metodu; kapsayıcı DOM elementini bulur ve veri dizisini ResourceItem nesnelerine dönüştürür.
   - Satır 19-24: init metodu; bileşeni ekrana çizer.
   - Satır 26-55: render metodu; NASA Disclaimer kutucuğu ve kaynak kartlarının ızgara yapısını oluşturur.
   - Satır 56: ResourcesSection sınıfının sonu.
   ========================================================================== */
