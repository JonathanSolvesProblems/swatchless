# Deploying

The app is a Next.js 16 site with three server-side needs: a YouCam key, an Anthropic API key for the agent, and
somewhere on disk to keep consults (customer photos, renders, the agent log). That last one decides the host.

## Option A: a host with a persistent disk (simplest for this app)

Fly.io, Railway or any VPS. Set `CONSULT_DIR` to a mounted volume. Run `pnpm build && pnpm start`. Schedule the daily
watch pass with the host's cron, hitting `GET /api/watch` with `Authorization: Bearer $CRON_SECRET`.

## Option B: Vercel

`vercel.json` already schedules `/api/watch` daily, and Vercel sends `CRON_SECRET` as the bearer token itself. But
Vercel functions have no persistent disk, so `src/lib/store.ts` would need a Blob-backed implementation before
saved consults survive a deploy. That adapter is not written; it is about an hour of work plus `BLOB_READ_WRITE_TOKEN`.

## Environment

```
YOUCAM_API_KEY=                 # yce.makeupar.com console
YOUCAM_API_BASE=https://yce-api-01.makeupar.com
SWATCHLESS_ANTHROPIC_API_KEY=   # an Anthropic API key (sk-ant-api...), created for this app
CONSULT_DIR=/data/consults      # a persistent path
CRON_SECRET=                    # any long random string
```

## After the first deploy

1. Run one live consult on the deployed URL and open its saved page the next day: the renders must still load.
2. Run `bash scripts/teardown_sweep.sh` once so it is known to work while the credentials are live.
3. Copy the demo consult (`.consults/2026-10-26-9be25561`) into `CONSULT_DIR` so the home page opens on it.
