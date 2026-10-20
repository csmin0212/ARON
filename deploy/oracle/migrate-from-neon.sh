#!/usr/bin/env bash
# Neon → 서버 Postgres 통째 복사. 돌릴 때마다 서버 DB 를 Neon 내용으로 '덮어쓴다'.
# 시험 복사 때 한 번, 실제 전환 직전(Neon 쓰기를 멈춘 뒤)에 한 번 더 돌린다.
#   sudo NEON_URL='postgresql://...' /usr/local/lib/aron/migrate-from-neon.sh
set -euo pipefail
: "${NEON_URL:?NEON_URL 이 필요합니다}"
# pg_dump 는 풀러(pgbouncer)를 거치면 안 된다 — 직결 주소로 바꾼다.
NEON_URL="${NEON_URL/-pooler./.}"
BASE=/srv/aron
PW="$(cat "$BASE/shared/.dbpass")"
LOCAL="postgresql://aron:$PW@localhost:5432/aron"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "== Neon 덤프"
pg_dump "$NEON_URL" -Fc --no-owner --no-acl -f "$TMP/neon.dump"
cp "$TMP/neon.dump" "$BASE/backups/neon-$(date -u +%Y%m%d-%H%M).dump"

echo "== 서버 DB 교체"
systemctl stop aron 2>/dev/null || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -q \
  -c "DROP DATABASE IF EXISTS aron WITH (FORCE);" \
  -c "CREATE DATABASE aron OWNER aron;"
pg_restore --no-owner --no-acl -d "$LOCAL" "$TMP/neon.dump"
[ -L "$BASE/current" ] && systemctl start aron

echo "== 행 수 대조"
bad=0
for t in $(psql "$LOCAL" -Atc "select tablename from pg_tables where schemaname = 'public' order by 1"); do
  a="$(psql "$NEON_URL" -Atc "select count(*) from \"$t\"")"
  b="$(psql "$LOCAL" -Atc "select count(*) from \"$t\"")"
  if [ "$a" != "$b" ]; then echo "  다름 $t: neon=$a server=$b"; bad=1; fi
done
[ "$bad" = 0 ] && echo "  모든 테이블 행 수 일치" || { echo "  ↑ 차이 있음 (복사 중 Neon 에 새 기록이 생겼을 수 있음)"; exit 1; }
