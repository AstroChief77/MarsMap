#!/usr/bin/env bash
# @file install_autodeploy.sh
# @description mars.kubitron.com Linux sunucusunda her 30 saniyede GitHub main dalini
# kontrol eden Systemd zamanlayici + Webhook destegini tek komutla kurar.

set -euo pipefail

WEB_ROOT="/var/www/mars"
REPO_URL="https://github.com/AstroChief77/MarsMap.git"
WEBHOOK_SECRET=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --web-root) WEB_ROOT="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --webhook-secret) WEBHOOK_SECRET="$2"; shift 2 ;;
    *) echo "Bilinmeyen parametre: $1"; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "HATA: Lutfen sudo ile calistirin: sudo bash $0 --web-root $WEB_ROOT"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/5] Bagimliliklar kontrol ediliyor (git, rsync)..."
apt-get update -qq && apt-get install -y -qq git rsync curl >/dev/null 2>&1 || true

echo "[2/5] /usr/local/bin/mars-web-sync kuruluyor..."
sed 's/\r$//' "$SCRIPT_DIR/deploy_web_sync.sh" > /usr/local/bin/mars-web-sync
chmod 755 /usr/local/bin/mars-web-sync

echo "[3/5] /etc/default/mars-autodeploy olusturuluyor..."
cat > /etc/default/mars-autodeploy <<EOF
MARS_REPO_URL="${REPO_URL}"
MARS_BRANCH="main"
MARS_STAGE_DIR="/opt/marsmap-repo"
MARS_WEB_ROOT="${WEB_ROOT}"
MARS_LOG_FILE="/var/log/mars-autodeploy.log"
EOF

if [ -n "$WEBHOOK_SECRET" ]; then
  install -d -m 750 -o root -g www-data /etc/mars-autodeploy
  printf '%s' "$WEBHOOK_SECRET" > /etc/mars-autodeploy/webhook.secret
  chown root:www-data /etc/mars-autodeploy/webhook.secret
  chmod 640 /etc/mars-autodeploy/webhook.secret
  echo "www-data ALL=(root) NOPASSWD: /usr/local/bin/mars-web-sync" > /etc/sudoers.d/mars-autodeploy
  chmod 440 /etc/sudoers.d/mars-autodeploy
fi

echo "[4/5] Systemd service + 30sn timer (mars-web-sync.timer) kuruluyor..."
cat > /etc/systemd/system/mars-web-sync.service <<EOF
[Unit]
Description=AstroChief MarsMap GitHub Web Auto-Deploy
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/mars-web-sync
EOF

cat > /etc/systemd/system/mars-web-sync.timer <<EOF
[Unit]
Description=Poll GitHub MarsMap web changes every 30 seconds

[Timer]
OnBootSec=15s
OnUnitActiveSec=30s
AccuracySec=5s

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now mars-web-sync.timer

echo "[5/5] Ilk senkronizasyon baslatiliyor..."
/usr/local/bin/mars-web-sync --force

echo "=================================================================="
echo " [OK] Otomatik dagitim aktif!"
echo " - Web Kok Dizini : $WEB_ROOT"
echo " - Kontrol Suresi : Her 30 saniyede otomatik GitHub main taramasi"
echo " - Gunluk Takip   : tail -f /var/log/mars-autodeploy.log"
echo "=================================================================="

# ==============================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# ------------------------------------------------------------------------------
# - Satir 1-25: Kurulum parametreleri (--web-root, --repo, --webhook-secret) ve root kontrolu.
# - Satir 27-50: mars-web-sync scripti, /etc/default/mars-autodeploy ve opsiyonel HMAC sirri/sudoers ayari.
# - Satir 52-84: Her 30sn calisan Systemd service/timer olusturulmasi ve ilk senkronizasyonun tetiklenmesi.
# ==============================================================================
