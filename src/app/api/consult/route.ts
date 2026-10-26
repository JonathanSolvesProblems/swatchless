import sharp from "sharp";
import { runConsult, type ConsultEvent } from "@/lib/agent";
import { admit, finish, visitorId } from "@/lib/guard";
import { DEMO_DISCLOSURE, isDemoCustomer, saveConsult } from "@/lib/store";
import { uploadImage, YouCamError } from "@/lib/youcam";

export const maxDuration = 300;

const MAX_UPLOAD = 10 * 1024 * 1024; // per photo, YouCam's own limit
const MAX_NOTE = 1000;
const PRICE = { input: 4 / 1e6, output: 20 / 1e6, cache_read: 0.2 / 1e6, cache_write: 5 / 1e6 }; // Claude Opus 5.5

async function prepare(file: File): Promise<Buffer> {
  // YouCam's hair tools want the long side at or under 1024 px. sharp also rejects anything that is not an image.
  return sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000 })
    .rotate()
    .resize(1024, 1024, { fit: "inside" })
    .jpeg({ quality: 90 })
    .toBuffer();
}

function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] ?? request.headers.get("x-real-ip") ?? "local").trim();
}

/** POST multipart: selfie (required), head_down (optional), note (optional), access_code. Streams consult events as SSE. */
export async function POST(request: Request) {
  // Refuse oversized bodies before reading them.
  if (Number(request.headers.get("content-length") ?? 0) > 2 * MAX_UPLOAD + 64 * 1024) {
    return Response.json({ error: "Photos are limited to 10 MB each." }, { status: 413 });
  }
  const form = await request.formData();
  const selfie = form.get("selfie");
  const headDown = form.get("head_down");
  const noteRaw = form.get("note");
  const note = typeof noteRaw === "string" ? noteRaw.slice(0, MAX_NOTE) : undefined;
  if (!(selfie instanceof File) || selfie.size === 0) {
    return Response.json({ error: "A selfie is required." }, { status: 400 });
  }
  if (selfie.size > MAX_UPLOAD || (headDown instanceof File && headDown.size > MAX_UPLOAD)) {
    return Response.json({ error: "Photos are limited to 10 MB each." }, { status: 413 });
  }

  // Every live consult spends real money: the guard decides before any paid call, and records the start.
  const code = form.get("access_code");
  const visitor = visitorId(clientIp(request), process.env.CONSULT_SALT ?? process.env.CRON_SECRET ?? "swatchless");
  const { verdict, id: ledgerId } = await admit(visitor, typeof code === "string" ? code.trim() : undefined);
  if (!verdict.ok) return Response.json({ error: verdict.reason }, { status: verdict.status });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: ConsultEvent | { type: "photos"; selfie: string; head_down?: string; disclosure?: string }) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      let usd = 0;
      // The agent can think for 40 s without an event; a comment frame keeps proxies from closing the stream.
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), 15_000);
      try {
        let selfieJpeg: Buffer;
        let headJpeg: Buffer | undefined;
        try {
          selfieJpeg = await prepare(selfie);
          headJpeg = headDown instanceof File && headDown.size > 0 ? await prepare(headDown) : undefined;
        } catch {
          send({ type: "error", message: "That file could not be read as a photo. Use a JPG or PNG." });
          return;
        }
        const [selfieFileId, headDownFileId] = await Promise.all([
          uploadImage(selfieJpeg),
          headJpeg ? uploadImage(headJpeg) : Promise.resolve(undefined),
        ]);
        const selfieDataUrl = `data:image/jpeg;base64,${selfieJpeg.toString("base64")}`;
        send({
          type: "photos",
          selfie: selfieDataUrl,
          head_down: headJpeg ? `data:image/jpeg;base64,${headJpeg.toString("base64")}` : undefined,
          ...((await isDemoCustomer(selfieJpeg)) && { disclosure: DEMO_DISCLOSURE }),
        });
        const events: ConsultEvent[] = [];
        const result = await runConsult({ selfieFileId, selfieDataUrl, headDownFileId, customerNote: note }, (e) => {
          events.push(e);
          send(e);
        });
        const u = result.usage;
        if (u) usd = u.input_tokens * PRICE.input + u.output_tokens * PRICE.output + u.cache_read_tokens * PRICE.cache_read + (u.cache_write_tokens ?? 0) * PRICE.cache_write;
        const id = await saveConsult({ result, events, selfie: selfieJpeg, headDown: headJpeg, note: note ?? "" });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "saved", id })}\n\n`));
      } catch (err) {
        const message = err instanceof YouCamError ? `YouCam: ${err.message}` : err instanceof Error ? err.message : String(err);
        send({ type: "error", message });
      } finally {
        clearInterval(heartbeat);
        if (ledgerId) await finish(ledgerId, usd).catch(() => undefined);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
