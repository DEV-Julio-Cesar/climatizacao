#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR=/opt/climasaas
APP_USER=climasaas
APP_HOST=${APP_HOST:-13-58-212-142.nip.io}
REPO_URL=${REPO_URL:-https://github.com/DEV-Julio-Cesar/climatizacao.git}

if [[ ${EUID} -ne 0 ]]; then
  echo "Execute com sudo: sudo bash scripts/deploy-ec2-ubuntu.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git nginx postgresql postgresql-contrib certbot python3-certbot-nginx

if ! command -v node >/dev/null || [[ $(node -p 'Number(process.versions.node.split(".")[0])') -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
git -C "$APP_DIR" fetch origin master
git -C "$APP_DIR" checkout master
git -C "$APP_DIR" pull --ff-only origin master

DB_PASSWORD_FILE=/root/.climasaas-db-password
if [[ ! -f "$DB_PASSWORD_FILE" ]]; then
  openssl rand -hex 24 > "$DB_PASSWORD_FILE"
  chmod 600 "$DB_PASSWORD_FILE"
fi
DB_PASSWORD=$(<"$DB_PASSWORD_FILE")

sudo -u postgres psql -v ON_ERROR_STOP=1 --set=db_password="$DB_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE climasaas LOGIN PASSWORD %L', :'db_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='climasaas')\gexec
SELECT 'CREATE DATABASE clima_saas OWNER climasaas'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='clima_saas')\gexec
ALTER DATABASE clima_saas OWNER TO climasaas;
SQL

ENV_FILE="$APP_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  JWT_SECRET=$(openssl rand -hex 48)
  DATA_SECRET=$(openssl rand -hex 48)
  FILE_SECRET=$(openssl rand -hex 48)
  EMAIL_SECRET=$(openssl rand -hex 48)
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
APP_URL=https://${APP_HOST}
CORS_ORIGIN=https://${APP_HOST}
DATABASE_URL=postgresql://climasaas:${DB_PASSWORD}@127.0.0.1:5432/clima_saas
DB_SSL_REJECT_UNAUTHORIZED=false
JWT_SECRET=${JWT_SECRET}
DATA_ENCRYPTION_SECRET=${DATA_SECRET}
FILE_URL_SECRET=${FILE_SECRET}
EMAIL_QUEUE_SECRET=${EMAIL_SECRET}
PASSWORD_RESET_URL=https://${APP_HOST}/painel/
EOF
  chmod 600 "$ENV_FILE"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" npm --prefix "$APP_DIR" ci --omit=dev
sudo -u "$APP_USER" npm --prefix "$APP_DIR/web" ci
sudo -u "$APP_USER" npm --prefix "$APP_DIR/web" run build
sudo -u "$APP_USER" npm --prefix "$APP_DIR" run migrate

cat > /etc/systemd/system/climasaas.service <<EOF
[Unit]
Description=ClimaSaaS API
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${APP_DIR}/tmp
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/nginx/sites-available/climasaas <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${APP_HOST};
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }
}
EOF

ln -sfn /etc/nginx/sites-available/climasaas /etc/nginx/sites-enabled/climasaas
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl daemon-reload
systemctl enable --now postgresql climasaas nginx

if [[ -n ${LETSENCRYPT_EMAIL:-} ]]; then
  certbot --nginx --non-interactive --agree-tos --redirect -m "$LETSENCRYPT_EMAIL" -d "$APP_HOST"
else
  certbot --nginx --non-interactive --agree-tos --redirect --register-unsafely-without-email -d "$APP_HOST"
fi

systemctl restart climasaas nginx
curl --fail --silent --show-error "https://${APP_HOST}/health/ready"
echo
echo "Deploy concluído: https://${APP_HOST}/painel"
