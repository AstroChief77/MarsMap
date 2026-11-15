/**
 * @file MissionInfoModal.js
 * @description NASA Space Apps 2026 yarisma bilgileri, resmi NASA kaynaklari/uyarisi
 * ve AstroChief ekip rollerini (Atahan, Buse, Akif, Rifat, Omer, Mustafa) 9 dilde gosteren modal sinifi.
 */

(function (ns) {
  "use strict";
  const { TEAM_MEMBERS_DATA, RESOURCES_DATA, NASA_DISCLAIMER, TeamMember, ResourceItem } = ns;

  class MissionInfoModal {
    /**
     * MissionInfoModal yapici metodu
     * @param {HTMLElement} mountEl - #mission-modal-root elemani
     */
    constructor(mountEl) {
      this.mountEl = mountEl;
      this.isOpen = false;
    }

    open() {
      this.isOpen = true;
      this.render();
    }

    close() {
      this.isOpen = false;
      if (this.mountEl) this.mountEl.innerHTML = "";
    }

    render() {
      if (!this.mountEl || !this.isOpen) return;
      const i18n = ns.i18n;
      const t = (k, v) => (i18n ? i18n.t(k, v) : k);
      const dirAttr = (i18n && i18n.isRtl()) ? 'dir="rtl"' : 'dir="ltr"';

      const teamHtml = TEAM_MEMBERS_DATA.map((m) => {
        const locM = i18n ? i18n.localizeTeamMember(m) : m;
        return new TeamMember(locM).renderCard();
      }).join("");
      const resHtml = RESOURCES_DATA.map((r) => new ResourceItem(r).renderRow()).join("");

      this.mountEl.innerHTML = `
        <div class="modal-backdrop" id="mission-modal-backdrop" role="dialog" aria-modal="true" aria-label="${t("navInfoTitle")}">
          <div class="modal-box" ${dirAttr}>
            <div class="modal-head">
              <div>
                <h2>ASTROCHIEF // NASA SPACE APPS 2026</h2>
                <div style="font-size:12px;color:var(--mars-red-ink);font-weight:800;">${t("modalSubtitle")}</div>
              </div>
              <button class="sat-pop-close" id="btn-close-mission-modal" title="${t("close")}">✕</button>
            </div>

            <p style="font-size:12px;color:var(--ink-dark);">
              ${t("modalDesc")}
            </p>

            <div>
              <h3 style="font-size:13px;font-weight:900;margin-bottom:8px;">${t("modalTeamHeading")}</h3>
              <div class="modal-grid-team">${teamHtml}</div>
            </div>

            <div>
              <h3 style="font-size:13px;font-weight:900;margin-bottom:8px;">${t("modalResourcesHeading")}</h3>
              <div class="resource-list">${resHtml}</div>
            </div>

            <div class="disclaimer-box">
              <strong>${t("disclaimerTitle") || NASA_DISCLAIMER.title}:</strong> ${t("disclaimerText") || NASA_DISCLAIMER.text}
            </div>
          </div>
        </div>
      `;

      this.mountEl.querySelector("#btn-close-mission-modal")?.addEventListener("click", () => this.close());
      this.mountEl.querySelector("#mission-modal-backdrop")?.addEventListener("click", (e) => {
        if (e.target.id === "mission-modal-backdrop") this.close();
      });
    }
  }

  ns.MissionInfoModal = MissionInfoModal;
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc yarisma bilgisi, ekip rolleri ve NASA kaynaklari modali tanimi (9 dil destekli).
   - Satir 11-30: constructor, open ve close metodlari.
   - Satir 32-78: render; 9 dil destegiyle TeamMember ve ResourceItem modellerini birlestirerek modali ekrana cizer.
   ========================================================================== */
