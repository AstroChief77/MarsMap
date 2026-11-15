/**
 * @file TeamMember.js
 * @description AstroChief ekip uyesini temsil eden ve guvenli HTML karti ureten model sinifi.
 */

(function (ns) {
  "use strict";
  class TeamMember {
    /**
     * TeamMember yapici metodu
     * @param {Object} data - Ekip uyesi verisi
     */
    constructor(data) {
      this.id = data.id || "";
      this.name = data.name || "";
      this.initials = data.initials || "AC";
      this.role = data.role || "";
      this.badge = data.badge || "";
      this.description = data.description || "";
    }

    /**
     * HTML kacis yardimcisi
     */
    escapeHtml(str) {
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    /**
     * Modal icinde gosterilecek sade acik gri-beyaz-kirmizi ekip kartini uretir
     * @returns {string} HTML metni
     */
    renderCard() {
      return `
        <div class="team-card" data-member="${this.escapeHtml(this.id)}">
          <div class="team-initials">${this.escapeHtml(this.initials)}</div>
          <div>
            <div style="font-size:13px;font-weight:900;">${this.escapeHtml(this.name)}</div>
            <div style="font-size:11px;font-weight:800;color:var(--mars-red-ink);">${this.escapeHtml(this.role)}</div>
            <p style="font-size:11px;color:var(--ink-muted);margin-top:3px;">${this.escapeHtml(this.description)}</p>
          </div>
        </div>
      `;
    }
  }

  ns.TeamMember = TeamMember;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-4: JSDoc ekip uyesi model sinifi tanimi.
   - Satir 6-20: constructor; uye kimligi, ad, bas harfler, rol, rozet ve aciklamayi nesneye baglar.
   - Satir 22-31: escapeHtml; XSS onlemi icin metinleri guvenli hale getirir.
   - Satir 33-48: renderCard; cift kontrastli acik gri kart uzerinde rozetli HTML ekip kartini uretir.
   ========================================================================== */
