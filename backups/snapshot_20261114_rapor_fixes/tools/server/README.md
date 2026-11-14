# GitHub -> `mars.kubitron.com` Otomatik Web Dağıtım Rehberi

Bu otomasyon, GitHub `main` dalına **web ile ilgili bir değişiklik** (`index.html`, `version.json`, `SOURCES.md`, `BACKEND_API.md`, `api/**`, `chat/**`, `css/**`, `js/**`, `data/**`) pushlandığında canlı `https://mars.kubitron.com` (`/var/www/mars`) sunucusunu `storage/` (chat.db), `uploads/` ve `.well-known/` verilerini bozmadan otomatik günceller.

---

## Yöntem A — Sunucuda Tek Komut Kurulum (Özel Repo + Systemd Timer)

`AstroChief77/MarsMap` özel (private) bir repo olduğu için sunucu `/etc/mars-autodeploy/github_deploy_key` anahtarını otomatik üretir:

1. Sunucuda `tools/server/install_autodeploy.sh --web-root /var/www/mars` çalıştırın.
2. Ekrana basılan `/etc/mars-autodeploy/github_deploy_key.pub` tek satırlık anahtarını GitHub'da **Settings -> Deploy keys -> Add deploy key** bölümüne ekleyin.
3. `mars-web-sync.timer` **her 30 saniyede** GitHub `main` dalındaki web değişikliklerini denetler; değişiklik varsa yalnızca web dosyalarını `rsync` ile günceller.
4. Günlükler `/var/log/mars-autodeploy.log` içine yazılır (`tail -f /var/log/mars-autodeploy.log`).

### İsteğe Bağlı: 1 Saniyelik Anlık GitHub Webhook Tetiklemesi
```bash
sudo bash tools/server/install_autodeploy.sh --web-root /var/www/mars --webhook-secret "GUCLU_RASTGELE_ANAHTAR"
```
Ardından GitHub **Settings -> Webhooks -> Add webhook**:
- **Payload URL:** `https://mars.kubitron.com/api/github_webhook.php`
- **Content type:** `application/json`
- **Secret:** Yukarıdaki `GUCLU_RASTGELE_ANAHTAR`
- **Events:** `Just the push event`

---

## Yöntem B — GitHub Actions CI/CD (`.github/workflows/deploy-mars-web.yml`)

GitHub deposunda **Settings -> Secrets and variables -> Actions** altına aşağıdaki secret'ları eklerseniz **sunucuya Deploy Key bile eklemeden** her push'ta GitHub Actions doğrudan `mars.kubitron.com`'a deploy eder:

* **SSH + `rsync` Modu:**
  * `DEPLOY_HOST`: `93.177.102.37` (doğrudan VPS IP'si)
  * `DEPLOY_USER`: `root`
  * `DEPLOY_PORT`: `22`
  * `DEPLOY_PATH`: `/var/www/mars`
  * `DEPLOY_SSH_KEY`: Sunucuda `~/.ssh/authorized_keys` içine yetkili private SSH anahtarı
* **Alternatif HTTPS Webhook Modu:** `DEPLOY_WEBHOOK_URL` (`https://mars.kubitron.com/api/github_webhook.php`) ve `DEPLOY_WEBHOOK_SECRET`.
