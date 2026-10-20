#!/usr/bin/env bash
# Oracle Cloud(Ubuntu 24.04, ARM) 서버 1회 설치.
#   sudo DOMAIN=aron-gallery.duckdns.org DUCKDNS_TOKEN=... bash setup.sh
# 다시 돌려도 안전하다 (있는 건 건너뛰고 설정만 다시 쓴다).
set -euo pipefail
: "${DOMAIN:?DOMAIN 이 필요합니다}"
: "${DUCKDNS_TOKEN:?DUCKDNS_TOKEN 이 필요합니다}"

BASE=/srv/aron
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive

echo "== 패키지"
apt-get update -y
apt-get install -y curl ca-certificates gnupg git build-essential openssl \
  netfilter-persistent iptables-persistent debian-keyring debian-archive-keyring apt-transport-https

# Node 22 — Next 16 은 20.9 이상
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Postgres 18 (PGDG) — Neon 이 18 이라 메이저를 맞춘다. pg_dump 가 서버보다 낮으면 덤프가 거부된다.
if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
fi
apt-get install -y postgresql-18

# Caddy — HTTPS 인증서 자동 발급·갱신
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

echo "== 방화벽 (80/443)"
# Oracle Ubuntu 이미지는 iptables 끝에 REJECT 가 있어서, 클라우드 보안 목록을 열어도 여기서 막힌다.
for port in 80 443; do
  if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
    n=$(iptables -L INPUT --line-numbers | awk '$2=="REJECT"{print $1; exit}')
    if [ -n "$n" ]; then
      iptables -I INPUT "$n" -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    else
      iptables -A INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  fi
done
netfilter-persistent save

echo "== 앱 계정·폴더"
id aron >/dev/null 2>&1 || useradd --system --create-home --home-dir "$BASE" --shell /bin/bash aron
install -d -o aron -g aron "$BASE" "$BASE/releases" "$BASE/shared" "$BASE/backups"

echo "== Postgres"
PW_FILE="$BASE/shared/.dbpass"
if [ ! -f "$PW_FILE" ]; then
  openssl rand -hex 24 > "$PW_FILE"
fi
chown aron:aron "$PW_FILE"; chmod 600 "$PW_FILE"
PW="$(cat "$PW_FILE")"
sudo -u postgres psql -v ON_ERROR_STOP=1 -q <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'aron') THEN
    CREATE ROLE aron LOGIN PASSWORD '$PW';
  ELSE
    ALTER ROLE aron PASSWORD '$PW';
  END IF;
END \$\$;
SQL
sudo -u postgres psql -Atc "SELECT 1 FROM pg_database WHERE datname = 'aron'" | grep -q 1 \
  || sudo -u postgres createdb -O aron aron
install -m 644 "$HERE/postgres-aron.conf" /etc/postgresql/18/main/conf.d/aron.conf
systemctl restart postgresql

echo "== .env"
ENVF="$BASE/shared/.env"
if [ ! -f "$ENVF" ]; then
  cat > "$ENVF" <<EOF
DATABASE_URL="postgresql://aron:$PW@localhost:5432/aron"
AUTH_SECRET="__FILL__"
GM_USERNAMES="__FILL__"
WORLD_SHEET_ID="__FILL__"
GOOGLE_SERVICE_ACCOUNT_JSON='__FILL__'
EOF
fi
chown aron:aron "$ENVF"; chmod 600 "$ENVF"

echo "== DuckDNS"
install -d -m 700 /etc/aron
printf 'DUCKDNS_DOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "${DOMAIN%.duckdns.org}" "$DUCKDNS_TOKEN" > /etc/aron/duckdns.env
chmod 600 /etc/aron/duckdns.env

echo "== 스크립트·서비스"
install -d /usr/local/lib/aron
install -m 755 "$HERE"/*.sh /usr/local/lib/aron/
install -m 644 "$HERE"/systemd/*.service "$HERE"/systemd/*.timer /etc/systemd/system/
sed "s/__DOMAIN__/$DOMAIN/" "$HERE/Caddyfile" > /etc/caddy/Caddyfile
systemctl daemon-reload
/usr/local/lib/aron/duckdns.sh
systemctl enable --now aron-duckdns.timer aron-backup.timer
systemctl enable aron.service
systemctl restart caddy

echo
echo "설치 끝. 다음:"
echo "  1) $ENVF 의 __FILL__ 칸 채우기"
echo "  2) sudo NEON_URL='...' /usr/local/lib/aron/migrate-from-neon.sh   (DB 복사)"
echo "  3) sudo /usr/local/lib/aron/deploy.sh --force                     (첫 배포)"
echo "  4) sudo systemctl enable --now aron-deploy.timer                  (자동 배포 켜기)"
