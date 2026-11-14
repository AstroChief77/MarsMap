# MarsMap Teknik Güvenlik, Kalite ve Mimari Denetim Raporu (`v3.8` / `465fdae`)

> **Denetim Kapsamı ve İlke Notu:** Bu rapor, depo içindeki hiçbir kaynak kod dosyasına veya [`readme.md`](readme.md) dosyasına **dokunulmadan, kod eklenmeden ve değiştirilmeden**, GitHub üzerindeki güncel `main` durumu (`465fdae`, `v3.8`) doğrudan incelenerek ve önceki denetim raporuyla (`26141d9`, [`backups/rapor_backup_20261114_165939.md`](backups/rapor_backup_20261114_165939.md) olarak yedeklenmiştir) karşılaştırılarak güncellenmiştir. Güvenlik bulguları yalnızca savunma, kök neden analizi ve iyileştirme amacıyla belgelenmiştir.

---

## Yönetici Özeti ve Denetim Envanteri (`26141d9` → `b4894dc` (`v3.7`) → `465fdae` (`v3.8`))

| Metrik / Kapsam | Önceki Rapor (`26141d9`) | Güncel Durum (`465fdae` / `v3.8`) | Değişim ve Kritik Not |
|---|---|---|---|
| Git ile takip edilen toplam dosya | **2.008** (raporda `2.007` not düşülmüş) | **1.664** *(rapor yedeği sonrası **1.665**)* | `v3.7`'de `+6` snapshot eklendi; `465fdae` eski `backups/` dizinini sildi (`103,77 MiB`) |
| Derleme çıktısı (`dist/`) | **1.091 dosya / 81,81 MiB** | **1.091 dosya / 82,38 MiB** | Açılmış `dist/` içine `v3.8` kopyalanmış; `.tar.gz`/`.zip` ve `SHA256SUMS.txt` hâlâ `v3.6` (`9fb4063`) |
| Yedekler (`backups/`) | **344 dosya / 2,92 MiB** | **0 dosya** *(yeni rapor yedeğiyle **1 dosya / 36.397 bayt**)* | `465fdae` ile eski anlık görüntüler ve 6 kopya `readme_backup*.md` temizlendi |
| Yerel karo envanteri ([`manifest.json`](data/tiles/manifest.json) vs disk) | 465 karo uyumlu | **10.248** kayıtlı vs **465** dosya (**9.783 eksik!**) | **KRİTİK ENGEL:** CI kırılır; `v3.8` `z=3`'ü `0.92`/`0.95` zoom'da açtığı için ilk yüklemeden WMTS'yi kilitler |
| `800` satır modülerlik sınırı (`< 800`) | Sınır aşılmamıştı (`794` `awk NR` / `795` satır) | **1 dosya sınırı aşıyor:** [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js) (**829** `awk NR` / **830** satır) | **KRİTİK ENGEL (`v3.7` `849` → `v3.8` `829`):** CI, `build.py` ve `build_tool.ps1` başarısız olur; [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js) `796/797` satıra büyüdü |
| Eksik i18n anahtarı | **12 benzersiz anahtar** | **12 benzersiz anahtar** (`13` çağrı noktası) | 9 sözlüğün tamamında (her biri `158` anahtar) eksik |
| Alt bilgi (`DOSYA SATIR...`) uyumu (`66` dosya) | `7` eksik, `38` kaymış | **7 eksik, 1 açık uçlu (`Satir 1+`), 35 kaymış (`>5`), 23 uyumlu (`<=5`)** | En büyük farklar: `css/inspector.css` (`+224`), `css/chat.css` (`+78`), `MarsTileLoader.js` (`+78`), `BackendApiService.js` (`+76`), `Map3DRenderer.js` (`+66`) |
| Eski `"10 dil"` referansı | **18 satır / 8 dosya** | **18 satır / 8 dosya** | Çince (`zh`) çıkarıldığı halde doküman/JSDoc içinde duruyor |

