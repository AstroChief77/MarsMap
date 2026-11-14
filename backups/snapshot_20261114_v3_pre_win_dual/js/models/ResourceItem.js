/**
 * @file ResourceItem.js
 * @description NASA ve USGS kaynak verilerini temsil eden ve kart HTML'i ureten model sinifi.
 */

export class ResourceItem {
  /**
   * ResourceItem yapici metodu
   * @param {Object} data - Kaynak kaydi
   */
  constructor(data) {
    this.id = data.id || "";
    this.title = data.title || "";
    this.url = data.url || "#";
    this.tag = data.tag || "";
    this.description = data.description || "";
    this.actionText = data.actionText || "İncele";
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Kaynak listesi satiri uretir
   * @returns {string} HTML metni
   */
  renderRow() {
    return `
      <div class="resource-row">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
          <strong>${this.escapeHtml(this.title)}</strong>
          <span style="font-size:10px;color:var(--mars-red);font-weight:900;">${this.escapeHtml(this.tag)}</span>
        </div>
        <p style="font-size:11px;color:var(--ink-dark);margin:4px 0;">${this.escapeHtml(this.description)}</p>
        <a href="${this.escapeHtml(this.url)}" target="_blank" rel="noopener noreferrer"
           style="font-size:11px;font-weight:800;color:var(--route-blue);text-decoration:underline;">
          ${this.escapeHtml(this.actionText)} ↗
        </a>
      </div>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-4: JSDoc NASA/USGS kaynak modeli tanimi.
   - Satir 6-18: constructor; baslik, resmi URL, etiket ve aciklama ozelliklerini atar.
   - Satir 20-45: escapeHtml ve renderRow; Bilgi modalinda gosterilecek kaynak satirini uretir.
   ========================================================================== */
