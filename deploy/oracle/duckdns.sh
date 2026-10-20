#!/usr/bin/env bash
# DuckDNS 주소를 이 서버의 공인 IP 로 맞춘다 (ip 를 비우면 요청한 쪽 IP 로 기록된다).
set -euo pipefail
# shellcheck disable=SC1091
. /etc/aron/duckdns.env
res="$(curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip=")"
[ "$res" = "OK" ] || { echo "DuckDNS 갱신 실패: $res"; exit 1; }