**Genel Değerlendirme:**
1. **`v3.7` (`b4894dc`) ve `v3.8` (`dfb10fd` → `465fdae`) Evrimi:** [`MarsTileLoader.js`](js/services/MarsTileLoader.js) sayaç (`requested +=`) ve `z <= 2` LRU koruma hataları, 2B zoom (`32.0`) tutarsızlıklarının bir kısmı, [`StarfieldRenderer.js`](js/renderers/StarfieldRenderer.js) offscreen önbellekleme, FPS rozeti DOM optimizasyonu, `Map3DRenderer.js` içinde [`sampleTopoBilinear`](js/renderers/Map3DRenderer.js#L268-L289) MOLA DEM enterpolasyonu ile etkileşimde 4-tap bilineer/Hermite doku süzmesi iyileştirilmiş ve `465fdae` ile `350` dosyalık eski `backups/` yığını depodan temizlenmiştir. Buna karşılık **iki CI/derleme kırıcı engelleyici sürmektedir** ([`Map3DRenderer.js`](js/renderers/Map3DRenderer.js) `829` `awk NR` / `830` satır ile `< 800` sınırını hâlâ aşmakta; [`data/tiles/manifest.json`](data/tiles/manifest.json) diskte olmayan **9.783** karoyu listelemektedir). Ayrıca `v3.8` sürükleme/yakınlaştırma sırasındaki agresif kuyruk temizliği, [`MarsTileLoader.js`](js/services/MarsTileLoader.js#L229) içindeki **yetim `"queued"` önbellek zehirlenmesini** ve erken `z=3` tetiklemesi yoluyla `404`/`error` WMTS kilidini daha da hızlandırmıştır.
2. **Güvenlik ve Temel İşlevsellik:** İstemci tarafı `innerHTML` DOM XSS + `?api=` yönlendirmesi, `api/chat.php` kimlik/CSRF yokluğu ve ölü MIME kontrolü, `www-data -> root` `NOPASSWD` sudoers riski, dil değiştirme çökmesi (`getLanguages`), `/chat/` 404 + çift kaçış hatası ve HTTP Rust backend eksikliği önceki rapordan (`26141d9`) bu yana **değişmeden devam etmektedir**.

---

## Önceki Rapor (`26141d9`) ile Karşılaştırma: Giderilen Bulgular vs Süren/Yeni Regresyonlar (`v3.7` → `v3.8`)

### A. Giderilen veya İyileştirilen Bulgular
1. **`MarsTileLoader.js` İstek Sayacı, LRU `z<=2` Koruması ve `v3.8` Eager Zoom ([`MarsTileLoader.js`](js/services/MarsTileLoader.js#L29-L353)):** Önceki rapordaki `requested` değişkeninin üzerine yazılma hatası `requested += ...` ([L210-L212](js/services/MarsTileLoader.js#L210-L212), [L232](js/services/MarsTileLoader.js#L232)) ile düzeltilmiştir. LRU kapasitesi `361` → `1400` (`v3.7`) → `1500` ([L29](js/services/MarsTileLoader.js#L29)), eşzamanlı yükleme `10` ([L30](js/services/MarsTileLoader.js#L30)) yapılmış; [`evictIfNeeded`](js/services/MarsTileLoader.js#L342-L353) yalnızca `rec.z >= 3` karolarını tahliye ederken `this.fastGrid` tablosunu da eşzamanlı silmektedir. `v3.8` (`dfb10fd`) ile tekerlek yakınlaştırma (`isZooming`) sırasında kuyruk bekletmesi kaldırılmış ([L220-L227](js/services/MarsTileLoader.js#L220-L227)), `pumpLoadQueue()` içindeki `isInteracting` engeli kaldırılmış ([L397-L403](js/services/MarsTileLoader.js#L397-L403)) ve kare başına piksel çözme bütçesi `2` / `6` karoya çıkarılmıştır ([L466](js/services/MarsTileLoader.js#L466)).
2. **`Map3DRenderer.js` `v3.8` Bilineer MOLA & Hermite Doku Süzmesi ([`Map3DRenderer.js`](js/renderers/Map3DRenderer.js#L118-L299)):** `1024x512` MOLA yükseklik/eğim ızgarası nearest-neighbor yerine [`sampleTopoBilinear`](js/renderers/Map3DRenderer.js#L268-L289) 4-tap bilineer okuma ile pürüzsüzleştirilmiştir. Etkileşim sırasındaki 1-tap `fastMode` dalları kaldırılarak `zoom > 3.2` için Hermite eğrisi (`dx * dx * (3 - 2 * dx)`) eklenmiş ([L263](js/renderers/Map3DRenderer.js#L263), [L332](js/renderers/Map3DRenderer.js#L332), [L509](js/renderers/Map3DRenderer.js#L509)), ara tampon çözünürlüğü yükseltilmiş (`260k` / `920k` / `1.65M` piksel, [L119-L123](js/renderers/Map3DRenderer.js#L119-L123)) ve `imageSmoothingQuality = "high"` sabitlenmiştir.
3. **2B Çizim/Tekerlek Yakınlaştırma Tavanı Eşitlemesi:** [`Map2DRenderer.js`](js/renderers/Map2DRenderer.js#L39) (`12.0` -> `32.0`, [L146](js/renderers/Map2DRenderer.js#L146) `"high"` süzme) ve [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L383) sürükleme/render sınırları ([L468](js/components/MarsNavigatorController.js#L468), [L575](js/components/MarsNavigatorController.js#L575), [L602](js/components/MarsNavigatorController.js#L602)) `32.0` üzerinde hizalanmıştır *(not: [`RouteGeometryHelper.screenToMarsCoords2D`](js/services/RouteGeometryHelper.js#L121) hâlâ `4.5` ile sınırlıdır)*.
4. **`StarfieldRenderer.js` ve FPS Rozeti Optimizasyonu:** Sabit yıldızlar `baseCanvas` önbelleğine pişirilmiş ([L80-L92](js/renderers/StarfieldRenderer.js#L80-L92)); [`MarsNavigatorController.updateFpsBadge`](js/components/MarsNavigatorController.js#L347-L354) `fps === this.lastFpsVal` kirli kontrolü ve `.textContent` ile gereksiz DOM akışını kaldırmıştır *(boşta `60Hz rAF` döngüsü her iki sınıfta da sürmektedir)*.
5. **`drawFallbackShadedSphere` İletimi & Eski Yedek Temizliği (`465fdae`):** [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js#L160-L163) yedek küreye artık tüm kamera/relief parametrelerini iletir; `465fdae` ise önceki raporda eleştirilen `350` dosyalık eski `backups/` yığınını temizlemiştir (`2.008` -> `1.664` dosya).

### B. `v3.7` / `v3.8` (`465fdae`) İle Süren Kritik CI Engelleyicileri ve Regresyonlar
1. **[KRİTİK CI ENGELLEYİCİSİ] `Map3DRenderer.js` Hâlâ 800 Satırın Üzerinde (`829` `awk NR` / `830` Satır):** `v3.7`'de `849` `awk NR`'a çıkan dosya `v3.8`'de `829` `awk NR` (**830** satır) seviyesine inse de CI (`NR >= 800`), `build.py` (`> 800`) ve `build_tool.ps1` (`> 800`) hâlâ hata verip durur. [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js) ise `v3.8` ile `794` → **`796` `awk NR` (`797` satır)** olmuş ve eşiğe `4` satır kalmıştır.
2. **[KRİTİK CI + ÇALIŞMA ZAMANI ENGELLEYİCİSİ] `manifest.json` 9.783 Eksik Karo & `v3.8` Erken `z=3` Tetiklemesi:** [`manifest.json`](data/tiles/manifest.json) **10.248** karo listelerken diskte yalnız **465** karo vardır (`9.783` eksik). Üstelik `v3.8` [`computeTargetZoom`](js/services/MarsTileLoader.js#L171-L185) içinde `z=3` eşiğini `zoom >= 0.92` (`3D`) / `0.95` (`2D`) düzeyine çektiği için varsayılan açılış ölçeğinde (`1.05x`) bile hemen eksik `z=3` karolarını `hasLocalTile === true` ile yerelden ister; `404` -> `status: "error"` yüzünden WMTS fallback'i hiç devreye giremez.
3. **[KRİTİK REGRESYON — `v3.8`'de AĞIRLAŞTI] `MarsTileLoader.js` Yetim `"queued"` Önbellek Zehirlenmesi:** `v3.7` [`requestVisibleTiles`](js/services/MarsTileLoader.js#L229) içindeki `this.loadQueue = this.loadQueue.filter((item) => item.z <= 2);` satırı kuyruktan attığı `z >= 3` kayıtlarını `tileCache` / `fastGrid` içinden silmemektedir. `v3.8` ise aynı temizliği **sürükleme sırasında da her `75 ms`'de bir** (`L220-L229`) ve tekerlek zoom'unda her adımda tetiklediği için çok daha fazla karo sonsuza kadar yetim `"queued"` durumunda kilitlenir ve ekrana dönemez.
4. **[ORTA-YÜKSEK] Senkron `z=3` `getImageData` Blokajı & Frustum Kırpması:** `v3.8` [`Map3DRenderer.resolveTilePixels`](js/renderers/Map3DRenderer.js#L294) içinde `!fastMode && rec.z <= 3` için ana iş parçacığında senkron [`extractTilePixels`](js/services/MarsTileLoader.js#L495) çalıştırır; [`MarsTileLoader.requestViewportWindow`](js/services/MarsTileLoader.js#L265) doğu yönünü `ixStart + 7` (2B) / `ixStart + 6` (3D [L311](js/services/MarsTileLoader.js#L311)) ile asimetrik keser, `camPitch`/`camYaw` okumaz ve her çözmede `decodedVersion++` iki kez artırır ([L483](js/services/MarsTileLoader.js#L483), [L503](js/services/MarsTileLoader.js#L503)).

---

## Bölüm 1: Zafiyetli Kodlar (Güvenlik Açıkları)

### 1. [KRİTİK] DOM XSS (`innerHTML` Enjeksiyonu) ve `?api=` Üzerinden Veri Sızdırma / İstek Yönlendirme

- **Etkilenen Dosyalar ve Semboller:**
  - [`BackendApiService.normalizeBaseUrl`](js/services/BackendApiService.js#L49-L57) ve [`BackendApiService.resolveInitialUrl`](js/services/BackendApiService.js#L60-L72)
  - [`MarsNavigatorController.init`](js/components/MarsNavigatorController.js#L101-L104) ve durum güncellemeleri ([L671](js/components/MarsNavigatorController.js#L671), [L701](js/components/MarsNavigatorController.js#L701), [L749](js/components/MarsNavigatorController.js#L749))
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
- **Kök Neden:** Sunucular varsayılan olarak tüm ağ arayüzlerinde (`0.0.0.0` / `IPAddress.Any`) dinler ve her yanıta `Access-Control-Allow-Origin: *` ekler. İstek ve HTTP başlıklarını okurken satır uzunluğu sınırı olmadan `reader.ReadLine()` çağrılır (tek bir dev satırla bellek tüketimi/DoS riski) ve yanıt dosyaları `File.ReadAllBytes()` ile bir kerede belleğe alınır.
- **Savunma Amaçlı Çözüm:** Varsayılan dinleme adresini `127.0.0.1` (`IPAddress.Loopback`) yapın, başlık satırı uzunluğu için üst sınır belirleyin ve büyük dosyaları akış (streaming) ile gönderin.

---

### 5. [ORTA] Rust/WASM Harita Boyutu ve Eğim Hesaplarında Tamsayı Taşması Riski

- **Etkilenen Dosya ve Semboller:** [`MarsMap::from_flat`](backend/src/lib.rs#L24-L36) ve [`MarsMap::find_path`](backend/src/lib.rs#L63-L106) ([L63](backend/src/lib.rs#L63), [L76](backend/src/lib.rs#L76), [L78](backend/src/lib.rs#L78), [L106](backend/src/lib.rs#L106))
- **Kök Neden:** `from_flat`, `i32` türündeki `width` ve `height` parametrelerini `<= 0` kontrolü veya taşma kontrollü çarpım olmadan doğrudan `as usize` ile dönüştürür; negatif değerler dev `usize` boyutlarına sarılarak paniğe veya bellek hatasına yol açabilir. `find_path` içinde `new_z - current.z`, `slope_diff * 5`, `slope_diff.abs()` ve `p.x.abs_diff(goal.0) + p.y.abs_diff(goal.1)` işlemleri aşırı girdi değerlerinde debug derlemelerde panik, release derlemelerde ise sarma (wrap-around) üretebilir.
- **Savunma Amaçlı Çözüm:** `usize::try_from` ve `checked_mul` ile boyut doğrulaması yapın (`heights.len() == w * h` şartını denetleyin); maliyet hesaplamalarında `saturating_*` veya `i64` kullanın.

---

## Bölüm 2: Sıkıntılı Kodlar (CI/Derleme Engelleyicileri, Çalışma Zamanı Hataları ve Mimari Tutarsızlıklar)

### 1. [KRİTİK CI / DERLEME ENGELLEYİCİSİ] `Map3DRenderer.js` Hâlâ 800 Satır Sınırını Aşıyor (`829` `awk NR` / `830` Satır)

- **Etkilenen Dosyalar:** [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js), [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js), [`.github/workflows/deploy-mars-web.yml`](.github/workflows/deploy-mars-web.yml#L42-L47), [`tools/build.py`](tools/build.py#L88-L90), [`tools/build_tool.ps1`](tools/build_tool.ps1#L32-L35)
- **Sorun:** `v3.7` (`b4894dc`) içinde **849** `awk NR` (`850` satır) olan [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js), `v3.8` (`dfb10fd`) ile 1-tap `fastMode` dallarının kaldırılması sayesinde **829** `awk NR` (**830** satır; kod [L818](js/renderers/Map3DRenderer.js#L818) itibarıyla biter) seviyesine inse de hâlâ `800` sınırının üzerindedir. Aynı `v3.8` sürümünde [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js) ise `794` → **796** (`awk NR` / **797** satır) ile eşiğe `4` satır kalmıştır.
- **Sonuç:**
  - GitHub Actions `validate-web` işi (`deploy-mars-web.yml` `L42`: `NR >= 800`) **kesin olarak başarısız olur (`exit 1`)** ve web senkronizasyonu (`deploy-mars-web`) hiç çalışmaz.
  - Yerel paketleme betikleri ([`tools/build.py`](tools/build.py#L89) `> 800`, [`tools/build_tool.ps1`](tools/build_tool.ps1#L33) `> 800`) istisna fırlatıp durduğu için hem `v3.7` hem `v3.8` çıktıları derleme aracı kullanılmadan elle `dist/linux/` ve `dist/windows/` içine kopyalanmıştır; sonuç olarak `.tar.gz`/`.zip` arşivleri ile [`SHA256SUMS.txt`](dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt) güncellenmemiş (`v3.6` `9fb4063` zamanında kalmış) ve CRLF/LF normalizasyonuyla dahi 6 değiştirilen içerik dosyasında (`index.html`, `MarsNavigatorController.js`, `Map2DRenderer.js`, `Map3DRenderer.js`, `StarfieldRenderer.js`, `MarsTileLoader.js`) SHA-256 doğrulaması kırılmıştır.

---

### 2. [KRİTİK CI & ÇALIŞMA ZAMANI ENGELLEYİCİSİ] `manifest.json` 9.783 Eksik Karo Tuzağı, `v3.8` Erken `z=3` Tetiklemesi ve Konfigürasyon Kayması

- **Etkilenen Dosyalar:** [`data/tiles/manifest.json`](data/tiles/manifest.json), [`data/datasets/jpl_mars_trek_layers.json`](data/datasets/jpl_mars_trek_layers.json#L20-L71), [`data/offlineDatasets.js`](data/offlineDatasets.js#L29-L77), [`MarsTileLoader.js`](js/services/MarsTileLoader.js#L114-L185), [`.github/workflows/deploy-mars-web.yml`](.github/workflows/deploy-mars-web.yml#L55-L66)
- **Sorunlar:**
  1. **9.783 Eksik Karo & CI Çöküşü:** [`manifest.json`](data/tiles/manifest.json) (`generated_at: "2026-11-14 17:53:10"`) toplam **10.248** karo (`mars-viking-mdim21: 2.730`, `mars-mola-elevation: 2.730`, `mars-themis-day-ir: 2.058`, `mars-global-geology: 2.730`) bildirirken `data/tiles/` dizininde gerçekte yalnızca **465** karo dosyası (`z=0..2`: `168`; `z=3..5` seçili krater karoları: `297`) mevcuttur — **9.783 dosya eksiktir**. [`deploy-mars-web.yml`](.github/workflows/deploy-mars-web.yml#L55-L66) diskteki dosya varlığını tek tek denetlediği için CI `exit 1` ile kırılır.
  2. **WMTS Fallback Tuzağı (`v3.8` ile Açılışta Tetikleniyor):** [`hasLocalTile`](js/services/MarsTileLoader.js#L114-L117) sadece `manifestSets` kümesine baktığından diskte bulunmayan `9.783` karosunun tamamı için `true` döner; [`resolveTileSource`](js/services/MarsTileLoader.js#L141-L148) ise yerel `./data/tiles/...` (**HTTP 404**) yolunu seçip NASA WMTS yedeğine (`L145`) **hiç düşemez** (`L427` `status: "error"` kalıcıdır). `v3.8` [`computeTargetZoom`](js/services/MarsTileLoader.js#L171-L185) içinde `z=3` eşiği `zoom >= 0.92` (`3D`) / `0.95` (`2D`) yapıldığı için kullanıcı açılıştaki varsayılan `1.05x` zoom'dan itibaren doğrudan bu 404 tuzağına düşer.
  3. **`file://` vs HTTP Çelişkisi:** [`jpl_mars_trek_layers.json`](data/datasets/jpl_mars_trek_layers.json#L20-L68) tüm katmanlarda `max_local_zoom: 5` değerine yükseltilmişken (`mars-global-geology` üzerinde `cors_enabled: false` [L71](data/datasets/jpl_mars_trek_layers.json#L71) korunmuştur), [`offlineDatasets.js`](data/offlineDatasets.js#L29-L77) ve [L634](data/offlineDatasets.js#L634) hâlâ eski `max_local_zoom: 2` ayarını ve `12:44:49` tarihli `465` karoluk eski manifesti barındırır (`logs/change_log.txt` [L262](logs/change_log.txt#L262) ise `10.249` karo indirildiğini iddia etmektedir).

---

### 3. [KRİTİK REGRESYON — `v3.8`'de AĞIRLAŞTI] `MarsTileLoader.js` Yetim `"queued"` / Kalıcı `"error"` Karolar ve Frustum/Bit-Key Sınırları

- **Etkilenen Dosya ve Satırlar:** [`MarsTileLoader.js`](js/services/MarsTileLoader.js#L45-L553) ([L45](js/services/MarsTileLoader.js#L45), [L220-L234](js/services/MarsTileLoader.js#L220-L234), [L243-L337](js/services/MarsTileLoader.js#L243-L337), [L346](js/services/MarsTileLoader.js#L346), [L358-L393](js/services/MarsTileLoader.js#L358-L393), [L427](js/services/MarsTileLoader.js#L427), [L483](js/services/MarsTileLoader.js#L483), [L503](js/services/MarsTileLoader.js#L503), [L540](js/services/MarsTileLoader.js#L540), [L552](js/services/MarsTileLoader.js#L552))
- **Sorunlar:**
  1. **Yetim `"queued"` & `"error"` Önbellek Zehirlenmesi (`L220-L234, L346, L358-L393, L427`):** [`requestVisibleTiles`](js/services/MarsTileLoader.js#L229) `this.loadQueue = this.loadQueue.filter((item) => item.z <= 2);` satırıyla eski kameraya ait bekleyen `z >= 3` karolarını kuyruktan atar fakat bunları `this.tileCache` ve `this.fastGrid` ([L386-L387](js/services/MarsTileLoader.js#L386-L387)) içinden silmez. Üstelik `v3.8` (`dfb10fd`) bu adımı **sürükleme sırasında da her `75 ms`'de bir** ([L220-L229](js/services/MarsTileLoader.js#L220-L229)) ve yakınlaştırma sırasında her karede çalıştırdığından çok daha fazla `z >= 3` kaydı kuyruktan düşüp yetim `"queued"` durumunda kalır. Kullanıcı o bölgeye tekrar döndüğünde [`loadTile`](js/services/MarsTileLoader.js#L358-L365) `existing` kaydını bulup yalnızca LRU yenileyerek döner; [`evictIfNeeded`](js/services/MarsTileLoader.js#L346) ise `rec.status !== "queued"` koşuluyla yetim kayıtları bellekten de atmaz. Ağ hatalarından doğan `status: "error"` ([L427](js/services/MarsTileLoader.js#L427)) kayıtları da hiç yeniden denenmez.
  2. **Doğu Frustum Kırpması ve Eksik `camPitch`/`camYaw` Desteği (`L243-L337`):** [`requestViewportWindow`](js/services/MarsTileLoader.js#L243-L337) `camPitch`/`camYaw` değerlerini hiç okumaz; ek olarak `Math.min(ixStart + 7, ...)` (2B [L265](js/services/MarsTileLoader.js#L265)) ve `Math.min(ixStart + 6, ...)` (3D [L311](js/services/MarsTileLoader.js#L311)) doğu yarıyı asimetrik kırpar.
  3. **Çift Sürüm Artışı ve Sınırlar (`L45, L371, L483, L503, L540, L552`):** Tek karo çözülünce `this.decodedVersion++` hem [`extractTilePixels`](js/services/MarsTileLoader.js#L503) hem [`processDecodeQueue`](js/services/MarsTileLoader.js#L483) içinde iki kez artırılır; `document.createElement` ([L45](js/services/MarsTileLoader.js#L45)) ortam kontrolü içermez; `hasAnyReadyTile` ([L540](js/services/MarsTileLoader.js#L540)) yalnızca `z <= 2` katmanlarına bakar; `(y << 12) | x` ([L371](js/services/MarsTileLoader.js#L371), [L552](js/services/MarsTileLoader.js#L552)) bit anahtarı `z >= 11` (`cols = 4096`) düzeyinde çakışır.

---

### 4. [KRİTİK ÇÖKME] Dil Değiştirme Fonksiyonu `TypeError` Fırlatıyor

- **Etkilenen Kodlar:** [`MarsNavigatorController.changeLanguage`](js/components/MarsNavigatorController.js#L142-L143) -> [`I18nService.getSupportedLanguages`](js/services/I18nService.js#L18-L39)
- **Sorun:** `changeLanguage` metodu [L142](js/components/MarsNavigatorController.js#L142) içinde `this.i18n.getLanguages().find(...)` çağrısı yapıp `meta.nativeName` okur; ancak `I18nService` sınıfında yalnızca [`getSupportedLanguages()`](js/services/I18nService.js#L37) metodu ve nesnelerde `.label` alanı tanımlıdır ([L19-L27](js/services/I18nService.js#L19-L27)).
- **Sonuç:** Kullanıcı arayüzden dil değiştirdiği anda `Uncaught TypeError: this.i18n.getLanguages is not a function` hatası fırlatılır ve dil değişikliği bildirim aşamasında yarıda kesilir.

---

### 5. [KRİTİK KIRIK ÖZELLİK] Bağımsız Sohbet Modülü (`/chat/`) Kırık Yol, Yarış Koşulu ve Bozuk HTML/Kota Mantığı

- **Etkilenen Dosyalar:** [`chat/index.html`](chat/index.html#L314-L503), [`api/chat.php`](api/chat.php#L113-L254)
- **Sorunlar:**
  1. **404 API ve Dosya Yolu:** `chat/index.html` [L314](chat/index.html#L314) `this.apiEndpoint = "./api/chat.php"` tanımlar; `/chat/` altında bu adres `/chat/api/chat.php` olarak çözümlenir ve **404** verir (`../api/chat.php` olmalıdır). [L406](chat/index.html#L406)'daki boş `catch (err) {}` hatayı yuttuğu için ekranda `"Mesajlar yükleniyor..."` metni takılı kalır. Ayrıca `api/chat.php` [L253](api/chat.php#L253) veritabanına `./uploads/...` yazar; `/chat/` sayfası bunu `/chat/uploads/...` şeklinde çözüp kırık link üretir.
  2. **Çift HTML Kaçışı (Double Escaping):** `api/chat.php` ([L167-L169, L254](api/chat.php#L167-L169)) girdiyi veritabanına kaydetmeden önce `htmlspecialchars()` ile kodlar; `chat/index.html` ([L456, L459, L474, L503](chat/index.html#L456)) ise DOM'a `.textContent` ile yazar. Sonuç olarak kullanıcı ekranında `&amp;`, `&#039;`, `&quot;` karakter dizileri görünür.
  3. **Polling Yarış Koşulu:** `chat/index.html` ([L380, L383-L407, L432](chat/index.html#L380)) 3 saniyelik `setInterval` taraması ile mesaj gönderimi sonrası `fetchMessages()` çağrısı arasında devam eden istek kilidi veya mesaj ID tekilleştirmesi yapmadığı için aynı mesaj ekranda mükerrer belirebilir.
  4. **Hatalı Hız Sınırı ve Yükleme Kotası (`api/chat.php` L113-L148):** Yeni bir IP'nin eşzamanlı ilk istekleri `INSERT` sırasında `PRIMARY KEY` yarışına düşüp HTTP 500 üretebilir; [L146](api/chat.php#L146) dosya içermeyen metin mesajlarında dahi `upload_count = 1` yazar; [L130, L137](api/chat.php#L130) dosya yükleme doğrulamalarından (`L181-L237`) **önce** yükleme sayacını artırarak reddedilen denemelerde kotayı tüketir; [L118](api/chat.php#L118) yorumunda "0.5 saniye" yazarken tam sayı `time()` farkı (`< 1`) 1 saniyeye kadar istekleri bloke eder.

---

### 6. [KRİTİK EKSİK / MİMARİ ÇELİŞKİ] HTTP Rust Backend Yokluğu, WASM Kısa Devresi, Ölü Yedek Motor ve Matematik Hataları

- **Etkilenen Dosyalar:** [`backend/Cargo.toml`](backend/Cargo.toml), [`backend/src/main.rs`](backend/src/main.rs), [`BackendApiService.js`](js/services/BackendApiService.js#L20-L398), [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L257-L704), [`RoutePlannerService.js`](js/services/RoutePlannerService.js), [`DatasetLoader.js`](js/services/DatasetLoader.js), [`HazardFieldService.js`](js/services/HazardFieldService.js#L27)
- **Sorunlar:**
  1. **Var Olmayan HTTP Backend Sunucusu:** [`readme.md`](readme.md#L41-L61), [`BACKEND_API.md`](BACKEND_API.md), [`AppConfig.js`](js/models/AppConfig.js#L46) ve [`RouteInspectorPanel.js`](js/components/RouteInspectorPanel.js#L59) `/api/v1/health`, `/api/v1/hazards` ve `/api/v1/route` HTTP uç noktalarını belgeler; ancak `backend/Cargo.toml` yalnızca `pathfinding` ve opsiyonel `wasm-bindgen` bağımlılığı içerir, `backend/src/main.rs` ise yalnızca konsola statik örnek basar — **HTTP sunucusu mevcut değildir**.
  2. **WASM Kısa Devresi ve `file://` Kırılması:** HTTP(S) altında `BackendApiService.ensureWasmLoaded()` ([L20-L46](js/services/BackendApiService.js#L20-L46)) yüklendiğinde `testConnection()` ([L77-L89](js/services/BackendApiService.js#L77-L89)) ve `requestStepRoute()` ([L187-L190](js/services/BackendApiService.js#L187-L190)) harici `backendApiUrl` ayarını yok sayarak daima yerel WASM'a kısa devre yapar. [`startBackendLatencyMonitor`](js/components/MarsNavigatorController.js#L691-L704) de ağ gecikmesi yerine yerel WASM çağrı süresini (`~1 ms`) ölçer. Buna karşılık uygulama `file://` ile açıldığında WASM ES modülü `import()` CORS nedeniyle engellenir ve `127.0.0.1:8080` çalışmadığı için rota ve tehlike alanları tamamen boş (`backendRoutes = null`, `backendHazards = null`) kalır.
  3. **Ölü Kod Haline Gelmiş Servisler ve Tutarsız Veri:** [`MarsNavigatorController.computeActiveRoutes`](js/components/MarsNavigatorController.js#L257) yalnızca `this.backendRoutes` döndürdüğü için [`RoutePlannerService`](js/services/RoutePlannerService.js) içindeki `computeGlobalRoutes`, `computeRoutesBetweenCoords` ve `computeCraterRoutes` metotlarının sıfır çağırıcısı vardır. Aynı şekilde [`DatasetLoader.getGeologyData`](js/services/DatasetLoader.js#L58), [`DatasetLoader.getCuriosityRoute`](js/services/DatasetLoader.js#L62) ve [`HazardFieldService.worldviewHazards`](js/services/HazardFieldService.js#L27) (`setWorldviewData` saklar ama `getGlobalHazardZones` hiç okumaz) atıl kalmıştır; `HazardFieldService.js` içindeki sabit koordinatlar [`nasa_worldview_and_hazards.json`](data/datasets/nasa_worldview_and_hazards.json#L25-L55) ile birebir uyuşmaz (ör. `storm-hellas`: `-42.4, 70.5` vs `-42.7, 70.0`; `325`/`270` derece gösterimi).
  4. **Antimeridyen, Sahte Topografi ve Güvenliksiz A* Geri Düşüşü (`BackendApiService.js` L218-L398):**
     - `dLon = dest.lon - orig.lon` ([L232, L325](js/services/BackendApiService.js#L232)) `[-180, 180]` sarmalaması yapmaz; Gale Krateri (`137.44°`) -> Olympus Mons (`-133.8°`) rotasında `+88.8°` yerine `dLon = -271.24°` ile ters yarımküreden yol çizer.
     - [L249](js/services/BackendApiService.js#L249) `Math.hypot(lat - z.lat, lon - z.lon)` boylam sarma ve `cos(lat)` düzeltmesi yapmaz; [L336](js/services/BackendApiService.js#L336) çıktı `lon` değerini normalize etmez.
     - [L265-L266, L355](js/services/BackendApiService.js#L265-L266) `ns.marsTopo` gerçek topografiyi kullanmak yerine `Math.sin`/`Math.cos` dalgalı yapay ızgara (`0..10`) ve `-2400 + cur.elevLevel * 185` üretir; [L256](js/services/BackendApiService.js#L256) sabit statik engeller enjekte eder.
     - [L277-L281](js/services/BackendApiService.js#L277-L281) birincil A* başarısız olduğunda `buildGrid(0.0)` ile ikinci denemeye düşerek **tüm asit, fırtına ve radyasyon engellerini sessizce kaldırır**.

---

### 7. [KRİTİK / YÜKSEK] 12 Eksik i18n Anahtarı, Almanca Yazım Hatası, Sabit Türkçe HUD, Fabrika Sıfırlama ve DOM Seçicileri

- **Tüm 9 Dil Sözlüğünde Eksik 12 i18n Anahtarı (`13` çağrı):** [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js) içinde çağrılan aşağıdaki 12 anahtar `data/i18n/*` altındaki `158`'er anahtarlık sözlüklerde tanımlı değildir; ekranda ve toast bildirimlerinde ham anahtar adları görünür:
  - `backendLocalActive` ([L662](js/components/MarsNavigatorController.js#L662))
  - `backendResponded` ([L744](js/components/MarsNavigatorController.js#L744))
  - `inspBackendWaiting` ([L749, L751](js/components/MarsNavigatorController.js#L749-L751))
  - `inspLocalBadge` ([L709](js/components/MarsNavigatorController.js#L709))
  - `inspNoConnection` ([L709](js/components/MarsNavigatorController.js#L709))
  - `pickedDestName` ([L500](js/components/MarsNavigatorController.js#L500))
  - `telemetryLoading` ([L314](js/components/MarsNavigatorController.js#L314))
  - `toastBackendUrlCleared` ([L665](js/components/MarsNavigatorController.js#L665))
  - `toastClickMarsSurface` ([L496](js/components/MarsNavigatorController.js#L496))
  - `toastDestPicked` ([L504](js/components/MarsNavigatorController.js#L504))
  - `toastPickDestinationHint` ([L653](js/components/MarsNavigatorController.js#L653))
  - `zoomResetTitle` ([L311](js/components/MarsNavigatorController.js#L311))
- **Sabit Türkçe Metinler ve Almanca Çeviri Hatası:** [`localesTrEnDe.js`](data/i18n/localesTrEnDe.js#L461) satırında `warnHazardDetour: "ichere Umleitung um {name}"` (`S` eksik) durmaktadır. Ayrıca sağ alt 3B HUD ipuçları, zirve gezinme toast'u, telemetri şeridi ([`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L309-L310), [L338](js/components/MarsNavigatorController.js#L338), [L364-L366](js/components/MarsNavigatorController.js#L364-L366)) ve 3B yükleniyor küre metni ([`Map3DRenderer.js`](js/renderers/Map3DRenderer.js#L765)) i18n dışında sabit Türkçe yazılmıştır.
- **Eksik Fabrika Sıfırlaması:** [`MarsNavigatorController.performFactoryReset`](js/components/MarsNavigatorController.js#L194-L212) `backendRoutes = null; backendHazards = null;` yapıp `refreshAll()` çağırır fakat `refreshBackendHazardsAndRoute()` tetiklemez; kullanıcı yeniden hesapla butonuna basana dek harita rotasız/tehlikesiz kalır. Ayrıca [`AppConfig.getFactoryDefaults`](js/models/AppConfig.js#L24-L67) `camPitch`, `camYaw`, `topoReliefScale` ve `enable3DTerrain` alanlarını içermediğinden 3B kamera eğimi sıfırlanmaz.
- **Var Olmayan DOM Öğesi:** [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L712) HTML içinde bulunmayan `#insp-latency-pill-card` öğesini sorgular.

---

### 8. [YÜKSEK] 3B/2B Ters-Projeksiyon Uyuşmazlığı, Ölü MOLA Senkronizasyonu ve Çizim/UX Tutarsızlıkları

- **3B Tıklama (Picking) Parametre Kaybı (`MarsNavigatorController.js` L631 -> `RouteGeometryHelper.js` L137-L158):** Kontrolcü `(camPitch, camYaw, relief)` dahil 10 argüman iletirken [`screenToMarsCoords3D`](js/services/RouteGeometryHelper.js#L137-L158) yalnızca ilk 7 parametreyi kabul eder; pitch, yaw ve yükseklik kabartmasını dikkate almaz, yakınlaştırmayı `80.0` yerine `3.2` ile sınırlar ve `sphereCy` yerine `height / 2` kullanır. Eğik/yakınlaştırılmış 3B kürede tıklanan nokta gerçek konumla uyuşmaz.
- **Kullanılmayan MOLA Karo Senkronizasyonu ve Hue Boşluğu (`MarsTopographyService.js`):** [`syncWithMolaTiles`](js/services/MarsTopographyService.js#L174) ve [`buildCameraBasis`](js/services/MarsTopographyService.js#L390) hiçbir yerden çağrılmaz (gerçek MOLA PNG karoları `elevGrid` ile hiç birleştirilmez). [`decodeMolaPixelMeters`](js/services/MarsTopographyService.js#L237-L254) `(285, 315]` hue aralığını kapsamadığından bu renk tonlarında `baseM = 0` döner. [`screenToElevatedMars3D`](js/services/MarsTopographyService.js#L469-L470) yakınlaştırmayı `80.0` yerine `24.0` ile sınırlar ve `cy = height / 2` alır.
- **`Map3DRenderer.js` İncelik Tutarsızlıkları & `v3.8` Senkron Okuma:** [`L143`](js/renderers/Map3DRenderer.js#L143) `highQualityGlobeRay === true` durumunda bile `exactAll = false` geçirir; [`drawLoadingSphere`](js/renderers/Map3DRenderer.js#L91) `sphereCy` yerine `cy` geçirir. `v3.8` [`resolveTilePixels`](js/renderers/Map3DRenderer.js#L294) `!fastMode && rec.z <= 3` için ana iş parçacığında senkron `getImageData` (`extractTilePixels`) çalıştırarak ilk duragan karede takılma yaratabilir. `file://` yedeği [`drawFallbackShadedSphere`](js/renderers/Map3DRenderer.js#L160-L163) `sphereCy` çevresinde çizim yaparken içindeki `uvAt` ([L605](js/renderers/Map3DRenderer.js#L605)) `cy = height / 2` varsayan `screenToElevatedMars3D`'yi çağırır; yedek matematik dalı ([L612-L621](js/renderers/Map3DRenderer.js#L612-L621)) ise `camPitch`, `camYaw` ve `reliefScale` parametrelerini yok sayar.
- **Kalan Zoom Sınırı Uyuşmazlıkları ve Kontrolsüz Yüzey Seçimi:** 2B render ve sürükleme `32.0` değerinde hizalanmış olsa da 2B picking ([`RouteGeometryHelper.screenToMarsCoords2D`](js/services/RouteGeometryHelper.js#L121)) hâlâ `4.5` ile sınırlıdır; [`applyGuardedSetting`](js/components/MarsNavigatorController.js#L185) 3B'ye geçerken zoom'u `22.0` ile kırparken diğer 3B akışlar `80.0` tavanını korur. Ayrıca yüzeyde boş alana tıklamak ([L486-L506](js/components/MarsNavigatorController.js#L486-L506)) `pickMode` açık değilken bile `customDestination` atar.
- **Bozuk Krater EVA Çizimi ve Küçük Ekran Etiket Taşması:** [`Map2DRenderer.js`](js/renderers/Map2DRenderer.js#L105-L120) -> [`RouteCanvasRenderer.js`](js/renderers/RouteCanvasRenderer.js#L134-L152) `drawCraterEvaRoutes` içinde `{relX, relY}` beklerken backend `{lat, lon}` üretir; [`flyToCraterById`](js/components/MarsNavigatorController.js#L229) her zaman `routeScope = "global"` zorlar. [`RouteCanvasRenderer.js`](js/renderers/RouteCanvasRenderer.js#L60) `pBoxX = Math.min(viewW - 430, pAnchor.x + 35)` hesabı `430px` altı ekranlarda negatife düşüp işaret çizgisini ekran dışına uzatır.

---

### 9. [ORTA-YÜKSEK] Sürekli 60Hz Boşta `rAF`, FPS Guard Çakışması ve Panel Odak Kaybı

- **Durmayan 60Hz `rAF` Döngüleri:** [`FpsGuardService.start`](js/services/FpsGuardService.js#L31-L56) ve [`StarfieldRenderer.startLoop`](js/renderers/StarfieldRenderer.js#L111-L120) kullanıcı etkileşimi olmadığında veya yıldız alanı kapalıyken dahi `requestAnimationFrame` zincirini durdurmaz. Ayrıca [`StarfieldRenderer.drawFrame`](js/renderers/StarfieldRenderer.js#L97-L98) içinde `this.ctx.drawImage(this.baseCanvas, 0, 0)` satırı `if (!this.enabled) return;` kontrolünden önce çalıştığı için `resize()`/`setEnabled(false)` çağrısında kapalı yıldız tuvalini `opacity = "0.08"` ([L51](js/renderers/StarfieldRenderer.js#L51)) ile yine de çizer.
- **FPS Guard Tek Yuva Sorunu:** [`FpsGuardService.armSettingGuard`](js/services/FpsGuardService.js#L79) yalnızca tek bir `pendingGuard` yuvasına sahip olduğu için 10 saniye içinde iki ayar değişirse önceki izleme kaybolur. [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L174) `{ ...this.state }` sığ kopya aldığından iç içe durum nesneleri mutasyona açıktır; geri alma (`L176-L180`) rota yeniden hesaplamasını tetiklemez.
- **Odak ve Kaydırma Kaybı:** [`SettingsPanel.js`](js/components/SettingsPanel.js), [`RouteInspectorPanel.js`](js/components/RouteInspectorPanel.js) ve [`SatellitesPanel.js`](js/components/SatellitesPanel.js) asenkron durum güncellemelerinde kapsayıcı `innerHTML` içeriğini tamamen yeniden yazar; bu durum özellikle `#inp-backend-url` giriş kutusundaki yazma odağını ve kaydırma konumunu sıfırlar.

---

### 10. [ORTA] Build, Yayın ve Başlatma Betiği Kusurları

- [`tools/server/deploy_web_sync.sh`](tools/server/deploy_web_sync.sh#L57-L130): `--depth 1` sığ klonlama yapıldığı için son commit yalnızca `backend/` veya `tools/` dosyalarını değiştirdiyse `git log -n 1 -- index.html ...` boş `""` döner; `[ -n "$LATEST_WEB_SHA" ]` koşulu `.deployed_web_sha` dosyasını boş dizeyle güncelleyerek betiğin her 30 saniyede bir yeniden dağıtım tetiklemesine yol açar.
- [`tools/build.py`](tools/build.py#L46-L120) ve [`tools/build_tool.ps1`](tools/build_tool.ps1#L33-L72): `git diff --quiet readme.md` staged veya commit edilmiş değişiklikleri yakalamaz; son kullanıcı dağıtımına (`dist/`) iç ajan dokümantasyonu (`ForAgents/`) kopyalanırken `api/`, `chat/` ve `BACKEND_API.md` dışarıda bırakılır.
- [`tools/launch-linux.sh`](tools/launch-linux.sh#L27-L36): `.wasm` dosyaları için `application/wasm` MIME eşlemesi eksiktir.
- [`serve.ps1`](serve.ps1#L85-L86): 3000 portu meşgulse rastgele boş port (`0`) yedeği yerine doğrudan çöker.
- [`tools/github_autodeploy.ps1`](tools/github_autodeploy.ps1#L135): `$argList` boşluk içeren dosya yolları için tırnaklanmadan birleştirilir.

---

## Bölüm 3: `readme.md` Kuralları ve Tasarım Sözleşmesi Uyumsuzluk Matrisi

| `readme.md` Kuralı / Tasarım Sözleşmesi | Tespit Edilen Uyumsuzluk | Etkilenen Konumlar |
|---|---|---|
| **800 Satır Modülerlik Sınırı (`L27`)** | **[KRİTİK İHLAL]** [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js) `v3.8` (`465fdae`) itibarıyla **829** `awk NR` (**830** satır) olup sınırı aşmayı sürdürmektedir (`v3.7`: `849/850`). [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js) **796** (`797`) satıra çıkmıştır. CI `NR >= 800`, build betikleri `> 800` kullanır ve `api/`, `chat/`, `backend/` klasörlerini atlar. | [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js), [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js), [`.github/workflows/deploy-mars-web.yml`](.github/workflows/deploy-mars-web.yml#L42), [`tools/build.py`](tools/build.py#L89), [`tools/build_tool.ps1`](tools/build_tool.ps1#L33) |
| **Karo Bütünlüğü ve Çevrimdışı Paketleme** | [`manifest.json`](data/tiles/manifest.json) **10.248** karo bildirirken diskte yalnızca **465** karo vardır (`9.783` eksik -> CI `exit 1` ve WMTS fallback kilidi; `v3.8` açılışta `z=3`'e girdiği için ilk karede tetiklenir). [`offlineDatasets.js`](data/offlineDatasets.js#L29-L77) `max_local_zoom: 2` ve 465 karoda kalmıştır. | [`data/tiles/manifest.json`](data/tiles/manifest.json), [`data/datasets/jpl_mars_trek_layers.json`](data/datasets/jpl_mars_trek_layers.json), [`data/offlineDatasets.js`](data/offlineDatasets.js) |
| **Satır Altı Açıklama Kuralı (`L25`)** | `66` aktif kaynak/araç/CI dosyasında **7 dosyada tamamen eksik** (`backend/src/lib.rs`, `backend/src/main.rs`, `js/wasm/backend.js`, `js/wasm/backend.d.ts`, `js/wasm/backend_bg.wasm.d.ts`, `build_wasm.sh`, `build_wasm.bat`), **1 dosyada açık uçlu** ([`css/fonts.css`](css/fonts.css#L106): `Satir 1+`), **35 dosyada `>5` satır kaymış** (ör. `css/inspector.css` `+224`, `css/chat.css` `+78`, `MarsTileLoader.js` `+78`, `BackendApiService.js` `+76`, `Map3DRenderer.js` `+66`). [`tools/build.py`](tools/build.py#L92) yalnızca düz metin varlığına bakar. | `backend/`, `js/wasm/`, `build_wasm.*`, [`css/fonts.css`](css/fonts.css#L106), [`tools/build.py`](tools/build.py#L92) ve `35` dosya |
| **Rota İnceleme Ekranı (Inspector) Sözleşmesi** | `waypoints`, `selectedWp` ve `radZones` parametreleri kullanılmıyor; Alfa/Beta/Gama radyasyon seviyeleri, foton akısı, `totalMeters`, EVA durakları ve `420L` O₂ / `24L` su rezerv açığı uyarısı gösterilmiyor. Başlangıç etiketi `"Gale (...)"` olarak sabitlenmiş. | [`RouteInspectorPanel.js`](js/components/RouteInspectorPanel.js#L36-L167) ([L96](js/components/RouteInspectorPanel.js#L96)) |
| **Renk Paleti ve Tipografi Bütünlüğü** | `chat/` ve `css/chat.css` slate renkler (`#020617`, `#0f172a`) ve sistem yedek fontları kullanıyor. `css/chat.css` içinde tanımlı **35 sınıfın 34'ü kullanılmıyor** (yalnız `hidden`) ve dosya hiçbir HTML'e bağlanmamış. `css/inspector.css` (`#0f172a`/`#4ade80`) ve `OverlayDrawHelper.js` (`rgba(15, 23, 42, 0.9)`) tema dışına çıkıyor. | [`css/chat.css`](css/chat.css), [`chat/index.html`](chat/index.html), [`css/inspector.css`](css/inspector.css#L175), [`OverlayDrawHelper.js`](js/renderers/OverlayDrawHelper.js#L236) |
| **Dil Sayısı Referansı** | Çince (`zh`) kaldırılıp 9 dile düşülmesine karşın [`css/controls.css`](css/controls.css#L234), [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js#L789-L790), [`MissionInfoModal.js`](js/components/MissionInfoModal.js#L4), [`RouteInspectorPanel.js`](js/components/RouteInspectorPanel.js#L4), [`SatellitesPanel.js`](js/components/SatellitesPanel.js#L3), [`SettingsPanel.js`](js/components/SettingsPanel.js#L33), [`AppConfig.js`](js/models/AppConfig.js#L26) ve [`logs/change_log.txt`](logs/change_log.txt#L211-L215) genelinde **18 satırda** hâlâ eski `"10 dil"` ifadesi duruyor. | 8 dosya genelinde 18 satır |
| **Sürüm, Paket ve Depo Hijyeni** | Sürüm numaraları tutarsız ([`version.json`](version.json): `3.1.0`, [`index.html`](index.html#L7): `v3.3` / [L9-L75](index.html#L9-L75) `?v=3.8`, [`AppConfig.js`](js/models/AppConfig.js#L14): `v3_3`, [`ForAgents/PROJECT_STATE.md`](ForAgents/PROJECT_STATE.md): `v3.0.0–v3.3.0`). `465fdae` eski `backups/` yığınını temizlemiş olsa da `dist/` (**1.091 dosya / 82,38 MiB**) hâlâ Git içinde tutuluyor ve arşivleri / [`SHA256SUMS.txt`](dist/linux/AstroChief-MarsMap-linux/SHA256SUMS.txt) `v3.6`'da kalmış. | [`version.json`](version.json), [`index.html`](index.html), [`AppConfig.js`](js/models/AppConfig.js#L14), `dist/` |

---

## Bölüm 4: Öncelikli İyileştirme Yol Haritası

### P0 — Acil CI/Derleme Engelleyicileri, Güvenlik ve Çökme Düzeltmeleri
1. **[BLOB / CI BLOCKER] [`data/tiles/manifest.json`](data/tiles/manifest.json) Dosyasını Diskle Eşitleyin ve Eksik Karo Fallback'ini Açın:** `manifest.json` yalnızca diskte gerçekten var olan 465 karoyu içermeli (veya eksik `z=3..5` karoları indirilmeli) ve [`data/offlineDatasets.js`](data/offlineDatasets.js) + [`jpl_mars_trek_layers.json`](data/datasets/jpl_mars_trek_layers.json) hizalanmalıdır.
2. **[CI BLOCKER] [`Map3DRenderer.js`](js/renderers/Map3DRenderer.js) Dosyasını 800 Satırın Altına Bölün (`829` → `< 800`):** Örneğin [`drawFallbackShadedSphere`](js/renderers/Map3DRenderer.js#L566) veya raycaster yardımcıları ayrı bir sınıfa (`Map3DRaycastHelper.js`) çıkarılmalı; [`MarsNavigatorController.js`](js/components/MarsNavigatorController.js) (`796/797` satır) de modülerleştirilip CI (`NR >= 800`) ve `build.py` yeniden çalıştırılarak `dist/` arşivleri + `SHA256SUMS.txt` güncellenmelidir.
3. **[REGRESYON] [`MarsTileLoader.js`](js/services/MarsTileLoader.js) Yetim `"queued"` / Kalıcı `"error"` Hatasını Giderin:** `requestVisibleTiles` kuyruk temizlerken dropped `z >= 3` kayıtları `tileCache` ve `fastGrid` içinden de silmeli (veya yeniden kuyruğa almalı); `error` kayıtları yeniden deneme penceresine sahip olmalı, doğu frustum kırpması kaldırılmalı ve `decodedVersion++` tek noktadan yapılmalıdır.
4. **DOM XSS ve PHP/Altyapı Zafiyetlerini Kapatın:** `RouteInspectorPanel.js` ve `SettingsPanel.js` dinamik alanlarını `.textContent`/HTML kaçışına taşıyın; `BackendApiService.normalizeBaseUrl` için origin allowlist + şema kısıtlaması getirin. `api/chat.php` içinde `in_array($detectedMime, $allowedMimes, true)` kontrolünü etkinleştirip `application/octet-stream` türünü çıkarın, POST + CSRF/oturum zorunlu kılın, `REMOTE_ADDR` + `$limit = max(1, ...)` ekleyin ve `storage/`/`uploads/` klasörlerini web kökü dışına alın. `install_autodeploy.sh` `NOPASSWD` sudoers ve CLI sırrı aktarımını kaldırıp `tools/server/README.md` IP/kullanıcı bilgilerini temizleyin.
5. **Acil Çökme ve `/chat/` Düzeltmeleri:** `MarsNavigatorController.changeLanguage` içindeki `getLanguages()` çağrısını `getSupportedLanguages()` (`.label`) ile düzeltin; `chat/index.html` yollarını `../api/chat.php` / `../uploads/...` yapıp çift HTML kaçışını ve polling yarışını giderin.

### P1 — Mimari Bütünlük, Matematik ve Sözleşme Düzeltmeleri
1. HTTP Rust API sunucusu (`axum`/`actix-web` veya mevcut dokümana uygun servis) kararını netleştirin; harici `backendApiUrl` seçildiğinde WASM kısa devresini devre dışı bırakın, antimeridyen boylam sarmalamasını ve `MarsTopographyService` (`syncWithMolaTiles`, hue `285..315`, `screenToElevatedMars3D` `cy`/`sphereCy` ve `zoom = 80`) entegrasyonunu sağlayın.
2. Eksik **12 i18n anahtarını** tüm 9 dil sözlüğüne ekleyin, Almanca `warnHazardDetour` yazım hatasını ve HUD sabit Türkçe metinlerini düzeltin; `RouteInspectorPanel` içine radyasyon/foton akısı/O₂-su rezerv/EVA waypoint gösterimlerini ekleyin.
3. `MarsNavigatorController` -> `RouteGeometryHelper.screenToMarsCoords3D` / `screenToMarsCoords2D` (`4.5` -> `32.0`) ve `applyGuardedSetting` (`22.0` -> `80.0`) imzalarını ve `drawFallbackShadedSphere.uvAt` merkezlemesini (`sphereCy`) eşitleyin.
4. `tools/server/deploy_web_sync.sh` sığ `--depth 1` SHA kontrol hatasını düzeltin ve `performFactoryReset()` içinde backend rota/tehlike yenilemesi ile 3B kamera sıfırlamasını tamamlayın.

### P2 — Performans, Bakım Kolaylığı ve Depo Hijyeni
1. `FpsGuardService` ve `StarfieldRenderer` boşta sürekli 60Hz `rAF` döngülerini yalnızca ihtiyaç anında (dirty-flag) çalışacak yapıya indirin; `StarfieldRenderer.drawFrame` içine `if (!this.enabled) return;` kontrolünü en başa alın, `Map3DRenderer.resolveTilePixels` içindeki senkron `z=3` `getImageData` okumasını kaldırın ve panel güncellemelerinde kısmi DOM yaması kullanın.
2. Tüm `"10 dil"` (`18` satır), sürüm numarası (`version.json`, `index.html`, `AppConfig.js`, `ForAgents/`), `css/chat.css` (`34` ölü sınıf) ve **35 kaymış / 1 açık uçlu / 7 eksik alt bilgi** bloğunu güncelleyin; `dist/` (`82,38 MiB`) yığınını `.gitignore` kapsamına alıp temizleyin.
