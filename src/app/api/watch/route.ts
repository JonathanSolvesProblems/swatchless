import { runWatch } from "@/lib/watch";

export const maxDuration = 300;

/**
 * The scheduled pass (a daily cron hits this). Guarded by CRON_SECRET so a visitor cannot spend YouCam units.
 * GET with header `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Not authorised" }, { status: 401 });
  }
  return Response.json(await runWatch());
}
