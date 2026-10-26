#!/bin/sh
# Production entry: put the seeded demo consult on the volume (once), then serve.
set -e
DIR="${CONSULT_DIR:-/data/consults}"
mkdir -p "$DIR"
for d in seed/consults/*/; do
  id=$(basename "$d")
  [ -d "$DIR/$id" ] || cp -r "$d" "$DIR/$id"
done
exec node_modules/.bin/next start -p "${PORT:-8080}"
