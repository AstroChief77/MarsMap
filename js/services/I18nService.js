/**
 * @file I18nService.js
 * @description AstroChief Mars Navigator 9 dilli uluslararasilastirma (i18n) servis sinifi.
 * Desteklenen diller: Korece (ko), Japonca (ja), Turkce (tr),
 * Almanca (de), Ingilizce (en), Ibranice (he), Arapca (ar), Fransizca (fr), Ispanyolca (es).
 */

(function (ns) {
  "use strict";

  class I18nService {
    /**
     * I18nService yapici metodu
     * @param {string} initialLang - Baslangic dil kodu (varsayilan: 'tr')
     */
    constructor(initialLang = "tr") {
      this.locales = ns.I18N_LOCALES || {};
      this.supportedLanguages = [
        { code: "tr", label: "Türkçe", nativeName: "Türkçe", badge: "TR", dir: "ltr" },
        { code: "en", label: "English", nativeName: "English", badge: "EN", dir: "ltr" },
        { code: "de", label: "Deutsch", nativeName: "Deutsch", badge: "DE", dir: "ltr" },
        { code: "fr", label: "Français", nativeName: "Français", badge: "FR", dir: "ltr" },
        { code: "es", label: "Español", nativeName: "Español", badge: "ES", dir: "ltr" },
        { code: "ko", label: "한국어", nativeName: "한국어", badge: "KO", dir: "ltr" },
        { code: "ja", label: "日本語", nativeName: "日本語", badge: "JA", dir: "ltr" },
        { code: "he", label: "עברית", nativeName: "עברית", badge: "HE", dir: "rtl" },
        { code: "ar", label: "العربية", nativeName: "العربية", badge: "AR", dir: "rtl" }
      ];
      this.currentLang = "tr";
      this.setLang(initialLang);
    }

    escapeHtml(str) {
      return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    /**
     * Desteklenen 9 dilin listesini dondurur
     * @returns {Array} Dil tanimlari
     */
    getSupportedLanguages() {
      return this.supportedLanguages;
    }

    getLanguages() {
      return this.supportedLanguages;
    }

    /**
     * Aktif dil kodunu dondurur
     * @returns {string} Dil kodu
     */
    getLang() {
      return this.currentLang;
    }

    /**
     * Aktif dilin sagdan sola (RTL - Arapca/Ibranice) olup olmadigini doner
     * @returns {boolean} RTL durumu
     */
    isRtl() {
      const dict = this.locales[this.currentLang];
      return Boolean(dict && dict.dir === "rtl");
    }

    /**
     * Aktif dili degistirir ve belge dil/yon niteliklerini gunceller
     * @param {string} langCode - Secilen dil kodu
     * @returns {string} Uygulanan gecerli dil kodu
     */
    setLang(langCode) {
      const code = String(langCode || "tr").toLowerCase();
      this.currentLang = this.locales[code] ? code : "tr";
      this.applyDocumentAttributes();
      return this.currentLang;
    }

    /**
     * HTML lang, sayfa basligi ve RTL sinifini DOM uzerine uygular
     */
    applyDocumentAttributes() {
      if (typeof document === "undefined") return;
      const dict = this.locales[this.currentLang] || this.locales.tr || {};
      if (document.documentElement) {
        document.documentElement.setAttribute("lang", this.currentLang);
        document.documentElement.setAttribute("data-lang-dir", dict.dir || "ltr");
      }
      if (document.body) {
        document.body.classList.toggle("rtl-lang", dict.dir === "rtl");
      }
      if (dict.pageTitle) {
        document.title = dict.pageTitle;
      }
    }

    /**
     * Anahtar metni aktif dile cevirir ve {degisken} yer tutucularini doldurur
     * @param {string} key - Ceviri anahtari
     * @param {Object} vars - Degisken degerleri
     * @returns {string} Cevrilmis metin
     */
    t(key, vars = {}) {
      const activeDict = this.locales[this.currentLang] || {};
      const fallbackTr = this.locales.tr || {};
      const fallbackEn = this.locales.en || {};
      let raw = activeDict[key];
      if (raw === undefined) raw = fallbackTr[key];
      if (raw === undefined) raw = fallbackEn[key];
      if (raw === undefined) return key;
      if (typeof raw !== "string") return raw;

      return raw.replace(/\{(\w+)\}/g, (_m, k) => (
        vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : `{${k}}`
      ));
    }

    /**
     * Siddet anahtarini ('hafif' | 'orta' | 'siddetli') aktif dile cevirir
     */
    getIntensityLabel(level) {
      if (level === "hafif") return this.t("intensityLow");
      if (level === "siddetli") return this.t("intensitySevere");
      return this.t("intensityMedium");
    }

    /**
     * Krater nesnesinin adini aktif dile gore yerellestirir
     */
    localizeCrater(crater) {
      if (!crater) return null;
      const map = {
        "gale-crater": "craterGale",
        "jezero-crater": "craterJezero",
        "korolev-crater": "craterKorolev"
      };
      const key = map[crater.id];
      return key ? { ...crater, name: this.t(key) } : crater;
    }

    /**
     * Ekip uyelerinin rol ve aciklamalarini aktif dile cevirir
     */
    localizeTeamMember(member) {
      if (!member) return member;
      const prefix = member.id;
      const roleKey = `${prefix}Role`;
      const descKey = `${prefix}Desc`;
      const dict = this.locales[this.currentLang] || {};
      return {
        ...member,
        role: dict[roleKey] ? this.t(roleKey) : member.role,
        description: dict[descKey] ? this.t(descKey) : member.description
      };
    }
  }

  ns.I18nService = I18nService;
  ns.i18n = new I18nService("tr");
})(window.AstroChief = window.AstroChief || {});

/* ==========================================================================
   DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
   --------------------------------------------------------------------------
   - Satir 1-6: JSDoc 9 dilli i18n servis sinifi tanimi.
   - Satir 10-31: constructor; 9 dil listesini (tr, en, de, fr, es, ko, ja, he, ar) ve varsayilan dili baslatir.
   - Satir 33-67: getSupportedLanguages, getLang, isRtl ve setLang metodlari.
   - Satir 69-85: applyDocumentAttributes; html[lang], sayfa basligi ve RTL gorunum sinifini gunceller.
   - Satir 87-106: t(key, vars); sozlukten metni cozer ve dinamik parametrelere gore bicimlendirir.
   - Satir 108-144: getIntensityLabel, localizeCrater ve localizeTeamMember yardimcilari.
   ========================================================================== */
