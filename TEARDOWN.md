# Teardown

Judging closes **2026-11-20 11:45 EST**. Everything paid is released on that date; the scheduled reminder for it is
created in the submission session (not this file) and confirmed in the schedule list.

## What exists and what to do

| Resource | Where | On teardown |
|---|---|---|
| Hosting (Vercel project, plus Blob store if used) | Vercel account | Delete the project and the Blob store. Verify from outside: the URL must 404. |
| Cron for `/api/watch` | `vercel.json` | Goes with the project. |
| YouCam API key | yce.makeupar.com console | Revoke; it sat on an internet-facing box. The hackathon grant expires anyway. |
| Anthropic API key for the app | console.anthropic.com | Revoke `SWATCHLESS_ANTHROPIC_API_KEY`. |
| `CRON_SECRET` | Vercel env | Goes with the project. |
| DNS | none planned | If a subdomain was pointed at the deployment, delete the record first. |
| Consult records (customer photos) | Blob store or `.consults/` on the host | Delete with the project. The composite demo customer is not a real person; the Luxy test consult used a published product photo. |

## Sweep

`scripts/teardown_sweep.sh` lists everything the account still holds on Vercel. Run it once right after the first
deployment, so it is known to work while the credentials are live, and again after teardown, where it must print
nothing for this project.

## What stays, at zero cost

The public GitHub repo, the demo video on YouTube, the Devpost page, and the README with an archive banner saying
the hackathon is over and the deployment is gone. Screenshots of every page live in `docs/screenshots/`.
