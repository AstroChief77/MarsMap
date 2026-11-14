#!/usr/bin/env bash
# @file install_autodeploy.sh
# @description mars.kubitron.com Linux sunucusunda ozel/acik GitHub main dalini
# her 30 saniyede kontrol eden Systemd zamanlayici + Deploy Key + Webhook kurulumunu yapar.

set -euo pipefail

WEB_ROOT="${MARS_WEB_ROOT:-}"
REPO_URL="${MARS_REPO_URL:-}"
WEBHOOK_SECRET="${MARS_WEBHOOK_SECRET:-}"
GITHUB_TOKEN="${MARS_GITHUB_TOKEN:-}"
WEB_OWNER="${MARS_WEB_OWNER:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --web-root) WEB_ROOT="$2"; shift 2 ;;
    --repo) REPO_URL="$2"; shift 2 ;;
    --webhook-secret) WEBHOOK_SECRET="$2"; shift 2 ;;
    --github-token) GITHUB_TOKEN="$2"; shift 2 ;;
    --owner) WEB_OWNER="$2"; shift 2 ;;
    *) echo "Bilinmeyen parametre: $1"; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "HATA: Lutfen sudo veya root olarak calistirin: sudo bash $0"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# 1. Nginx konfigurasyonundan canli web kok dizinini otomatik algila
if [ -z "$WEB_ROOT" ]; then
  DETECTED_ROOT="$(grep -RhoE 'root\s+[^;]+' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | grep -m1 '/mars' | awk '{print $2}' || true)"
  WEB_ROOT="${DETECTED_ROOT:-/var/www/mars}"
fi

if [ -z "$WEB_OWNER" ] && [ -d "$WEB_ROOT" ]; then
  OWNER_USER="$(stat -c '%U' "$WEB_ROOT" 2>/dev/null || echo 'www-data')"
  [ "$OWNER_USER" = "root" ] && OWNER_USER="www-data"
  WEB_OWNER="${OWNER_USER}:www-data"
fi
WEB_OWNER="${WEB_OWNER:-www-data:www-data}"

echo "[1/6] Bagimliliklar kontrol ediliyor (git, rsync, openssh-client, curl)..."
apt-get update -qq && apt-get install -y -qq git rsync curl openssh-client >/dev/null 2>&1 || true

echo "[2/6] Ozel GitHub deposu erisim anahtari (/etc/mars-autodeploy) hazirlaniyor..."
install -d -m 750 -o root -g www-data /etc/mars-autodeploy
DEPLOY_KEY="/etc/mars-autodeploy/github_deploy_key"
if [ -n "$GITHUB_TOKEN" ]; then
  REPO_URL="${REPO_URL:-https://github.com/AstroChief77/MarsMap.git}"
  printf '%s' "$GITHUB_TOKEN" > /etc/mars-autodeploy/github.token
  chmod 600 /etc/mars-autodeploy/github.token
else
  REPO_URL="${REPO_URL:-git@github.com:AstroChief77/MarsMap.git}"
  if [ ! -f "$DEPLOY_KEY" ]; then
    ssh-keygen -t ed25519 -N "" -C "mars.kubitron.com-autodeploy" -f "$DEPLOY_KEY" >/dev/null
    chmod 600 "$DEPLOY_KEY"
    chmod 644 "${DEPLOY_KEY}.pub"
  fi
fi

if [ -n "$WEBHOOK_SECRET" ]; then
  printf '%s' "$WEBHOOK_SECRET" > /etc/mars-autodeploy/webhook.secret
  chown root:www-data /etc/mars-autodeploy/webhook.secret
  chmod 640 /etc/mars-autodeploy/webhook.secret
  echo "www-data ALL=(root) NOPASSWD: /usr/local/bin/mars-web-sync" > /etc/sudoers.d/mars-autodeploy
  chmod 440 /etc/sudoers.d/mars-autodeploy
fi

echo "[3/6] /usr/local/bin/mars-web-sync kuruluyor..."
sed 's/\r$//' "$SCRIPT_DIR/deploy_web_sync.sh" > /usr/local/bin/mars-web-sync
chmod 755 /usr/local/bin/mars-web-sync

echo "[4/6] /etc/default/mars-autodeploy olusturuluyor (WEB_ROOT=$WEB_ROOT)..."
cat > /etc/default/mars-autodeploy <<EOF
MARS_REPO_URL="${REPO_URL}"
MARS_BRANCH="main"
MARS_STAGE_DIR="/opt/marsmap-repo"
MARS_WEB_ROOT="${WEB_ROOT}"
MARS_WEB_OWNER="${WEB_OWNER}"
MARS_DEPLOY_KEY="${DEPLOY_KEY}"
MARS_LOG_FILE="/var/log/mars-autodeploy.log"
EOF

echo "[5/6] Systemd service + 30sn timer (mars-web-sync.timer) kuruluyor..."
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

echo "[6/6] Ilk senkronizasyon deneniyor..."
SYNC_OK=1
if ! /usr/local/bin/mars-web-sync --force; then
  SYNC_OK=0
fi

echo "=================================================================="
echo " [OK] mars-web-sync.timer aktif (Web Root: $WEB_ROOT | Sahip: $WEB_OWNER)"
if [ "$SYNC_OK" -eq 0 ] && [ -f "${DEPLOY_KEY}.pub" ]; then
  echo " [ONEMLI] Repo ozel (private) oldugu icin asagidaki Deploy Key'i"
  echo " GitHub -> Repo Settings -> Deploy keys -> Add deploy key ekleyin:"
  echo "------------------------------------------------------------------"
  cat "${DEPLOY_KEY}.pub"
  echo "------------------------------------------------------------------"
  echo " Key eklendikten sonra 30sn icinde veya su komutla hemen senkronize olur:"
  echo "   sudo /usr/local/bin/mars-web-sync --force"
fi
echo " - Gunluk Takip: tail -f /var/log/mars-autodeploy.log"
echo "=================================================================="

# ==============================================================================
# DOSYA SATIR VE ISLEV ACIKLAMALARI (Satir Satir Ne Ise Yaradigi):
# ------------------------------------------------------------------------------
# - Satir 1-39: Kurulum parametreleri (--web-root, --repo, --webhook-secret, --github-token) ve Nginx root tespiti.
# - Satir 41-64: Ozel GitHub deposu icin Ed25519 Deploy Key veya token + webhook sudoers kurulumu.
# - Satir 66-109: /usr/local/bin/mars-web-sync, /etc/default/mars-autodeploy ve 30sn Systemd timer kurulumu.
# - Satir 111-127: Ilk senkronizasyon denemesi ve gerekirse Deploy Key ekleme bilgilendirmesi.
# ==============================================================================
