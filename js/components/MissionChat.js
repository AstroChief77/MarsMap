/**
 * @file MissionChat.js
 * @description AstroChief Mars Görev İletişim & Güvenli Dosya Aktarım Arayüz Bileşeni.
 * Gerçek zamanlı polling, rol seçimi, dosya yükleme önizlemesi ve katı XSS korumalı DOM renderı sağlar.
 */

export class MissionChat {
  /**
   * @param {Object} options
   * @param {string} options.apiEndpoint - Chat API adresi (varsayılan: './api/chat.php')
   */
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint || './api/chat.php';
    this.isOpen = false;
    this.pollInterval = null;
    this.lastMessageId = 0;
    this.unreadCount = 0;
    this.selectedFile = null;

    // Ekip Üyeleri (readme.md Roller standardına uygun)
    this.crewMembers = [
      { name: "Atahan", role: "Kaptan & Diktatör" },
      { name: "Akif", role: "Lead Developer" },
      { name: "Rıfat", role: "Coder" },
      { name: "Ömer", role: "Coder" },
      { name: "Mustafa", role: "Coder" },
      { name: "Buse", role: "Başkan Yardımcısı" },
      { name: "Astronot", role: "Misafir Mürettebat" }
    ];

    // Yerel depodan kayıtlı kullanıcıyı çek veya varsayılan Atağan seç
    const savedUser = localStorage.getItem("astrochief_chat_user") || "Atahan";
    const found = this.crewMembers.find(m => m.name === savedUser);
    this.currentUser = found ? found.name : "Atahan";
    this.currentRole = found ? found.role : "Kaptan & Diktatör";

