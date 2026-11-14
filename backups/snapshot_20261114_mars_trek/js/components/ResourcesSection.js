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
   * Resources HTML çıktısını %60 Beyaz temiz çerçeve içinde hazırlar
   */
  render() {
    const cardsHtml = this.resources.map((res) => res.renderCard()).join("");

    this.container.innerHTML = `
      <section id="resources" class="section-resources-clean">
        <div class="white-panel-wrapper">
          <div class="section-header-clean">
            <div class="challenge-event-badge">NASA DATA REPOSITORIES</div>
            <h2 class="clean-section-title">NASA Data &amp; Resources</h2>
            <p class="clean-section-subtitle">
              AstroChief navigasyonunda kullanılan resmi NASA veri portalları, jeolojik haritalar, Mars Trek servisleri ve ham görsel arşivleri.
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
        </div>
      </section>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc sınıf ve dosya tanımı.
   - Satır 6-7: ResourceItem model sınıfı ve resourcesData veri setinin içe aktarılması.
   - Satır 9: ResourcesSection sınıfının tanımlanması.
   - Satır 10-17: constructor; kapsayıcıyı bulur ve veri dizisini ResourceItem nesnelerine dönüştürür.
   - Satır 19-24: init metodu; bileşeni ekrana çizer.
   - Satır 26-59: render metodu; .white-panel-wrapper içinde NASA Disclaimer kutusu ve kaynak kartlarını üretir.
   - Satır 60: ResourcesSection sınıfının sonu.
   ========================================================================== */
