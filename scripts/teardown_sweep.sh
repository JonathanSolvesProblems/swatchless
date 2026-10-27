#!/usr/bin/env bash
# Lists everything on the OVH box that belongs to Swatchless.
# Run once right after the first deployment (proves it works) and again after teardown (must show nothing).
#   bash scripts/teardown_sweep.sh
set -u
HOST="${SWATCHLESS_HOST:-jonathan@51.161.82.166}"
ssh -o BatchMode=yes "$HOST" '
echo "== containers"; docker ps -a --filter name=swatchless --format "{{.Names}} {{.Status}}" | grep . || echo none
echo "== images"; docker images swatchless --format "{{.Repository}}:{{.Tag}} {{.Size}}" | grep . || echo none
echo "== volumes"; docker volume ls --format "{{.Name}}" | grep swatchless || echo none
echo "== stack folder"; ls -d ~/experimental-projects/swatchless 2>/dev/null || echo none
' || exit 1
for h in swatchless.jonathansolvesproblems.com swatchless.jonathanandrei.com; do
  echo "== $h"; echo "  https: $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://$h/ || echo 'no answer')"
  echo "  dns:   $(nslookup $h 1.1.1.1 2>/dev/null | awk '/^Address/ && !/#/ {print $2}' | tail -n +2 | grep . || echo none)"
done
echo "== done. Anything listed above must be gone on 2026-11-20, and the A record deleted from the domain's DNS."
