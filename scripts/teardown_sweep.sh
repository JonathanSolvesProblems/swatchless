#!/usr/bin/env bash
# Lists everything this account still holds on Vercel that could belong to Swatchless.
# Run once right after the first deployment (proves it works) and again after teardown (must show nothing).
#   bash scripts/teardown_sweep.sh
set -u
command -v vercel >/dev/null 2>&1 || { echo "vercel CLI not installed: npm i -g vercel"; exit 1; }
echo "== account"; vercel whoami || exit 1
echo "== projects (look for swatchless)"; vercel project ls 2>/dev/null | grep -i -E "swatchless|youcam" || echo "none"
echo "== deployments"; vercel ls swatchless 2>/dev/null | head -20 || echo "none"
echo "== blob stores"; vercel blob store ls 2>/dev/null || echo "none, or no blob access"
echo "== domains"; vercel domains ls 2>/dev/null | grep -i swatchless || echo "none"
echo "== done. Anything listed above for swatchless must be deleted on 2026-11-20."
