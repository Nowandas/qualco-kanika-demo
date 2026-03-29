#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

check_non_root() {
  local service="$1"
  local uid
  uid="$(docker compose -f docker-compose.yml run --rm --no-deps --entrypoint id "$service" -u | tr -d '\r')"

  if [[ "$uid" == "0" ]]; then
    echo "FAIL: service '$service' runs as root (uid=0)."
    exit 1
  fi

  echo "PASS: service '$service' runs as non-root (uid=$uid)."
}

check_non_root "backend"
check_non_root "frontend"
