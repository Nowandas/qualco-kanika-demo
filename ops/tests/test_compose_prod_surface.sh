#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

has_key_in_service() {
  local service="$1"
  local key="$2"
  awk -v service="$service" -v key="$key" '
    /^[[:space:]]{2}[a-zA-Z0-9_-]+:[[:space:]]*$/ {
      name=$1
      sub(":", "", name)
      in_service=(name==service)
      next
    }

    in_service && $1 == (key ":") {
      found=1
    }

    END {
      exit(found ? 0 : 1)
    }
  ' "$COMPOSE_FILE"
}

has_bind_mounts_for_service() {
  local service="$1"
  awk -v service="$service" '
    /^[[:space:]]{2}[a-zA-Z0-9_-]+:[[:space:]]*$/ {
      name=$1
      sub(":", "", name)
      in_service=(name==service)
      in_volumes=0
      next
    }

    in_service && /^[[:space:]]{4}volumes:[[:space:]]*$/ {
      in_volumes=1
      next
    }

    in_service && /^[[:space:]]{4}[a-zA-Z0-9_-]+:[[:space:]]*$/ {
      in_volumes=0
    }

    in_service && in_volumes && /^[[:space:]]{6}-[[:space:]]*(\.\/|\/)/ {
      found=1
    }

    END {
      exit(found ? 0 : 1)
    }
  ' "$COMPOSE_FILE"
}

if has_key_in_service "mongo" "ports"; then
  echo "FAIL: mongo service exposes host ports in docker-compose.yml."
  exit 1
fi
echo "PASS: mongo service has no host port mapping in docker-compose.yml."

for service in backend frontend; do
  if has_bind_mounts_for_service "$service"; then
    echo "FAIL: $service service has bind mounts in docker-compose.yml."
    exit 1
  fi
  echo "PASS: $service service has no bind mounts in docker-compose.yml."
done
