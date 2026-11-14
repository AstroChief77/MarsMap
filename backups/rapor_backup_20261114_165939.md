# MarsMap Teknik Güvenlik, Kalite ve Mimari Denetim Raporu

> **Denetim Kapsamı ve İlke Notu:** Bu rapor, depo içindeki mevcut kaynak kodlara ve [`readme.md`](readme.md) dosyasına **hiçbir değişiklik yapılmadan**, statik kod ve mimari inceleme yoluyla hazırlanmıştır. Güvenlik bulguları yalnızca savunma, kök neden analizi ve iyileştirme amacıyla belgelenmiştir.

---

## Yönetici Özeti ve Denetim Envanteri

| Metrik / Kapsam | Doğrulanan Değer | Not |
|---|---|---|
| Git ile takip edilen toplam dosya | **2.007** | Tüm uygulama, backend, sohbet ve araç dosyaları |
| Derleme çıktısı (`dist/`) | **1.091 dosya / 81,81 MiB** | Üretilmiş çıktılar doğrudan Git geçmişinde tutuluyor |
| Yedekler (`backups/`) | **344 dosya / 2,92 MiB** | 6 kopya `readme_backup*.md` dahil |
| Eksik i18n anahtarı | **12 anahtar** | Tüm 9 dil sözlüğünde eksik |
| Eksik alt bilgi (`DOSYA SATIR...`) | **7 dosya** | Rust/WASM ve WASM build betikleri |
| Satır numarası kaymış alt bilgi | **38 dosya** | Gerçek son satır ile alt bilgi arasında >5 satır fark |
| Eski `"10 dil"` kalıntısı | **18 satır** | Çince (`zh`) çıkarılmasına rağmen güncellenmemiş |

**Genel Değerlendirme:**
1. **Güvenlik tarafında** istemci tarafında doğrulanmamış `innerHTML` eklemeleri ve `?api=` yönlendirmesi (DOM XSS ve veri sızıntısı), sunucu tarafında kimlik doğrulaması/CSRF olmayan ve ölü MIME kontrolü barındıran PHP sohbet yükleme uç noktası ile `www-data -> root` `NOPASSWD` sudoers yetki yükseltme yüzeyi öne çıkmaktadır.
2. **İşlevsellik ve kararlılık tarafında** dil değiştirme doğrudan `TypeError` ile çökmekte, `/chat/` modülü yanlış göreli API yolu nedeniyle 404 vermekte, [`readme.md`](readme.md) ve [`BACKEND_API.md`](BACKEND_API.md) içinde vaat edilen HTTP Rust backend sunucusu fiilen bulunmamaktadır. WASM katmanı antimeridyen geçişlerini ve MOLA karolarını hesaba katmamakta, 3B tıklama (picking) ise eğim/sapma/yakınlaştırma parametrelerini düşürmektedir.

---

## Bölüm 1: Zafiyetli Kodlar (Güvenlik Açıkları)

### 1. [KRİTİK] DOM XSS (`innerHTML` Enjeksiyonu) ve `?api=` Üzerinden Veri Sızdırma / İstek Yönlendirme

