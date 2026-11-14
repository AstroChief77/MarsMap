# GitHub -> `mars.kubitron.com` Otomatik Web Dağıtım Rehberi

Bu otomasyon, GitHub `main` dalına **web ile ilgili bir değişiklik** (`index.html`, `version.json`, `SOURCES.md`, `BACKEND_API.md`, `api/**`, `chat/**`, `css/**`, `js/**`, `data/**`) pushlandığında canlı `https://mars.kubitron.com` sunucusunu `storage/` (chat.db) ve `uploads/` verilerini bozmadan otomatik olarak günceller.

---

## Yöntem A — Sunucuda Tek Komut Kurulum (Önerilen, SSH Secret Gerektirmez)

Sunucuya (`mars.kubitron.com`) SSH ile girip aşağıdaki komutu çalıştırın (web root dizininiz farklıysa `--web-root` parametresini değiştirin):

```bash
git clone https://github.com/AstroChief77/MarsMap.git /tmp/marsmap-setup
sudo bash /tmp/marsmap-setup/tools/server/install_autodeploy.sh --web-root /var/www/mars
rm -rf /tmp/marsmap-setup
```

Bu kurulum:
1. `/usr/local/bin/mars-web-sync` ([deploy_web_sync.sh](./deploy_web_sync.sh)) betiğini kurar.
2. `mars-web-sync.timer` Systemd servisi ile **her 30 saniyede** GitHub `main` dalındaki web dosyası değişikliklerini denetler; değişiklik varsa sadece web dosyalarını `rsync` ile günceller, yoksa `0` işlemle çıkar.
3. Günlükleri `/var/log/mars-autodeploy.log` içine yazar (`tail -f /var/log/mars-autodeploy.log`).

### İsteğe Bağlı: 1 Saniyelik Anlık GitHub Webhook Tetiklemesi
30 saniye beklemeden push anında güncellenmek için:
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

GitHub deposunda **Settings -> Secrets and variables -> Actions** altına şu secret'ları eklerseniz, her web push'undan sonra GitHub Actions doğrudan doğrular ve deploy eder:

* **SSH + `rsync` Modu:**
  * `DEPLOY_USER` (ör. `deploy` veya `root`)
  * `DEPLOY_SSH_KEY` (sunucuya yetkili private SSH anahtarı)
  * `DEPLOY_HOST` *(opsiyonel, varsayılan `mars.kubitron.com`)*
  * `DEPLOY_PORT` *(opsiyonel, varsayılan `22`)*
  * `DEPLOY_PATH` *(opsiyonel, varsayılan `/var/www/mars`)*
* **Alternatif HTTPS Webhook Modu:** `DEPLOY_WEBHOOK_URL` (`https://mars.kubitron.com/api/github_webhook.php`) ve `DEPLOY_WEBHOOK_SECRET` tanımlarsanız GitHub Actions SSH yerine imzalı webhook tetikler.