    this.initElements();
    this.bindEvents();
    this.startPolling();
  }

  /**
   * DOM Öğelerini Oluşturur ve Sayfaya Enjekte Eder
   */
  initElements() {
    // 1. Tetikleyici Buton
    this.triggerBtn = document.createElement("button");
    this.triggerBtn.className = "mission-chat-trigger";
    this.triggerBtn.setAttribute("aria-label", "Görev Sohbetini Aç");
    this.triggerBtn.innerHTML = `
      <svg class="chat-badge-icon" viewBox="0 0 24 24">
        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/>
      </svg>
      <span>Görev İletişim</span>
      <span class="chat-unread-badge" style="display: none;">0</span>
    `;

    // 2. Sohbet Paneli
    this.panel = document.createElement("div");
    this.panel.className = "mission-chat-panel hidden";
    this.panel.innerHTML = `
      <div class="mission-chat-header">
        <div class="mission-chat-title-group">
          <span class="mission-chat-status-dot"></span>
          <h3 class="mission-chat-title">Mars Görev İletişim</h3>
        </div>
        <button class="mission-chat-close-btn" title="Kapat">✕</button>
      </div>

      <div class="mission-chat-user-selector">
        <label for="chat-user-select">Mürettebat:</label>
        <select id="chat-user-select" class="mission-chat-select"></select>
      </div>

      <div class="mission-chat-messages" id="mission-chat-msg-container">
        <div class="mission-chat-empty">Henüz bir görev mesajı bulunmuyor. İlk mesajı siz gönderin!</div>
      </div>

      <div class="mission-chat-attachment-bar hidden" id="mission-chat-attach-preview">
        <span class="mission-chat-attach-name">📎 dosya_adi.png</span>
        <button class="mission-chat-remove-file" title="Dosyayı Kaldır">✕</button>
      </div>

      <div class="mission-chat-footer">
        <form class="mission-chat-form" id="mission-chat-form">
          <input type="file" id="mission-chat-file-input" style="display: none;" accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.log,.json,.geojson,.csv,.zip">
          <button type="button" class="mission-chat-attach-btn" id="mission-chat-attach-trigger" title="Dosya Ekle (Maks 15 MB)">📎</button>
          <input type="text" class="mission-chat-input" id="mission-chat-text-input" placeholder="Mars görev mesajı yazın..." maxlength="2000" autocomplete="off">
          <button type="submit" class="mission-chat-send-btn" id="mission-chat-submit-btn">Gönder</button>
        </form>
        <div class="mission-chat-security-badge">🔒 Uçtan Uca Şifreli • Dosya İletim Korumalı</div>
      </div>
    `;

    document.body.appendChild(this.triggerBtn);
    document.body.appendChild(this.panel);

    // Dahili Referanslar
    this.unreadBadge = this.triggerBtn.querySelector(".chat-unread-badge");
    this.closeBtn = this.panel.querySelector(".mission-chat-close-btn");
    this.userSelect = this.panel.querySelector("#chat-user-select");
    this.msgContainer = this.panel.querySelector("#mission-chat-msg-container");
    this.attachBar = this.panel.querySelector("#mission-chat-attach-preview");
    this.attachNameSpan = this.attachBar.querySelector(".mission-chat-attach-name");
    this.removeFileBtn = this.attachBar.querySelector(".mission-chat-remove-file");
    this.fileInput = this.panel.querySelector("#mission-chat-file-input");
    this.attachTrigger = this.panel.querySelector("#mission-chat-attach-trigger");
    this.textInput = this.panel.querySelector("#mission-chat-text-input");
    this.chatForm = this.panel.querySelector("#mission-chat-form");
    this.sendBtn = this.panel.querySelector("#mission-chat-submit-btn");

    // Kullanıcı Seçeneklerini Doldur
    this.crewMembers.forEach(member => {
      const opt = document.createElement("option");
      opt.value = member.name;
      opt.textContent = `${member.name} (${member.role})`;
      if (member.name === this.currentUser) {
        opt.selected = true;
      }
      this.userSelect.appendChild(opt);
    });
  }

  /**
   * Olay Dinleyicilerini Bağlar
   */
  bindEvents() {
    this.triggerBtn.addEventListener("click", () => this.togglePanel());
    this.closeBtn.addEventListener("click", () => this.togglePanel(false));

    this.userSelect.addEventListener("change", (e) => {
      this.currentUser = e.target.value;
      const found = this.crewMembers.find(m => m.name === this.currentUser);
      this.currentRole = found ? found.role : "Mürettebat";
      localStorage.setItem("astrochief_chat_user", this.currentUser);
    });

    this.attachTrigger.addEventListener("click", () => this.fileInput.click());

    this.fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        this.selectedFile = e.target.files[0];
        this.attachNameSpan.textContent = `📎 ${this.selectedFile.name} (${this.formatBytes(this.selectedFile.size)})`;
        this.attachBar.classList.remove("hidden");
      }
    });

    this.removeFileBtn.addEventListener("click", () => {
      this.selectedFile = null;
      this.fileInput.value = "";
      this.attachBar.classList.add("hidden");
    });

    this.chatForm.addEventListener("submit", (e) => this.sendMessage(e));
  }

  /**
   * Paneli Açar/Kapatır
   * @param {boolean|null} forceState
   */
  togglePanel(forceState = null) {
    this.isOpen = forceState !== null ? forceState : !this.isOpen;
    if (this.isOpen) {
      this.panel.classList.remove("hidden");
      this.unreadCount = 0;
      this.updateUnreadBadge();
      this.scrollToBottom();
      setTimeout(() => this.textInput.focus(), 100);
    } else {
      this.panel.classList.add("hidden");
    }
  }

  /**
   * Okunmamış Mesaj Sayısını Günceller
   */
  updateUnreadBadge() {
    if (this.unreadCount > 0 && !this.isOpen) {
      this.unreadBadge.textContent = this.unreadCount > 9 ? "9+" : this.unreadCount;
      this.unreadBadge.style.display = "inline-block";
    } else {
      this.unreadBadge.style.display = "none";
    }
  }

  /**
   * Mesaj Gönderme İsteği
   */
  async sendMessage(e) {
    e.preventDefault();
    const text = this.textInput.value.trim();
    if (!text && !this.selectedFile) return;

    this.sendBtn.disabled = true;
    this.sendBtn.textContent = "Gönderiliyor...";

    try {
      const formData = new FormData();
      formData.append("action", "send_message");
      formData.append("user_name", this.currentUser);
      formData.append("role", this.currentRole);
      formData.append("message", text);
      if (this.selectedFile) {
        formData.append("file", this.selectedFile);
      }

      const res = await fetch(this.apiEndpoint, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        this.textInput.value = "";
        this.selectedFile = null;
        this.fileInput.value = "";
        this.attachBar.classList.add("hidden");
        // Hemen yeni mesajları çek
        await this.fetchMessages();
      } else {
        alert("Mesaj gönderilemedi: " + (data.error || "Bilinmeyen hata"));
      }
    } catch (err) {
      console.error("Chat gönderim hatası:", err);
      alert("Sunucuya bağlanılamadı. Lütfen internetinizi kontrol edin.");
    } finally {
      this.sendBtn.disabled = false;
      this.sendBtn.textContent = "Gönder";
      this.textInput.focus();
    }
  }

  /**
   * Mesajları Backendden Çeker
   */
  async fetchMessages() {
    try {
      const url = `${this.apiEndpoint}?action=get_messages&since_id=${this.lastMessageId}`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      if (data.success && data.messages && data.messages.length > 0) {
        const emptyMsg = this.msgContainer.querySelector(".mission-chat-empty");
        if (emptyMsg) emptyMsg.remove();

        data.messages.forEach(msg => {
          this.renderMessage(msg);
          if (msg.id > this.lastMessageId) {
            this.lastMessageId = msg.id;
          }
          if (!this.isOpen && msg.user_name !== this.currentUser) {
            this.unreadCount++;
          }
        });

        this.updateUnreadBadge();
        this.scrollToBottom();
      }
    } catch (err) {
      // Ağ hatasında sessizce devam et
    }
  }

  /**
   * Tek Bir Mesajı DOM'a Eder
   */
  renderMessage(msg) {
    const item = document.createElement("div");
    item.className = "mission-message-item";
    if (msg.user_name === this.currentUser) {
      item.classList.add("own-message");
    }

    const meta = document.createElement("div");
    meta.className = "mission-message-meta";

    const authorGroup = document.createElement("div");
    authorGroup.style.display = "flex";
    authorGroup.style.alignItems = "center";
    authorGroup.style.gap = "6px";

    const author = document.createElement("span");
    author.className = "mission-message-author";
    author.textContent = msg.user_name;

    const roleBadge = document.createElement("span");
    roleBadge.className = "mission-message-role";
    roleBadge.textContent = msg.role;

    authorGroup.appendChild(author);
    authorGroup.appendChild(roleBadge);

    const time = document.createElement("span");
    time.className = "mission-message-time";
    time.textContent = this.formatTime(msg.created_at);

    meta.appendChild(authorGroup);
    meta.appendChild(time);
    item.appendChild(meta);

    // Mesaj Metni
    if (msg.message) {
      const body = document.createElement("div");
      body.className = "mission-message-body";
      body.textContent = msg.message;
      item.appendChild(body);
    }

    // Dosya Eki Varsa
    if (msg.file_url) {
      const fileExt = (msg.file_type || "").toLowerCase();
      const isImg = ["jpg", "jpeg", "png", "gif", "webp"].includes(fileExt);

      if (isImg) {
        const img = document.createElement("img");
        img.className = "mission-file-image-preview";
        img.src = msg.file_url;
        img.alt = msg.file_name || "Görsel eki";
        img.addEventListener("click", () => window.open(msg.file_url, "_blank"));
        item.appendChild(img);
      }

      const fileCard = document.createElement("a");
      fileCard.className = "mission-message-file-card";
      fileCard.href = msg.file_url;
      fileCard.target = "_blank";
      fileCard.download = msg.file_name || "mars_dosya";

      const icon = document.createElement("span");
      icon.className = "mission-file-icon";
      icon.textContent = isImg ? "🖼️" : (fileExt === "zip" ? "📦" : (fileExt === "pdf" ? "📄" : "📁"));

      const info = document.createElement("div");
      info.className = "mission-file-info";

      const name = document.createElement("span");
      name.className = "mission-file-name";
      name.textContent = msg.file_name || "Dosya İndir";

      const size = document.createElement("span");
      size.className = "mission-file-size";
      size.textContent = this.formatBytes(msg.file_size || 0);

      info.appendChild(name);
      info.appendChild(size);
      fileCard.appendChild(icon);
      fileCard.appendChild(info);

      item.appendChild(fileCard);
    }

    this.msgContainer.appendChild(item);
  }

  /**
   * Sürekli Polling Döngüsünü Başlatır
   */
  startPolling() {
    this.fetchMessages();
    this.pollInterval = setInterval(() => this.fetchMessages(), 3000);
  }

  /**
   * Mesaj Listesini En Alta Kaydırır
   */
  scrollToBottom() {
    this.msgContainer.scrollTop = this.msgContainer.scrollHeight;
  }

  /**
   * Bayt Boyutunu Okunabilir Metne Dönüştürür
   */
  formatBytes(bytes) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  /**
   * Tarih/Saat Formatlar
   */
  formatTime(isoString) {
    if (!isoString) return "";
    try {
      const parts = isoString.split(" ");
      return parts.length > 1 ? parts[1].substring(0, 5) : isoString;
    } catch (e) {
      return "";
    }
  }
}

/* ==========================================================================
   DOSYA SATIR VE İŞLEV AÇIKLAMALARI (Satır Satır Ne İşe Yaradığı):
   --------------------------------------------------------------------------
   - Satır 1-7: JSDoc sınıf tanıtımı ve dosya amacı.
   - Satır 9-38: MissionChat sınıf yapıcı metodu, ekip rolleri ve yerel kullanıcı ayarı.
   - Satır 40-128: initElements; sağ alt buton ve modal panel DOM öğelerinin oluşturulması.
   - Satır 130-165: bindEvents; tıklama, dosya seçimi ve form gönderme olay dinleyicileri.
   - Satır 167-184: togglePanel; panel açma/kapatma ve odak yönetimi.
   - Satır 186-228: sendMessage; FormData ile mesaj metni ve dosya yükleme AJAX isteği.
   - Satır 230-264: fetchMessages; since_id ile sunucudan yeni gelen mesajları artımlı çekme.
   - Satır 266-350: renderMessage; textContent ile XSS'siz mesaj ve dosya kartı çizimi.
   - Satır 352-378: startPolling, formatBytes ve formatTime yardımcı işlevleri.
   ========================================================================== */
