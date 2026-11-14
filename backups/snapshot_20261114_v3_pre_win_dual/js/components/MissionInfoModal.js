/**
 * @file MissionInfoModal.js
 * @description NASA Space Apps 2026 yarisma bilgileri, resmi NASA kaynaklari/uyarisi
 * ve AstroChief ekip rollerini (Atahan, Buse, Akif, Rifat, Omer, Mustafa) gosteren modal sinifi.
 */

import { TEAM_MEMBERS_DATA } from "../../data/teamData.js";
import { RESOURCES_DATA, NASA_DISCLAIMER } from "../../data/resourcesData.js";
import { TeamMember } from "../models/TeamMember.js";
import { ResourceItem } from "../models/ResourceItem.js";

export class MissionInfoModal {
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

    const teamHtml = TEAM_MEMBERS_DATA.map((m) => new TeamMember(m).renderCard()).join("");
    const resHtml = RESOURCES_DATA.map((r) => new ResourceItem(r).renderRow()).join("");

    this.mountEl.innerHTML = `
      <div class="modal-backdrop" id="mission-modal-backdrop" role="dialog" aria-modal="true" aria-label="AstroChief Görev ve Kaynak Bilgileri">
        <div class="modal-box">
          <div class="modal-head">
            <div>
              <h2>ASTROCHIEF // NASA SPACE APPS 2026</h2>
              <div style="font-size:12px;color:var(--mars-red);font-weight:800;">Interplanetary Survival Guide: Martian Map</div>
            </div>
            <button class="sat-pop-close" id="btn-close-mission-modal" title="Kapat">✕</button>
          </div>

          <p style="font-size:12px;color:var(--ink-dark);">
            Bu navigator; NASA Space Apps Challenge 2026 kapsamında astronotların Mars yüzeyinde asit yağmuru,
            kum fırtınası/kasırga ve Alfa/Beta/Gama foton bombardımanı risklerinden kaçınarak bilimsel hedeflere
            <strong>en güvenli ve en kısa (Mavi)</strong> ile <strong>güvenli uzun alternatif (Soluk Mavi)</strong> rotaları
            saat, km/m ve Litre bazında planlaması için geliştirilmiştir.
          </p>

          <div>
            <h3 style="font-size:13px;font-weight:900;margin-bottom:8px;">EKİP VE ROLLER</h3>
            <div class="modal-grid-team">${teamHtml}</div>
          </div>

          <div>
            <h3 style="font-size:13px;font-weight:900;margin-bottom:8px;">KULLANILAN NASA &amp; USGS KAYNAKLARI</h3>
            <div class="resource-list">${resHtml}</div>
          </div>

          <div class="disclaimer-box">
            <strong>${NASA_DISCLAIMER.title}:</strong> ${NASA_DISCLAIMER.text}
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

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-5: JSDoc yarisma bilgisi, ekip rolleri ve NASA kaynaklari modali tanimi.
   - Satir 12-30: constructor, open ve close metodlari.
   - Satir 32-78: render; TeamMember ve ResourceItem modellerini birlestirerek modali ekrana cizer.
   ========================================================================== */
