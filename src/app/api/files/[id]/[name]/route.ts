import { readConsultFile } from "@/lib/store";

/** Serves a saved consult's selfie and renders (YouCam's own URLs expire after two hours). */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[id]/[name]">) {
  const { id, name } = await ctx.params;
  const file = await readConsultFile(id, name);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
}
