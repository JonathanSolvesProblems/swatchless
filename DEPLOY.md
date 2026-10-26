# Deploying

The app is a Next.js 16 site with three server-side needs: a YouCam key, an Anthropic API key for the agent, and
somewhere on disk to keep consults (customer photos, renders, the agent log, the spending ledger). It runs as one
container on a VPS behind an existing Traefik, with a named volume at `/data`.

## Where it runs

The OVH box at `51.161.82.166`, in `~/experimental-projects/swatchless/`:

```
docker-compose.yml   copied from deploy/docker-compose.yml
.env                 secrets, chmod 600
```

Public at `https://swatchless.jonathanandrei.com` (an A record to the box; Traefik issues the certificate).

## Deploy or update

```
bash deploy/deploy.sh
```

It builds the image locally, ships it over SSH with `docker save | docker load`, and restarts the stack.
`scripts/start.sh` copies the demo consult in `seed/consults/` onto the volume on first boot, so the home page
opens on it.

## The .env on the box

```
YOUCAM_API_KEY=
YOUCAM_API_BASE=https://yce-api-01.makeupar.com
SWATCHLESS_ANTHROPIC_API_KEY=
CONSULT_ACCESS_CODE=          # not the local one
CRON_SECRET=                  # long random string
CONSULT_DAILY_LIMIT=15
CONSULT_DAILY_USD=25
CONSULT_MAX_USD=3
```

## The daily watch pass

`.github/workflows/watch.yml` calls `GET /api/watch` once a day with `Authorization: Bearer $CRON_SECRET`. In the
GitHub repo set the variable `SWATCHLESS_URL` and the secret `CRON_SECRET` (same value as on the box).

## After the first deploy

1. Run one live consult on the deployed URL and open its saved page the next day: the renders must still load.
2. Run `bash scripts/teardown_sweep.sh` once so it is known to work while the credentials are live.
