# Teardown

Judging closes **2026-11-20 11:45 EST**. Everything paid is released on that date; the scheduled reminder for it is
created in the submission session (not this file) and confirmed in the schedule list.

## What exists and what to do

| Resource | Where | On teardown |
|---|---|---|
| Hosting (Fly app, machine, 1 GB volume) | Fly.io account | `fly apps destroy <app>` releases the machine, the volume and the IPs together. Verify from outside: the URL must stop answering. |
| Cron for `/api/watch` | `.github/workflows/watch.yml` | Delete the `SWATCHLESS_URL` variable and `CRON_SECRET` secret in the repo; the job then skips. |
| YouCam API key | yce.makeupar.com console | Revoke; it sat on an internet-facing box. The hackathon grant expires anyway. |
| Anthropic API key for the app | console.anthropic.com | Revoke `SWATCHLESS_ANTHROPIC_API_KEY`. |
| `CRON_SECRET` | Fly secrets, GitHub secret | Goes with the app; delete the GitHub secret. |
| DNS | none planned | If a subdomain was pointed at the deployment, delete the record first. |
| Consult records (customer photos) | the Fly volume | Destroyed with the app. The composite demo customer is not a real person. |

## Sweep

`scripts/teardown_sweep.sh` lists everything the account still holds on Fly.io. Run it once right after the first
deployment, so it is known to work while the credentials are live, and again after teardown, where it must print
nothing for this project.

## What stays, at zero cost

The public GitHub repo, the demo video on YouTube, the Devpost page, and the README with an archive banner saying
the hackathon is over and the deployment is gone. Screenshots of every page live in `docs/screenshots/`.
