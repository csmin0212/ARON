#!/usr/bin/env bash
# 매일 DB 덤프. 서버 안에 14일치 보관하고, 업로드 주소가 있으면 서버 밖(Object Storage)에도 올린다.
# 서버가 통째로 날아가면 서버 안 백업도 같이 사라지므로 업로드 주소 설정을 권장.
#   업로드 주소: Object Storage 버킷의 '사전 인증 요청(쓰기)' URL 을 /srv/aron/shared/backup-par-url 에 한 줄로.
set -euo pipefail
BASE=/srv/aron
DIR="$BASE/backups"
PW="$(cat "$BASE/shared/.dbpass")"
F="$DIR/aron-$(date -u +%Y%m%d-%H%M).dump"

PGPASSWORD="$PW" pg_dump -h localhost -U aron -Fc -Z 6 -f "$F.tmp" aron
mv "$F.tmp" "$F"
ls -1t "$DIR"/aron-*.dump | tail -n +15 | xargs -r rm -f
echo "백업: $F ($(du -h "$F" | cut -f1))"

if [ -s "$BASE/shared/backup-par-url" ]; then
  URL="$(tr -d '[:space:]' < "$BASE/shared/backup-par-url")"
  curl -fsS -T "$F" "${URL%/}/$(basename "$F")" >/dev/null
  echo "업로드 완료"
fi
