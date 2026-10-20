# Oracle Cloud 서버 운영

Vercel + Neon 에서 옮긴 자체 서버. 사이트·DB 가 한 서버(Ubuntu 24.04 ARM, 2 OCPU / 12GB)에 있다.

| 항목 | 내용 |
|---|---|
| 주소 | https://aron-gallery.duckdns.org (Caddy 가 HTTPS 자동 발급) |
| 앱 | `aron.service` — `/srv/aron/current` 에서 `next start` (127.0.0.1:3000) |
| DB | Postgres 18, DB·계정 `aron`, 비밀번호 `/srv/aron/shared/.dbpass` |
| 환경변수 | `/srv/aron/shared/.env` (릴리스마다 링크) |
| 배포 | `aron-deploy.timer` 가 2분마다 main 확인 → 새 커밋이면 빌드·교체. 안 뜨면 이전 릴리스로 롤백 |
| 백업 | `aron-backup.timer` 매일 04:00 KST, `/srv/aron/backups` 14일치. `shared/backup-par-url` 이 있으면 Object Storage 에도 업로드 |

## 처음 설치

```bash
git clone --depth 1 https://github.com/csmin0212/ARON.git /tmp/aron
sudo DOMAIN=aron-gallery.duckdns.org DUCKDNS_TOKEN=... bash /tmp/aron/deploy/oracle/setup.sh
# /srv/aron/shared/.env 의 __FILL__ 채우기
sudo NEON_URL='...' /usr/local/lib/aron/migrate-from-neon.sh
sudo /usr/local/lib/aron/deploy.sh --force
sudo systemctl enable --now aron-deploy.timer
```

Oracle 콘솔에서 서브넷 보안 목록에 TCP 80·443 수신 규칙도 열어야 한다 (서버 iptables 는 setup.sh 가 연다).

## 자주 쓰는 명령

```bash
sudo /usr/local/lib/aron/deploy.sh --force     # 지금 바로 다시 배포
journalctl -u aron-deploy -n 100               # 배포 로그
journalctl -u aron -f                          # 앱 로그
sudo systemctl restart aron                    # 앱 재시작
sudo -u aron /usr/local/lib/aron/backup.sh     # 지금 백업
```

## 백업에서 되살리기

```bash
sudo systemctl stop aron
sudo -u postgres psql -c "DROP DATABASE aron WITH (FORCE);" -c "CREATE DATABASE aron OWNER aron;"
pg_restore --no-owner -d "postgresql://aron:$(sudo cat /srv/aron/shared/.dbpass)@localhost/aron" /srv/aron/backups/aron-YYYYMMDD-HHMM.dump
sudo systemctl start aron
```
