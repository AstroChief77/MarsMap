/**
 * @file TeamSection.js
 * @description AstroChief ekip üyelerini (Teams) ve rollerini listeleyen bileşen sınıfı.
 */

import { TeamMember } from "../models/TeamMember.js";
import { TEAM_MEMBERS_DATA } from "../../data/teamData.js";

export class TeamSection {
  /**
   * TeamSection yapıcı metodu
   * @param {string} containerId - Ekip bölümünün basılacağı HTML element ID'si
   */
  constructor(containerId = "teams-container") {
    this.container = document.getElementById(containerId);
    this.members = TEAM_MEMBERS_DATA.map((data) => new TeamMember(data));
  }

  /**
   * Ekip bileşenini başlatır ve ekrana çizer
   */
  init() {
    if (!this.container) return;
    this.render();
  }

  /**
   * Ekip bölümü HTML çıktısını oluşturur
   */
  render() {
    const membersHtml = this.members.map((member) => member.renderCard()).join("");

    this.container.innerHTML = `
      <section id="teams" class="section-teams">
        <div class="section-header">
          <div class="section-badge">Crew Manifest</div>
          <h2 class="section-title">AstroChief Flight Crew & Engineering Team</h2>
          <p class="section-subtitle">
            Mars yüzey görevinin stratejik planlamasından yazılım mimarisine kadar AstroChief operasyonunu yürüten çekirdek kadro.
          </p>
        </div>

        <div class="team-grid">
          ${membersHtml}
        </div>
      </section>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc sınıf tanıtımı ve dosya bilgisi.
   - Satır 6-7: TeamMember modelinin ve TEAM_MEMBERS_DATA verisinin içe aktarımı.
   - Satır 9: TeamSection sınıfı bildirimi.
   - Satır 10-17: constructor metodu; hedef kapsayıcıyı seçer ve verileri TeamMember nesnelerine dönüştürür.
   - Satır 19-24: init metodu; kontrol yapıp render'ı çalıştırır.
   - Satır 26-44: render metodu; başlık, alt başlık ve her bir üyenin kartını içeren grid yapısını üretir.
   - Satır 45: TeamSection sınıfı sonu.
   ========================================================================== */
