/**
 * @file ResourceItem.js
 * @description NASA kaynak ve veri setlerini temsil eden model sınıfı.
 */

export class ResourceItem {
  /**
   * ResourceItem yapıcı metodu
   * @param {Object} data - Kaynak verisi
   */
  constructor(data) {
    this.id = data.id || "";
    this.title = data.title || "Kaynak Başlığı";
    this.url = data.url || "#";
    this.tag = data.tag || "NASA Kaynağı";
    this.badgeColor = data.badgeColor || "mars-orange";
    this.description = data.description || "";
    this.actionText = data.actionText || "Keşfet";
    this.icon = data.icon || "🔗";
  }

  /**
   * Kaynak kartı HTML çıktısını üretir
   * @returns {string} Kaynak kartı HTML'i
   */
  renderCard() {
    return `
      <div class="resource-card" data-resource-id="${this.id}">
        <div class="resource-card-top">
          <div class="resource-icon-wrapper">
            <span class="resource-icon">${this.icon}</span>
          </div>
          <span class="resource-tag badge-${this.badgeColor}">${this.tag}</span>
        </div>
        <div class="resource-card-content">
          <h3 class="resource-title">${this.title}</h3>
          <p class="resource-description">${this.description}</p>
        </div>
        <div class="resource-card-action">
          <a href="${this.url}" target="_blank" rel="noopener noreferrer" class="btn-resource-link">
            <span>${this.actionText}</span>
            <svg class="external-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
      </div>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc modül açıklaması ve dosya başlığı.
   - Satır 6: ResourceItem sınıfının dışa aktarımı.
   - Satır 7-10: constructor JSDoc dokümantasyonu.
   - Satır 11: constructor metodu; kaynak ham verisini alır.
   - Satır 12-19: id, title, url, tag, badgeColor, description, actionText, icon alanlarına güvenli varsayılanlar atar.
   - Satır 20: constructor metodu bitişi.
   - Satır 22-25: renderCard metodu dokümantasyonu.
   - Satır 26: renderCard metodu tanımı; kaynak kartının HTML metnini döner.
   - Satır 27-46: Dış bağlantı içeren güvenli kart yapısı (rel="noopener noreferrer" güvenlik standardı ile).
   - Satır 47: renderCard fonksiyonu bitişi.
   - Satır 48: ResourceItem sınıfı bitişi.
   ========================================================================== */
