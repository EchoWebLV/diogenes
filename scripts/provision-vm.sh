#!/usr/bin/env bash
# Run as root on a fresh Ubuntu 24.04 box (Hetzner CX43 / DO droplet / Contabo).
set -euo pipefail

APP_USER="${APP_USER:-groklius}"
APP_DIR="${APP_DIR:-/opt/groklius}"
REPO="${REPO:-https://github.com/EchoWebLV/diogenes.git}"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git ufw fail2ban \
  libnss3 libnspr4 libatk-bridge2.0-0 libdrm2 libxkbcommon0 libgbm1 \
  libasound2t64 libxshmfence1 fonts-liberation

if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id -u "$APP_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$APP_USER"
mkdir -p "$APP_DIR"
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

sudo -u "$APP_USER" bash -lc "cd '$APP_DIR' && npm install && npx playwright install chromium"

cat >/etc/systemd/system/groklius.service <<EOF
[Unit]
Description=groklius rack
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=4173
Environment=DATA_DIR=$APP_DIR/data
Environment=AGENT_ENABLED=0
EnvironmentFile=-$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable groklius
ufw allow OpenSSH
ufw allow 4173/tcp
ufw --force enable

echo
echo "VM ready. Next:"
echo "  1. put XAI_API_KEY / SOLANA_RPC_URL / PUBLIC_URL in $APP_DIR/.env"
echo "  2. systemctl start groklius          # rack only, no spend"
echo "  3. AGENT_ENABLED=1 in .env then systemctl restart groklius   # live"
echo "  4. point a domain at this box (caddy / cloudflare)"
