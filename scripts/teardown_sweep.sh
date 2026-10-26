#!/usr/bin/env bash
# Lists everything this account still holds on Fly.io that could belong to Swatchless.
# Run once right after the first deployment (proves it works) and again after teardown (must show nothing).
#   bash scripts/teardown_sweep.sh [app-name]
set -u
APP="${1:-swatchless}"
FLY=$(command -v flyctl || command -v fly) || { echo "flyctl not installed"; exit 1; }
echo "== account"; "$FLY" auth whoami || exit 1
echo "== apps (look for $APP)"; "$FLY" apps list 2>/dev/null | grep -i -E "$APP|swatchless" || echo "none"
echo "== machines"; "$FLY" machines list -a "$APP" 2>/dev/null || echo "none"
echo "== volumes"; "$FLY" volumes list -a "$APP" 2>/dev/null || echo "none"
echo "== ips"; "$FLY" ips list -a "$APP" 2>/dev/null || echo "none"
echo "== certs"; "$FLY" certs list -a "$APP" 2>/dev/null || echo "none"
echo "== done. Anything listed above for $APP must be destroyed on 2026-11-20 (fly apps destroy $APP)."
