#!/usr/bin/env bash
# Build the image here, ship it to the OVH box, restart the stack. The box serves other sites, so it
# never runs `next build` itself.
#   bash deploy/deploy.sh
set -euo pipefail
HOST="${SWATCHLESS_HOST:-jonathan@51.161.82.166}"
DIR="experimental-projects/swatchless"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

docker build -t swatchless:latest "$ROOT"
ssh "$HOST" "mkdir -p ~/$DIR"
scp "$ROOT/deploy/docker-compose.yml" "$HOST:$DIR/docker-compose.yml"
docker save swatchless:latest | gzip -1 | ssh "$HOST" "gunzip | docker load"
ssh "$HOST" "cd ~/$DIR && test -f .env && docker compose up -d && docker image prune -f >/dev/null && docker compose ps"