- **Etkilenen Dosyalar ve Semboller:**
  - [`BackendApiService.normalizeBaseUrl`](js/services/BackendApiService.js#L49-L57) ve [`BackendApiService.resolveInitialUrl`](js/services/BackendApiService.js#L60-L72)
  - [`MarsNavigatorController.init`](js/components/MarsNavigatorController.js#L100-L103) ve durum güncellemeleri ([L668](js/components/MarsNavigatorController.js#L668), [L698](js/components/MarsNavigatorController.js#L698), [L747](js/components/MarsNavigatorController.js#L747))
  - [`RouteInspectorPanel.render`](js/components/RouteInspectorPanel.js#L36-L167) ([L40](js/components/RouteInspectorPanel.js#L40), [L50](js/components/RouteInspectorPanel.js#L50), [L55](js/components/RouteInspectorPanel.js#L55), [L59](js/components/RouteInspectorPanel.js#L59), [L123](js/components/RouteInspectorPanel.js#L123), [L133](js/components/RouteInspectorPanel.js#L133), [L160-L163](js/components/RouteInspectorPanel.js#L160-L163))
  - [`SettingsPanel.render`](js/components/SettingsPanel.js#L138-L147)
- **Kök Neden:**
  - `resolveInitialUrl`, URL sorgu dizesindeki `?api=` parametresini okuyarak `state.backendApiUrl` alanına atar. `normalizeBaseUrl` yalnızca `http://`, `https://` veya `/` başlangıcını kontrol eder; protokol-göreli (`//...`) adresleri ve üçüncü taraf dış alan adlarını (origin allowlist olmadan) geçerli kabul eder.
  - `RouteInspectorPanel.render`, kullanıcı URL'sinden veya harici backend yanıtından beslenebilen `endpointUrl`, `JSON.stringify(reqPreviewObj, null, 2)` (`<pre>` bloğu içinde), `uiMeta.backendStatusText`, `landingSites[].name`, `steps[].instruction`, `steps[].hazardWarning`, `pri.comment`, `sec.comment`, `activeOrigin.name` ve `activeDest.name` verilerini herhangi bir HTML kaçışı (escaping) uygulamadan doğrudan `innerHTML` içerisine yazar.
  - `SettingsPanel.render` satır `L138` içinde `state.backendApiUrl` değerinde yalnızca çift tırnağı (`replace(/"/g, "&quot;")`) temizler (`&`, `<`, `>` karakterleri kaçırılmaz); satır `L147` ise hata mesajlarını ve backend yanıtından gelen `data.engine`/`data.version` alanlarını içeren `backendStatus` değerini doğrudan `innerHTML` olarak basar.
- **Güvenlik Riski:** Dış kaynaklı bir `?api=` parametresi veya güvenilmeyen bir sunucu yanıtı, istemci tarayıcısında istenmeyen HTML/JavaScript çalıştırılmasına (Reflected/Stored DOM XSS) ve koordinat/görev telemetrisinin üçüncü taraf sunuculara gönderilmesine yol açabilir.
- **Savunma Amaçlı Çözüm:**
  - Panel ve etiket içeriklerini `innerHTML` şablonları yerine `document.createElement` + `.textContent` kullanarak oluşturun veya her dinamik alana eksiksiz HTML karakter kaçışı uygulayın.
  - `normalizeBaseUrl` içinde `new URL(..., window.location.origin)` doğrulaması uygulayın; protokol-göreli (`//`) biçimleri reddedin ve yalnızca izin verilen yerel/resmi origin listesine (allowlist) müsaade edin.

---

### 2. [KRİTİK] Sohbet API ve Dosya Yükleme Güvenlik Zafiyetleri

- **Etkilenen Dosyalar ve Semboller:**
  - [`api/chat.php`](api/chat.php#L20-L254) ([L20-L29](api/chat.php#L20-L29), [L66-L70](api/chat.php#L66-L70), [L73](api/chat.php#L73), [L80](api/chat.php#L80), [L109](api/chat.php#L109), [L151-L153](api/chat.php#L151-L153), [L212](api/chat.php#L212), [L220-L237](api/chat.php#L220-L237))
  - [`chat/index.html`](chat/index.html#L478-L496) ([L479](chat/index.html#L479), [L488](chat/index.html#L488), [L495](chat/index.html#L495))
  - [`ResourceItem.js`](js/models/ResourceItem.js#L22-L42)
- **Kök Nedenler:**
  1. **Kimlik Doğrulama / CSRF Yokluğu ve GET ile Mutasyon (`api/chat.php` L73, L109, L151-L153):** `$action` değeri hem `$_GET` hem `$_POST` üzerinden okunduğu için `send_message` gibi yazma işlemleri GET isteğiyle dahi çalışabilir. Oturum, kimlik doğrulama veya CSRF jetonu bulunmaz; `user_name` ve `role` doğrudan istemci girdisinden alınarak mürettebat üyeleri (`Atahan`, `Akif` vb.) taklit edilebilir.
  2. **Ölü (Kontrol Edilmeyen) MIME Doğrulaması (`api/chat.php` L220-L229):** `finfo_file` ile `$detectedMime` tespit edilir ve `$allowedMimes` listesi tanımlanır (listede genel `'application/octet-stream'` türü de yer alır), ancak **`in_array($detectedMime, $allowedMimes, true)` kontrolü hiç uygulanmaz**.
  3. **Atlatılabilir İçerik Taraması ve Eksik Uzantı Engeli (`api/chat.php` L212, L232-L237):** Betik taraması yalnızca ilk 512 baytta temel alt dizeleri arar; 512. bayttan sonraki sunucu/istemci betik blokları veya alternatif etiketler taranmaz. Çift uzantı regex kontrolü (`L212`) `.php5`, `.php7`, `.php8`, `.pht`, `.shtml`, `.inc`, `.htaccess` gibi web sunucusunda yorumlanabilecek uzantıları kapsamaz.
  4. **Sahtelenebilir İstemci IP Başlığı (`api/chat.php` L66-L70):** Güvenilir vekil (trusted proxy) IP doğrulaması olmadan `HTTP_CF_CONNECTING_IP` ve `HTTP_X_FORWARDED_FOR` başlıkları `REMOTE_ADDR` önüne yerleştirilmiştir; sahte istek başlıklarıyla hız sınırı aşılabilir ve veritabanına sahte IP kaydedilebilir.
  5. **SQLite Negatif `LIMIT` DoS (`api/chat.php` L80):** `min((int)$_GET['limit'], 100)` alt sınır (`max(1, ...)`) içermez. SQLite'ta negatif `LIMIT` satır sınırını devre dışı bıraktığı için tek istekte tüm `messages` tablosu çekilebilir.
  6. **Web Kökünde Hassas Dizin (`api/chat.php` L20-L29):** IP adreslerini içeren `storage/chat.db` ve `uploads/` doğrudan web kök dizini (`$baseDir`) altında tutulur; koruma yalnızca harici web sunucu yapılandırmasına bırakılmıştır.
  7. **Etkisiz URL Temizleme ve Reverse Tabnabbing (`chat/index.html` L478-L496, `ResourceItem.js` L22-L28, L42):** `msg.file_url.replace(/^\.\//, "./")` şema doğrulaması yapmaz; `window.open(..., "_blank")` ve `<a target="_blank">` üzerinde `noopener,noreferrer` eksiktir. `ResourceItem.js` içindeki `escapeHtml` ise `<a href="...">` özniteliği için `http:`/`https:` protokol doğrulaması uygulamaz.
- **Savunma Amaçlı Çözüm:**
  - Yazma eylemlerini yalnızca `POST` metoduna kısıtlayın, oturum/CSRF doğrulaması ekleyin ve `user_name`/`role` bilgilerini sunucu oturumundan okuyun.
  - Yüklenen dosyalar için sıkı `$allowedMimes` listesi (genel `application/octet-stream` hariç) üzerinden `in_array($detectedMime, $allowedMimes, true)` zorunluluğu getirin; `storage/` ve `uploads/` dizinlerini web kökü dışına taşıyıp dosyaları güvenli bir indirme betiği (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`) aracılığıyla sunun.
  - İstemci IP tespitinde yalnızca `REMOTE_ADDR` kullanın (ters vekil varsa yalnızca bilinen vekil IP aralığı arkasından başlık okuyun).
  - `$limit = max(1, min((int)$_GET['limit'], 100));` ile alt sınır uygulayın; tüm `http`/`https`/göreli URL'leri şema doğrulamasından geçirin ve dış bağlantılara `rel="noopener noreferrer"` ekleyin.

---

### 3. [YÜKSEK] Root `sudoers` Yetki Genişlemesi, Süreç Listesinde Token İfşası ve Altyapı Sızıntıları

- **Etkilenen Dosyalar ve Satırlar:**
  - [`tools/server/install_autodeploy.sh`](tools/server/install_autodeploy.sh#L16-L68) ([L16-L20](tools/server/install_autodeploy.sh#L16-L20), [L68](tools/server/install_autodeploy.sh#L68))
  - [`api/github_webhook.php`](api/github_webhook.php#L31-L86) ([L31](api/github_webhook.php#L31), [L79-L86](api/github_webhook.php#L79-L86))
  - [`tools/server/deploy_web_sync.sh`](tools/server/deploy_web_sync.sh#L48-L90) ([L48-L49](tools/server/deploy_web_sync.sh#L48-L49), [L90](tools/server/deploy_web_sync.sh#L90))
  - [`tools/launch-linux.sh`](tools/launch-linux.sh#L38)
  - [`tools/server/README.md`](tools/server/README.md#L33-L34)
  - [`.github/workflows/deploy-mars-web.yml`](.github/workflows/deploy-mars-web.yml#L103-L106)
- **Kök Nedenler:**
  - `install_autodeploy.sh` (`L68`), `/etc/sudoers.d/mars-autodeploy` dosyasına `www-data ALL=(root) NOPASSWD: /usr/local/bin/mars-web-sync` kuralını yazar. Web sunucusu/PHP kullanıcısının ele geçirilmesi doğrudan `root` yetkisiyle çalışan dağıtım betiğinin tetiklenmesine kapı açar.
  - `github_webhook.php` (`L31`) `php://input` akışını boyut sınırı olmadan okur; `L80` içinde `@exec('nohup sudo -n ... &')` hata kontrolü yapmadan `triggered: true` döner ve `L86` hata durumunda iç sunucu ikili dosya yolunu (`/usr/local/bin/mars-web-sync`) HTTP 500 yanıtıyla dışarıya verir.
  - `deploy_web_sync.sh` (`L48-L49`) Base64 kodlanmış `GITHUB_TOKEN` değerini `git -c "http.extraheader=..."` argümanı olarak geçirir; `install_autodeploy.sh` (`L16-L20`) `--github-token` ve `--webhook-secret` değerlerini CLI parametresi olarak kabul eder. Her iki yöntem de gizli anahtarları makinedeki `ps` süreç listesinde ve kabuk geçmişinde görünür kılar.
  - `deploy_web_sync.sh` (`L90`) `$STAGE_DIR` değişkenini, `launch-linux.sh` (`L38`) ise `$PORT` ve `$APP_DIR` değişkenlerini doğrudan `python3 -c "..."` kod dizesinin içine yerleştirir (kabuk/Python string enjeksiyonu riski).
  - `tools/server/README.md` (`L33-L34`) üretim sunucusunun IP adresini (`93.177.102.37`), SSH kullanıcısını (`root`) ve hedef web yolunu (`/var/www/mars`) açık metin olarak depolar.
  - `.github/workflows/deploy-mars-web.yml` (`L103-L106`) `ssh-keyscan` + `StrictHostKeyChecking=accept-new` ile anahtar parmak izi doğrulamadan ilk bağlantıyı kabul eder (MITM riski).
- **Savunma Amaçlı Çözüm:** Dağıtım işini `root` yerine yalnızca web dizinine yazabilen ayrık bir servis kullanıcısıyla ve systemd unit/tetikleme kuyruğu üzerinden yürütün. Git kimlik bilgilerini CLI argümanı yerine `GIT_ASKPASS` veya korumalı credential dosyası üzerinden geçirin; `python3 -c` içine kabuk değişkeni enjekte etmek yerine `sys.argv`/ortam değişkeni okuyun. Sunucu IP/kullanıcı bilgilerini dokümandan kaldırın ve CI iş akışında sabit `SSH_KNOWN_HOSTS` sırrı kullanın.

---

### 4. [ORTA] Yerel Sunucu Araçlarında LAN Yayını (`0.0.0.0`), CORS `*` ve Sınırsız Bellek Tüketimi

- **Etkilenen Dosyalar ve Satırlar:**
  - [`tools/WinLauncher.cs`](tools/WinLauncher.cs#L86-L280) ([L86](tools/WinLauncher.cs#L86), [L147-L156](tools/WinLauncher.cs#L147-L156), [L247](tools/WinLauncher.cs#L247), [L280](tools/WinLauncher.cs#L280))
  - [`serve.ps1`](serve.ps1#L84-L246) ([L84](serve.ps1#L84), [L137-L145](serve.ps1#L137-L145), [L216](serve.ps1#L216), [L246](serve.ps1#L246))
- **Kök Neden:** Sunucular varsayılan olarak tüm ağ arayüzlerinde (`0.0.0.0` / `IPAddress.Any`) dinler ve her yanıta `Access-Control-Allow-Origin: *` ekler. İstek ve HTTP başlıklarını okurken boyut sınırı olmadan `reader.ReadLine()` çağrılır (dev bir satır veya yavaş gönderim ile bellek tüketimi/Slowloris riski) ve yanıt dosyaları `File.ReadAllBytes()` ile bir kerede belleğe alınır.
- **Savunma Amaçlı Çözüm:** Varsayılan dinleme adresini `127.0.0.1` (`IPAddress.Loopback`) yapın, başlık uzunluğu/satır sayısı için üst sınır ve ağ okuma zaman aşımı belirleyin, dosyaları akış (streaming) ile gönderin.

---

### 5. [ORTA] Rust/WASM Harita Boyutu ve Eğim Hesaplarında Tamsayı Taşması Riski

- **Etkilenen Dosya ve Semboller:** [`MarsMap::from_flat`](backend/src/lib.rs#L24-L36) ve [`MarsMap::find_path`](backend/src/lib.rs#L63-L106) ([L63](backend/src/lib.rs#L63), [L76](backend/src/lib.rs#L76), [L78](backend/src/lib.rs#L78), [L106](backend/src/lib.rs#L106))
- **Kök Neden:** `from_flat`, `i32` türündeki `width` ve `height` parametrelerini `<= 0` kontrolü veya taşma kontrollü çarpım olmadan doğrudan `as usize` ile dönüştürür; negatif değerler dev `usize` boyutlarına sarılarak paniğe veya bellek hatasına yol açabilir. `find_path` içinde `new_z - current.z`, `slope_diff * 5`, `slope_diff.abs()` ve `p.x.abs_diff(goal.0) + p.y.abs_diff(goal.1)` işlemleri aşırı girdi değerlerinde debug derlemelerde panik, release derlemelerde ise sarma (wrap-around) üretebilir.
- **Savunma Amaçlı Çözüm:** `usize::try_from` ve `checked_mul` ile boyut doğrulaması yapın (`heights.len() == w * h` şartını denetleyin); maliyet hesaplamalarında `saturating_*` veya `i64` kullanın.

---

## Bölüm 2: Sıkıntılı Kodlar (Çalışma Zamanı Hataları, Kırık Özellikler ve Mimari Tutarsızlıklar)

### 1. [KRİTİK ÇÖKME] Dil Değiştirme Fonksiyonu `TypeError` Fırlatıyor

- **Etkilenen Kodlar:** [`MarsNavigatorController.changeLanguage`](js/components/MarsNavigatorController.js#L141) -> [`I18nService.getSupportedLanguages`](js/services/I18nService.js#L37)
- **Sorun:** `changeLanguage` metodu `this.i18n.getLanguages().find(...)` çağrısı yapar; ancak `I18nService` sınıfında bu isimde bir metot yoktur (`getSupportedLanguages()` tanımlıdır).
- **Sonuç:** Kullanıcı arayüzden dil değiştirdiği anda `Uncaught TypeError: this.i18n.getLanguages is not a function` hatası fırlatılır ve dil değişikliği bildirim aşamasında yarıda kesilir.

---

### 2. [KRİTİK KIRIK ÖZELLİK] Bağımsız Sohbet Modülü (`/chat/`) Kırık Yol, Yarış Koşulu ve Bozuk HTML/Kota Mantığı

- **Etkilenen Dosyalar:** [`chat/index.html`](chat/index.html#L314-L503), [`api/chat.php`](api/chat.php#L113-L254)
- **Sorunlar:**
  1. **404 API ve Dosya Yolu:** `chat/index.html` [L314](chat/index.html#L314) `this.apiEndpoint = "./api/chat.php"` tanımlar; `/chat/` altında bu adres `/chat/api/chat.php` olarak çözümlenir ve **404** verir (`../api/chat.php` olmalıdır). [L406](chat/index.html#L406)'daki boş `catch (err) {}` hatayı yuttuğu için ekranda `"Mesajlar yükleniyor..."` metni takılı kalır. Ayrıca `api/chat.php` [L253](api/chat.php#L253) veritabanına `./uploads/...` yazar; `/chat/` sayfası bunu `/chat/uploads/...` şeklinde çözüp kırık link üretir.
  2. **Çift HTML Kaçışı (Double Escaping):** `api/chat.php` ([L167-L169, L254](api/chat.php#L167-L169)) girdiyi veritabanına kaydetmeden önce `htmlspecialchars()` ile kodlar; `chat/index.html` ([L456, L459, L474, L503](chat/index.html#L456)) ise DOM'a `.textContent` ile yazar. Sonuç olarak kullanıcı ekranında `&amp;`, `&#039;`, `&quot;` karakter dizileri görünür.
  3. **Polling Yarış Koşulu:** `chat/index.html` ([L380, L383-L407, L432](chat/index.html#L380)) 3 saniyelik `setInterval` taraması ile mesaj gönderimi sonrası `fetchMessages()` çağrısı arasında devam eden istek kilidi veya mesaj ID tekilleştirmesi yapmadığı için aynı mesaj ekranda mükerrer belirebilir.
  4. **Hatalı Hız Sınırı ve Yükleme Kotası (`api/chat.php` L113-L148):** Yeni bir IP'nin eşzamanlı ilk istekleri `INSERT` sırasında `PRIMARY KEY` yarışına düşüp HTTP 500 üretebilir; [L146](api/chat.php#L146) dosya içermeyen metin mesajlarında dahi `upload_count = 1` yazar; [L130, L137](api/chat.php#L130) dosya yükleme doğrulamalarından (`L181-L237`) **önce** yükleme sayacını artırarak reddedilen denemelerde kotayı tüketir; [L118](api/chat.php#L118) yorumunda "0.5 saniye" yazarken tam sayı `time()` farkı (`< 1`) 1 saniyeye kadar istekleri bloke eder.

---

### 3. [KRİTİK EKSİK / MİMARİ ÇELİŞKİ] HTTP Rust Backend Yokluğu, WASM Kısa Devresi, Ölü Yedek Motor ve Matematik Hataları

- **Etkilenen Dosyalar:** [`backend/Cargo.toml`](backend/Cargo.toml), [`backend/src/main.rs`](backend/src/main.rs), [`BackendApiService.js`](js/services/BackendApiService.js#L20-L398), [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L256-L701), [`RoutePlannerService.js`](js/services/RoutePlannerService.js), [`DatasetLoader.js`](js/services/DatasetLoader.js), [`HazardFieldService.js`](js/services/HazardFieldService.js#L27)
- **Sorunlar:**
  1. **Var Olmayan HTTP Backend Sunucusu:** [`readme.md`](readme.md#L41-L61), [`BACKEND_API.md`](BACKEND_API.md), [`AppConfig.js`](js/models/AppConfig.js#L46) ve [`RouteInspectorPanel.js`](js/components/RouteInspectorPanel.js#L59) `/api/v1/health`, `/api/v1/hazards` ve `/api/v1/route` HTTP uç noktalarını belgeler; ancak `backend/Cargo.toml` yalnızca `pathfinding` ve opsiyonel `wasm-bindgen` bağımlılığı içerir, `backend/src/main.rs` ise yalnızca konsola statik örnek basar — **HTTP sunucusu mevcut değildir**.
  2. **WASM Kısa Devresi ve `file://` Kırılması:** HTTP(S) altında `BackendApiService.ensureWasmLoaded()` ([L20-L46](js/services/BackendApiService.js#L20-L46)) yüklendiğinde `testConnection()` ([L77-L89](js/services/BackendApiService.js#L77-L89)) ve `requestStepRoute()` ([L187-L190](js/services/BackendApiService.js#L187-L190)) harici `backendApiUrl` ayarını yok sayarak daima yerel WASM'a kısa devre yapar. [`startBackendLatencyMonitor`](js/components/MarsNavigatorController.js#L688-L701) de ağ gecikmesi yerine yerel WASM çağrı süresini (`~1 ms`) ölçer. Buna karşılık uygulama `file://` ile açıldığında WASM ES modülü `import()` CORS nedeniyle engellenir ve `127.0.0.1:8080` çalışmadığı için rota ve tehlike alanları tamamen boş (`backendRoutes = null`, `backendHazards = null`) kalır.
  3. **Ölü Kod Haline Gelmiş Servisler ve Tutarsız Veri:** `MarsNavigatorController.computeActiveRoutes()` ([L256](js/components/MarsNavigatorController.js#L256)) yalnızca `this.backendRoutes` döndürdüğü için `RoutePlannerService` içindeki `computeGlobalRoutes`, `computeRoutesBetweenCoords` ve `computeCraterRoutes` metotlarının sıfır çağırıcısı vardır. Aynı şekilde `DatasetLoader.getGeologyData()`, `DatasetLoader.getCuriosityRoute()` ve `HazardFieldService.worldviewHazards` (`setWorldviewData` `L27`'de saklar ama `getGlobalHazardZones` hiç okumaz) atıl kalmıştır; `HazardFieldService.js` içindeki sabit koordinatlar [`nasa_worldview_and_hazards.json`](data/datasets/nasa_worldview_and_hazards.json) ile birebir uyuşmaz (ör. `storm-hellas`: `-42.4, 70.5` vs `-42.7, 70.0`; `325`/`270` derece gösterimi).
  4. **Antimeridyen, Sahte Topografi ve Güvenliksiz A* Geri Düşüşü (`BackendApiService.js` L218-L398):**
     - `dLon = dest.lon - orig.lon` ([L232, L325](js/services/BackendApiService.js#L232)) `[-180, 180]` sarmalaması yapmaz; Gale Krateri (`137.44°`) -> Olympus Mons (`-133.8°`) rotasında `+88.8°` yerine `dLon = -271.24°` ile ters yarımküreden yol çizer.
     - [L249](js/services/BackendApiService.js#L249) `Math.hypot(lat - z.lat, lon - z.lon)` boylam sarma ve `cos(lat)` düzeltmesi yapmaz; [L336](js/services/BackendApiService.js#L336) çıktı `lon` değerini normalize etmez.
     - [L265-L266, L355](js/services/BackendApiService.js#L265-L266) `ns.marsTopo` gerçek topografiyi kullanmak yerine `Math.sin`/`Math.cos` dalgalı yapay ızgara (`0..10`) ve `-2400 + cur.elevLevel * 185` üretir; [L256](js/services/BackendApiService.js#L256) sabit statik engeller enjekte eder.
     - [L277-L281](js/services/BackendApiService.js#L277-L281) birincil A* başarısız olduğunda `buildGrid(0.0)` ile ikinci denemeye düşerek **tüm asit, fırtına ve radyasyon engellerini sessizce kaldırır**.

---

### 4. [KRİTİK / YÜKSEK] 12 Eksik i18n Anahtarı, Almanca Yazım Hatası, Fabrika Sıfırlama ve DOM Seçici Hataları

- **Tüm 9 Dil Sözlüğünde Eksik 12 i18n Anahtarı:** [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js) içinde çağrılan aşağıdaki 12 anahtar `data/i18n/*` altında tanımlı olmadığı için ekranda ve toast bildirimlerinde ham anahtar adları basılır:
  - `backendLocalActive` ([L658](js/components/MarsNavigatorController.js#L658))
  - `backendResponded` ([L741](js/components/MarsNavigatorController.js#L741))
  - `inspBackendWaiting` ([L747, L750](js/components/MarsNavigatorController.js#L747-L750))
  - `inspLocalBadge` ([L706](js/components/MarsNavigatorController.js#L706))
  - `inspNoConnection` ([L706](js/components/MarsNavigatorController.js#L706))
  - `pickedDestName` ([L481](js/components/MarsNavigatorController.js#L481))
  - `telemetryLoading` ([L313](js/components/MarsNavigatorController.js#L313))
  - `toastBackendUrlCleared` ([L662](js/components/MarsNavigatorController.js#L662))
  - `toastClickMarsSurface` ([L477](js/components/MarsNavigatorController.js#L477))
  - `toastDestPicked` ([L485](js/components/MarsNavigatorController.js#L485))
  - `toastPickDestinationHint` ([L647](js/components/MarsNavigatorController.js#L647))
  - `zoomResetTitle` ([L310](js/components/MarsNavigatorController.js#L310))
- **Almanca Çeviri Hatası:** [`data/i18n/localesTrEnDe.js`](data/i18n/localesTrEnDe.js#L461) satırında `warnHazardDetour: "ichere Umleitung um {name}"` (`Sichere` eksik `S` harfi).
- **Eksik Fabrika Sıfırlaması:** [`MarsNavigatorController.performFactoryReset`](js/components/MarsNavigatorController.js#L193-L211) `backendRoutes = null; backendHazards = null;` yapıp `refreshAll()` çağırır fakat `refreshBackendHazardsAndRoute()` tetiklemez; kullanıcı yeniden hesapla butonuna basana dek harita rotasız/tehlikesiz kalır. Ayrıca [`AppConfig.getFactoryDefaults`](js/models/AppConfig.js#L24-L67) `camPitch`, `camYaw`, `topoReliefScale` ve `enable3DTerrain` alanlarını içermediğinden 3B kamera eğimi sıfırlanmaz.
- **Var Olmayan DOM Öğesi:** [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L709) HTML içinde bulunmayan `#insp-latency-pill-card` öğesini sorgular.

---

### 5. [YÜKSEK] 3B/2B Ters-Projeksiyon Uyuşmazlığı, Ölü MOLA Senkronizasyonu ve Çizim/UX Tutarsızlıkları

- **3B Tıklama (Picking) Parametre Kaybı (`MarsNavigatorController.js` L619-L623 -> `RouteGeometryHelper.js` L137-L158):** Kontrolcü `(camPitch, camYaw, relief)` dahil 10 argüman iletirken [`screenToMarsCoords3D`](js/services/RouteGeometryHelper.js#L137-L158) yalnızca ilk 7 parametreyi kabul eder; pitch, yaw ve yükseklik kabartmasını dikkate almaz, yakınlaştırmayı `80.0` yerine `3.2` ile sınırlar ve `sphereCy` yerine `height / 2` kullanır. Eğik/yakınlaştırılmış 3B kürede tıklanan nokta gerçek konumla uyuşmaz.
- **Kullanılmayan MOLA Karo Senkronizasyonu ve Hue Boşluğu (`MarsTopographyService.js`):** [`syncWithMolaTiles`](js/services/MarsTopographyService.js#L174) ve [`buildCameraBasis`](js/services/MarsTopographyService.js#L390) hiçbir yerden çağrılmaz (gerçek MOLA PNG karoları `elevGrid` ile hiç birleştirilmez). [`decodeMolaPixelMeters`](js/services/MarsTopographyService.js#L237-L254) `(285, 315]` hue aralığını kapsamadığından bu renk tonlarında `baseM = 0` döner. [`screenToElevatedMars3D`](js/services/MarsTopographyService.js#L470) yakınlaştırmayı `80.0` yerine `24.0` ile sınırlar ve `cy = height / 2` alır.
- **`Map3DRenderer.js` Tutarsızlıkları:** [`L126`](js/renderers/Map3DRenderer.js#L126) `highQualityGlobeRay === true` durumunda bile `exactAll = false` sabitler; [`drawFallbackShadedSphere`](js/renderers/Map3DRenderer.js#L140-L143) `zoom, camPitch, camYaw, reliefScale` geçmez ve `sphereCy` verirken içindeki `uvAt` ([L516](js/renderers/Map3DRenderer.js#L516)) `(viewW, viewH)` ile çağrı yapar; [`drawLoadingSphere`](js/renderers/Map3DRenderer.js#L85) ise `sphereCy` yerine `cy` geçirir.
- **Çelişkili 2B Maksimum Zoom ve Kontrolsüz Yüzey Seçimi:** 2B picking ([`RouteGeometryHelper.js`](js/services/RouteGeometryHelper.js#L121)) `4.5`, 2B render ([`Map2DRenderer.js`](js/renderers/Map2DRenderer.js#L39)) ve sürükleme ([`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L451)) `12.0`, tekerlek zoom ve karo yükleme ([L373, L555, L588](js/components/MarsNavigatorController.js#L373)) ise `32.0` tavanını kullanır -> `4.5x` ve `12x` üzerinde harita görünümü ile fare etkileşimi sapar. Ayrıca yüzeyde boş bir alana tıklamak (`L467-L487`) `pickMode` açık değilken bile `customDestination` atar.
- **Bozuk Krater EVA Çizimi ve Küçük Ekran Etiket Taşması:** [`Map2DRenderer.js`](js/renderers/Map2DRenderer.js#L100-L121) -> [`RouteCanvasRenderer.js`](js/renderers/RouteCanvasRenderer.js#L135-L151) `drawCraterEvaRoutes` içinde `{relX, relY}` beklerken backend `{lat, lon}` üretir (krater modu etkinleşirse `NaN` çizim oluşur); [`flyToCraterById`](js/components/MarsNavigatorController.js#L228) her zaman `routeScope = "global"` zorlar. [`RouteCanvasRenderer.js`](js/renderers/RouteCanvasRenderer.js#L60) `pBoxX = Math.min(viewW - 430, pAnchor.x + 35)` hesabı `430px` altı ekranlarda negatife düşer; yorum kutusu ekran içinde tutulsa da bağlantı çizgisi ekran dışına uzanır.

---

### 6. [ORTA-YÜKSEK] Sürekli 60Hz Boşta Render, FPS Guard Çakışması ve Panel Odak Kaybı

- **Durmayan 60Hz Döngüleri:** [`FpsGuardService.js`](js/services/FpsGuardService.js#L31-L56) ve [`StarfieldRenderer.js`](js/renderers/StarfieldRenderer.js#L58-L77) etkileşim olmadığında dahi sürekli `requestAnimationFrame` döngüsü koşturur. `updateFpsBadge` her karede DOM sorgular; `StarfieldRenderer` `this.enabled === false` olduğunda bile her karede tüm tuvali siyahla kaplar.
- **FPS Guard Tek Yuva Sorunu:** [`FpsGuardService.js`](js/services/FpsGuardService.js#L79) yalnızca tek bir `pendingGuard` yuvasına sahip olduğu için 10 saniye içinde iki ayar değişirse önceki izleme kaybolur. [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L173) `{ ...this.state }` sığ kopya aldığından iç içe durum nesneleri mutasyona açıktır; geri alma (`L174-L181`) rota yeniden hesaplamasını tetiklemez.
- **Odak ve Kaydırma Kaybı:** [`SettingsPanel.js`](js/components/SettingsPanel.js), [`RouteInspectorPanel.js`](js/components/RouteInspectorPanel.js) ve [`SatellitesPanel.js`](js/components/SatellitesPanel.js) asenkron durum güncellemelerinde kapsayıcı `innerHTML` içeriğini tamamen yeniden yazar; bu durum özellikle `#inp-backend-url` giriş kutusundaki yazma odağını ve kaydırma konumunu sıfırlar.

---

### 7. [ORTA] `MarsTileLoader.js` Önbellek / Bitişme Sınırları ve Build / Deploy Hataları

- **`MarsTileLoader.js` Kusurları:**
  - [L33](js/services/MarsTileLoader.js#L33): Ortam kontrolü olmadan `document.createElement` çağırır (SSR/Node ortamında kırılır).
  - [L178-L180](js/services/MarsTileLoader.js#L178-L180): `requested` sayacı `+=` ile biriktirilmek yerine her çağrıda ezilir.
  - [L271-L282](js/services/MarsTileLoader.js#L271-L282): `evictIfNeeded` `size >= 361` eşiğinde tahliye yaparken `manifestSets` yapısını senkronize etmez.
  - [L301, L395](js/services/MarsTileLoader.js#L301): `(y << 12) | x` bit anahtarı `x < 4096` varsayar; `z >= 11` düzeyinde `cols = 1 << (z + 1) = 4096` olduğundan anahtar çakışması yaşanır.
  - [L383-L392](js/services/MarsTileLoader.js#L383-L392): `hasAnyReadyTile` `z >= 3` kademelerini denetlemez.
- **Build, Yayın ve Başlatma Betiği Kusurları:**
  - [`tools/server/deploy_web_sync.sh`](tools/server/deploy_web_sync.sh#L57-L130): `--depth 1` sığ klonlama yapıldığı için son commit yalnızca `backend/` veya `tools/` dosyalarını değiştirdiyse `git log -n 1 -- index.html ...` boş `""` döner; `[ -n "$LATEST_WEB_SHA" ]` koşulu `.deployed_web_sha` dosyasını boş dizeyle güncelleyerek betiğin her 30 saniyede bir yeniden dağıtım tetiklemesine yol açar.
  - [`tools/build.py`](tools/build.py#L46-L120) ve [`tools/build_tool.ps1`](tools/build_tool.ps1#L54): `git diff --quiet readme.md` staged veya commit edilmiş değişiklikleri yakalamaz; son kullanıcı dağıtımına (`dist/`) iç ajan dokümantasyonu (`ForAgents/`) kopyalanırken `api/`, `chat/` ve `BACKEND_API.md` dışarıda bırakılır.
  - [`tools/launch-linux.sh`](tools/launch-linux.sh): `.wasm` dosyaları için `application/wasm` MIME eşlemesi eksiktir.
  - [`serve.ps1`](serve.ps1#L85-L86): 3000 portu meşgulse rastgele boş port (`0`) yedeği yerine doğrudan çöker.
  - [`tools/github_autodeploy.ps1`](tools/github_autodeploy.ps1#L135): `$argList` boşluk içeren dosya yolları için tırnaklanmadan birleştirilir.

---

## Bölüm 3: `readme.md` Kuralları ve Tasarım Sözleşmesi Uyumsuzluk Matrisi

| `readme.md` Kuralı / Tasarım Sözleşmesi | Tespit Edilen Uyumsuzluk | Etkilenen Konumlar |
|---|---|---|
| **Rota İnceleme Ekranı (Inspector) Sözleşmesi** | `waypoints`, `selectedWp` ve `radZones` parametreleri kullanılmıyor; Alfa/Beta/Gama radyasyon seviyeleri, foton akısı, `totalMeters`, EVA durakları ve `420L` O₂ / `24L` su rezerv açığı uyarısı gösterilmiyor. Başlangıç etiketi `"Gale (...)"` olarak sabitlenmiş. | [`RouteInspectorPanel.js`](js/components/RouteInspectorPanel.js#L36-L167) ([L96](js/components/RouteInspectorPanel.js#L96)) |
| **Renk Paleti ve Tipografi Bütünlüğü** | `chat/` ve `css/chat.css` slate renkler (`#020617`, `#0f172a`) ve harici fallback font kullanıyor. `css/chat.css` içinde tanımlı **35 sınıfın 34'ü kullanılmıyor** ve dosya hiçbir HTML'e bağlanmamış. `css/inspector.css` (`#0f172a`/`#4ade80`) ve `OverlayDrawHelper.js` (`rgba(15, 23, 42, 0.9)`) tema dışına çıkıyor. | [`css/chat.css`](css/chat.css), [`chat/index.html`](chat/index.html), [`css/inspector.css`](css/inspector.css#L175), [`OverlayDrawHelper.js`](js/renderers/OverlayDrawHelper.js#L236) |
| **Satır Altı Açıklama Kuralı (`L25`)** | **7 dosyada tamamen eksik** (`backend/src/lib.rs`, `backend/src/main.rs`, `js/wasm/backend.js`, `js/wasm/backend.d.ts`, `js/wasm/backend_bg.wasm.d.ts`, `build_wasm.sh`, `build_wasm.bat`). **38 dosyada** gerçek kod uzunluğu ile alt bilgi satır aralığı arasında 5 satırdan fazla kayma var (ör. `css/inspector.css`: 544L vs `309`; `api/chat.php`: 315L vs `270`; `data/offlineDatasets.js`: 645L vs `1-10, 634`). `tools/build.py` (`L92`) yalnızca düz metin varlığını denetliyor. | `backend/`, `js/wasm/`, `build_wasm.*`, [`tools/build.py`](tools/build.py#L92) ve 38 kaynak dosya |
| **800 Satır Modülerlik Sınırı (`L27`)** | `MarsNavigatorController.js` **795 satır** (God Object; `js/app.js` 46 satır) ve `Map3DRenderer.js` **741 satır** ile sınıra dayanmış durumda. CI iş akışı (`deploy-mars-web.yml` `L42`) `NR >= 800`, yerel build betikleri (`build.py` `L89`, `build_tool.ps1` `L33`) `> 800` kontrol ediyor ve `api/`, `chat/`, `backend/` klasörlerini atlıyor. | [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js), [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js), [`.github/workflows/deploy-mars-web.yml`](.github/workflows/deploy-mars-web.yml#L42), [`tools/build.py`](tools/build.py#L89) |
| **Dil Sayısı Referansı** | Çince (`zh`) kaldırılıp 9 dile düşülmesine karşın `css/controls.css`, `MarsNavigatorController.js`, `MissionInfoModal.js`, `RouteInspectorPanel.js`, `SatellitesPanel.js`, `SettingsPanel.js`, `AppConfig.js` ve `logs/change_log.txt` genelinde **18 satırda** hâlâ `"10 dil"` ifadesi duruyor. | 8 dosya genelinde 18 satır |
| **Sürüm ve Depo Hijyeni** | Sürüm numaraları tutarsız (`version.json`: `3.1.0`, `index.html`: `v3.3` / `?v=3.6`, `ForAgents/PROJECT_STATE.md`). Ayrıca `dist/` (**1.091 dosya / 81,81 MiB**) ve `backups/` (**344 dosya / 2,92 MiB**, içinde 6 kopya `readme_backup*.md`) Git içinde tutuluyor. | [`version.json`](version.json), [`index.html`](index.html), [`ForAgents/PROJECT_STATE.md`](ForAgents/PROJECT_STATE.md), `dist/`, `backups/` |

---

## Bölüm 4: Öncelikli İyileştirme Yol Haritası

### P0 — Acil Güvenlik ve Çökme Düzeltmeleri
1. `RouteInspectorPanel.js` ve `SettingsPanel.js` içindeki tüm dinamik `innerHTML` alanlarını `.textContent`/güvenli DOM API'lerine taşıyın; `BackendApiService.normalizeBaseUrl` için origin allowlist + şema kısıtlaması uygulayın.
2. `api/chat.php` içinde `in_array($detectedMime, $allowedMimes, true)` kontrolünü etkinleştirip `'application/octet-stream'` türünü kaldırın; POST + CSRF/oturum zorunluluğu getirin, `REMOTE_ADDR` kullanın, `$limit = max(1, ...)` ekleyin ve `storage/`/`uploads/` klasörlerini web kökü dışına alın.
3. `tools/server/install_autodeploy.sh` içindeki `www-data ALL=(root) NOPASSWD` yetkisini kaldırın; webhook işlemini ayrıcalıksız/kuyruk tabanlı modele geçirin, tokenları CLI argümanlarından ve sunucu IP/kullanıcı bilgilerini `tools/server/README.md` dosyasından çıkarın.
4. `MarsNavigatorController.changeLanguage` içindeki `getLanguages()` çağrısını `getSupportedLanguages()` ile düzeltin; `chat/index.html` API ve dosya URL'lerini `../api/chat.php` / `../uploads/...` biçimine getirin ve çift HTML kaçışını kaldırın.

### P1 — Mimari Bütünlük, Matematik ve Sözleşme Düzeltmeleri
1. HTTP Rust API sunucusu (`axum`/`actix-web` veya mevcut dokümana uygun servis) kararını netleştirin; harici `backendApiUrl` seçildiğinde WASM kısa devresini devre dışı bırakın, antimeridyen Boylam sarmalamasını ve `MarsTopographyService` (gerçek MOLA + `syncWithMolaTiles`) entegrasyonunu sağlayın.
2. Eksik **12 i18n anahtarını** tüm 9 dil dosyasına ekleyin, Almanca `warnHazardDetour` yazım hatasını düzeltin ve `RouteInspectorPanel` içine radyasyon/foton akısı/O₂-su rezerv/EVA waypoint gösterimlerini ekleyin.
3. `MarsNavigatorController` -> `RouteGeometryHelper.screenToMarsCoords3D` ve `MarsTopographyService.screenToElevatedMars3D` imza, `sphereCy`, pitch/yaw ve zoom tavanı (`2D` vs `3D`) değerlerini eşitleyin.
4. `tools/server/deploy_web_sync.sh` sığ `--depth 1` SHA kontrol hatasını düzeltin ve `performFactoryReset()` içinde backend rota/tehlike yenilemesi ile 3B kamera sıfırlamasını tamamlayın.

### P2 — Performans, Bakım Kolaylığı ve Depo Hijyeni
1. `FpsGuardService` ve `StarfieldRenderer` boşta sürekli 60Hz `rAF` döngülerini yalnızca gerektiğinde çalışacak (dirty-flag) yapıya indirin; panel güncellemelerinde tüm `innerHTML` yenilemek yerine kısmi DOM yaması kullanın.
2. `MarsNavigatorController.js` (795L) ve `Map3DRenderer.js` (741L) dosyalarını alt modüllere bölün; tüm `"10 dil"`, sürüm numarası ve satır altı açıklama bloklarını güncelleyip CI denetim kurallarıyla eşitleyin; `dist/` ve `backups/` yığınını `.gitignore` kapsamına alıp temizleyin.
