#!/usr/bin/env bash
# main 에 새 커밋이 있으면 릴리스 폴더에 받아 빌드 → current 링크 교체 → 재시작.
# 빌드는 돌고 있는 서버와 다른 폴더에서 하므로 배포 중에도 사이트는 멈추지 않는다.
# 새 버전이 안 뜨면 이전 릴리스로 되돌린다.
#   sudo /usr/local/lib/aron/deploy.sh           (바뀐 게 있을 때만)
#   sudo /usr/local/lib/aron/deploy.sh --force   (같은 커밋도 다시)
set -euo pipefail
BASE=/srv/aron
REPO=https://github.com/csmin0212/ARON.git
BRANCH=main
FORCE="${1:-}"

exec 9>/run/aron-deploy.lock
flock -n 9 || { echo "이미 배포 중"; exit 0; }

as_aron() { runuser -u aron -- "$@"; }

REMOTE="$(git ls-remote "$REPO" "refs/heads/$BRANCH" | cut -f1)"
[ -n "$REMOTE" ] || { echo "원격 조회 실패"; exit 1; }
PREV="$(readlink -f "$BASE/current" 2>/dev/null || true)"
FAILED_MARK="$BASE/shared/.failed-commit"

if [ "$FORCE" != "--force" ]; then
  [ -n "$PREV" ] && [ "$(basename "$PREV")" = "$REMOTE" ] && exit 0
  # 빌드가 깨진 커밋을 2분마다 다시 빌드하지 않는다 — 다음 커밋이 오거나 --force 일 때만.
  [ -f "$FAILED_MARK" ] && [ "$(cat "$FAILED_MARK")" = "$REMOTE" ] && exit 0
fi
if grep -q "__FILL__" "$BASE/shared/.env"; then
  echo "$BASE/shared/.env 에 __FILL__ 칸이 남아 있음"; exit 1
fi

TMP="$BASE/releases/.building"
rm -rf "$TMP"
trap 'echo "$REMOTE" > "$FAILED_MARK"; rm -rf "$TMP"; echo "배포 실패: $REMOTE"' ERR

echo "== $REMOTE 받는 중"
as_aron git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$TMP"
SHA="$(as_aron git -C "$TMP" rev-parse HEAD)"
as_aron ln -s "$BASE/shared/.env" "$TMP/.env"
cd "$TMP"

echo "== 의존성 (postinstall 이 prisma generate)"
as_aron npm ci --no-audit --no-fund --loglevel=error
echo "== 스키마 반영"
as_aron npx prisma db push --skip-generate
echo "== 빌드"
as_aron npm run build

REL="$BASE/releases/$SHA"
cd /
rm -rf "$REL"
mv "$TMP" "$REL"
trap - ERR
ln -sfn "$REL" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"
systemctl restart aron

ok=""
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/; then ok=1; break; fi
  sleep 2
done
if [ -z "$ok" ]; then
  echo "$SHA" > "$FAILED_MARK"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$BASE/current.new" && mv -T "$BASE/current.new" "$BASE/current"
    systemctl restart aron
    echo "새 버전이 안 떠서 이전 릴리스로 되돌림: $(basename "$PREV")"
  fi
  exit 1
fi
rm -f "$FAILED_MARK"

# 배포 스크립트도 새 버전으로 (다음 실행부터 적용)
install -m 755 "$REL"/deploy/oracle/*.sh /usr/local/lib/aron/

# 최근 3개 릴리스만 남긴다 (current 는 지우지 않음)
CUR="$(readlink -f "$BASE/current")"
ls -1dt "$BASE"/releases/*/ 2>/dev/null | sed 's#/$##' | tail -n +4 | while read -r old; do
  [ "$old" = "$CUR" ] || rm -rf "$old"
done
echo "배포 완료: $SHA"
