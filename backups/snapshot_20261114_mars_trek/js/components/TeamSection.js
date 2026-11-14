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
   * Ekip bölümü HTML çıktısını %60 Beyaz temiz çerçeve içinde oluşturur
   */
  render() {
    const membersHtml = this.members.map((member) => member.renderCard()).join("");

    this.container.innerHTML = `
      <section id="teams" class="section-teams-clean">
        <div class="white-panel-wrapper">
          <div class="section-header-clean">
            <div class="challenge-event-badge">CREW MANIFEST</div>
            <h2 class="clean-section-title">AstroChief Flight Crew &amp; Engineering Team</h2>
            <p class="clean-section-subtitle">
              Mars yüzey haritalandırma görevinin stratejik yönetiminden yazılım mimarisine kadar AstroChief operasyonunu yürüten çekirdek mürettebat.
            </p>
          </div>

          <div class="team-grid">
            ${membersHtml}
          </div>
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
   - Satır 10-17: constructor; kapsayıcıyı seçer ve verileri TeamMember nesnelerine dönüştürür.
   - Satır 19-24: init metodu; bileşeni render eder.
   - Satır 26-48: render metodu; .white-panel-wrapper içinde mürettebat kartları grid yapısını üretir.
   - Satır 49: TeamSection sınıfı sonu.
   ========================================================================== */
