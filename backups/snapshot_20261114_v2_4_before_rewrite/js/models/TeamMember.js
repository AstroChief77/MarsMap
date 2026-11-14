/**
 * @file TeamMember.js
 * @description Ekip üyelerini temsil eden sınıf (Model).
 */

export class TeamMember {
  /**
   * TeamMember sınıfı yapıcı metodu
   * @param {Object} data - Ekip üyesi verisi
   */
  constructor(data) {
    this.id = data.id || "";
    this.name = data.name || "İsimsiz Astronot";
    this.role = data.role || "Görevli";
    this.badge = data.badge || "Crew";
    this.avatar = data.avatar || "";
    this.description = data.description || "";
    this.icon = data.icon || "🚀";
  }

  /**
   * Ekip üyesi için HTML kart şablonunu oluşturur
   * @returns {string} HTML kart şablonu
   */
  renderCard() {
    return `
      <div class="team-card" data-member-id="${this.id}">
        <div class="team-card-header">
          <div class="team-avatar-wrapper">
            <img src="${this.avatar}" alt="${this.name}" class="team-avatar" loading="lazy" />
            <span class="team-status-indicator" title="Aktif Görevde"></span>
          </div>
          <span class="team-badge">${this.badge}</span>
        </div>
        <div class="team-card-body">
          <div class="team-icon-badge">${this.icon}</div>
          <h3 class="team-member-name">${this.name}</h3>
          <p class="team-member-role">${this.role}</p>
          <p class="team-member-description">${this.description}</p>
        </div>
        <div class="team-card-footer">
          <span class="mission-tag">AstroChief Core Team</span>
        </div>
      </div>
    `;
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-4: JSDoc sınıf açıklaması ve dosya başlığı.
   - Satır 6: TeamMember sınıfının dışa aktarımı.
   - Satır 7-10: constructor JSDoc dokümantasyonu.
   - Satır 11: constructor fonksiyonu, parametre olarak ham üye nesnesini alır.
   - Satır 12-18: Nesne alanlarını varsayılan değerlerle atar (id, name, role, badge, avatar, description, icon).
   - Satır 19: constructor bitişi.
   - Satır 21-24: renderCard fonksiyonu dokümantasyonu.
   - Satır 25: renderCard metodu tanımı; üyenin DOM kartını döner.
   - Satır 26-44: Template literal kullanarak kartın HTML yapısını (avatar, isim, rol, rozet, açıklama) oluşturur.
   - Satır 45: renderCard metodu bitişi.
   - Satır 46: TeamMember sınıfı bitişi.
   ========================================================================== */
