# Deploying

The app is a Next.js 16 site with three server-side needs: a YouCam key, an Anthropic API key for the agent, and
somewhere on disk to keep consults (customer photos, renders, the agent log, the spending ledger). That last one
decides the host: it runs on Fly.io with a 1 GB volume mounted at `/data`.

## First deploy

```
fly auth login
fly launch --no-deploy --copy-config --name <app-name>   # keeps fly.toml; if swatchless is taken, also change SITE_URL in fly.toml
fly volumes create consults --size 1 --region yyz
fly secrets set YOUCAM_API_KEY=... YOUCAM_API_BASE=https://yce-api-01.makeupar.com \
  SWATCHLESS_ANTHROPIC_API_KEY=... CONSULT_ACCESS_CODE=<a new code> CRON_SECRET=<long random string> \
  CONSULT_DAILY_LIMIT=15 CONSULT_DAILY_USD=25 CONSULT_MAX_USD=3
fly deploy
```

`scripts/start.sh` copies the demo consult in `seed/consults/` onto the volume on first boot, so the home page
opens on it. The machine stops when idle and starts on the next request.

## The daily watch pass

`.github/workflows/watch.yml` calls `GET /api/watch` once a day with `Authorization: Bearer $CRON_SECRET`. In the
GitHub repo set the variable `SWATCHLESS_URL` (the deployed URL) and the secret `CRON_SECRET` (same value as on Fly).

## After the first deploy

1. Run one live consult on the deployed URL and open its saved page the next day: the renders must still load.
2. Run `bash scripts/teardown_sweep.sh` once so it is known to work while the credentials are live.
