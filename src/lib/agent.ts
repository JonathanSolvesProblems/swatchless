/**
 * The Swatchless consult: Claude drives the YouCam MCP server to measure a customer's hair, chooses
 * what to try from three retailers' live catalogues, renders the customer wearing each choice,
 * looks at the renders, and hands the stylist a reply with cart links into the real store.
 *
 * What the model decides (and the code does not): which category fits the measured density, which
 * shades to try, which of the store's own photos to use as the try-on reference, whether a render
 * is good enough or needs redoing in the customer's own colour, and when to ask for a better photo.
 *
 * What the code enforces (and the model cannot talk its way past), in `finalize`:
 *   - every recommended item must point at a render YouCam actually returned in this consult
 *   - the variant must exist in the store's feed and be in stock right now
 *   - at most three items
 * and a unit budget: once the try-on count is reached the try-on tool is switched off.
 */
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUnion,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import sharp from "sharp";
import { allowedImageUrl } from "./guard";
import { z } from "zod";
import { findVariant, liveStock, searchCatalog, shadePalette, type Category } from "./catalog";
import { checkShortlist, type Recommendation } from "./gate";

const MODEL = "claude-opus-5-5";
const YOUCAM_MCP = "https://mcp-api-01.makeupar.com/mcp/beauty";
const TRYON_TOOL = "AI-Hair-Style-Virtual-Try-On";
const ALLOWED_YOUCAM_TOOLS = [
  "AI-Hair-Density-Detection",
  "AI-Hair-Type-Detection",
  "AI-Hair-Length-Detection",
  TRYON_TOOL,
  "AI-Hair-Color-Virtual-Try-On",
  "AI-Hair-Volume-Virtual-Try-On",
  "AI-Hair-Volume-Virtual-Try-On-Templates",
];
const MAX_TRYONS = 8;
const MAX_TURNS = 24;
const MAX_CONSULT_USD = Number(process.env.CONSULT_MAX_USD ?? 3);

export type ConsultEvent =
  | { type: "say"; text: string }
  | { type: "youcam_call"; id: string; tool: string; input: unknown }
  | { type: "youcam_result"; id: string; tool: string; ok: boolean; summary: string; images: string[] }
  | { type: "tool"; name: string; input: unknown }
  | { type: "refused"; reason: string }
  | { type: "done"; result: ConsultResult }
  | { type: "error"; message: string };

export type { Recommendation, WatchItem } from "./gate";

export interface ConsultResult {
  status: "recommended" | "needs_photo" | "stopped";
  measurements: Record<string, unknown>;
  recommendations: Recommendation[];
  message_to_customer: string;
  photo_request?: { which: string; reason: string };
  tryons_used: number;
  refusals: string[];
  /** Variants the desk wanted but refused because the store's feed showed them out of stock: the watch list. */
  watch: { variant_id: number; title: string; store: string; render_url: string | null }[];
  usage?: { input_tokens: number; output_tokens: number; cache_read_tokens: number; cache_write_tokens?: number };
}

export interface ConsultInput {
  selfieFileId: string;
  selfieDataUrl: string; // for Claude's own eyes; YouCam works from the file id
  headDownFileId?: string;
  stores?: string[];
  customerNote?: string;
  /** Benchmark only: product photos the agent may not use as references (photos of the customer being tested). */
  excludeReferences?: string[];
  /** Benchmark ablation: "no_youcam" removes every YouCam tool, so the shade is chosen from the photo and swatches alone. */
  mode?: "full" | "no_youcam";
}

const SYSTEM = `You are the colour-match desk for three online hair retailers (Luxy Hair, Halo Couture, Ellen Wille).
A stylist has forwarded a customer's photos. Your job: find the products from the stores' live catalogues that suit this
customer's hair, show the customer wearing each one using YouCam, and draft the stylist's reply.

How to work:
- Measure first with YouCam. Hair density needs the head-down photo (AI-Hair-Density-Detection). Hair type and length use the selfie.
  If a measurement fails, read the error: a face-angle or no-face error means the photo is unusable for that measurement.
- Choose the category from what you measured. Density level 1-2 (visible scalp): fill-ins, toppers or hairpieces that add
  coverage at the part and crown. Level 3-4: volume and length pieces. If there is no head-down photo, say density was not
  measured and choose from what the selfie shows, or ask for the photo when the choice genuinely depends on it.
- Look at the customer's photo and the stores' swatches (view_images) to shortlist shades that match their natural colour, roots included.
- Render with ${TRYON_TOOL}: src_file_id is the customer's selfie file id, ref_file_url is one of the product's reference_urls.
  hair_color "ref" shows the product's colour; "src" keeps the customer's own colour. Use "ref" for shade decisions.
  You have ${MAX_TRYONS} renders. Spend them on the shades you would actually recommend.
- Look at every render before recommending it (view_images). Drop a render that changed the face, failed to show the product,
  or looks wrong, and say why. If a reference photo fails, try another reference_url for the same product.
- Colour decides the shade; renders show it. A dropped render never changes which shade matches. If the best-matching shade
  has no usable render, still recommend it first, with render_url null and render_note saying why it is not shown.
- Hair type detection needs front, left and right photos; with only a front selfie, skip it and say so.
- Refer to the customer as "the customer" or "they". Never infer gender, age or ethnicity from the photo.
- Finish by calling finalize with up to three items, each tied to its render. Write the message to the customer in the
  stylist's voice: warm, plain, specific about why each shade suits them, under 120 words, no exclamation marks, no lists.
  Never claim a fit, coverage or result the render
  does not show; a render shows the finished look, not how a piece clips in.`;

const SYSTEM_NO_YOUCAM = `You are the colour-match desk for three online hair retailers (Luxy Hair, Halo Couture, Ellen Wille).
A stylist has forwarded a customer's photo. Find the products from the stores' live catalogues whose shade matches this customer's
natural hair colour, roots included, and draft the stylist's reply. You have no measurement or try-on tools: choose by looking at
the customer's photo and the stores' swatches (view_images). Finish by calling finalize with up to three items, best match first,
using an empty string for render_url and reference_url. Refer to the customer as "the customer" or "they".`;

const tools: BetaToolUnion[] = [
  {
    type: "mcp_toolset",
    mcp_server_name: "youcam",
    default_config: { enabled: false },
    configs: Object.fromEntries(ALLOWED_YOUCAM_TOOLS.map((n) => [n, { enabled: true }])),
  },
  {
    name: "show_palette",
    description:
      "List every shade on offer for the given product categories, with the store's swatch photo URL for each. Call this before choosing shades so you see the whole palette, not just the first search results.",
    input_schema: {
      type: "object",
      properties: {
        categories: { type: "array", items: { type: "string", enum: ["fill-in", "topper", "hairpiece", "bangs", "headcover"] } },
      },
      required: ["categories"],
    },
  },
  {
    name: "search_catalog",
    description:
      "Search the three stores' live catalogues. Returns products with variant_id, shade, price, stock and reference_urls (front-facing on-model photos usable as try-on references). Call this to get the exact variant and its references once you know the shade you want.",
    input_schema: {
      type: "object",
      properties: {
        categories: { type: "array", items: { type: "string", enum: ["fill-in", "topper", "hairpiece", "bangs", "headcover"] } },
        shade_contains: { type: "string", description: "Case-insensitive text matched against the shade name and title." },
        max_price: { type: "number" },
        limit: { type: "integer" },
      },
    },
  },
  {
    name: "view_images",
    description:
      "Look at up to 6 images by URL: swatches, product reference photos, or YouCam renders. Call this to compare shades with the customer's hair and to check every render before recommending it.",
    input_schema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" }, maxItems: 6 },
        purpose: { type: "string" },
      },
      required: ["urls"],
    },
  },
  {
    name: "finalize",
    description:
      "Submit the recommendation. Each item must cite the render_url YouCam returned for that product in this consult and the reference_url used. The desk checks every item against the renders and live stock and refuses any that fail.",
    input_schema: {
      type: "object",
      properties: {
        measurements: { type: "object", description: "What YouCam measured: density level, hair type, length, and any measurement that failed." },
        items: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: {
              variant_id: { type: "integer" },
              render_url: { type: ["string", "null"], description: "The YouCam render for this product, or null if every render of it was dropped." },
              reference_url: { type: ["string", "null"] },
              render_note: {
                type: "string",
                description:
                  "Required when render_url is null: why no render is shown, in one or two plain sentences a stylist reads under the swatch. No tool or parameter names.",
              },
              why: { type: "string" },
            },
            required: ["variant_id", "render_url", "reference_url", "why"],
          },
        },
        message_to_customer: { type: "string" },
      },
      required: ["measurements", "items", "message_to_customer"],
    },
  },
  {
    name: "ask_for_photo",
    description:
      "End the consult by asking the customer for a better photo, when the recommendation genuinely depends on a measurement the current photos cannot give.",
    input_schema: {
      type: "object",
      properties: {
        which: { type: "string", enum: ["selfie", "head_down"] },
        reason: { type: "string" },
        message_to_customer: { type: "string" },
      },
      required: ["which", "reason", "message_to_customer"],
    },
  },
];

const FinalizeInput = z.object({
  measurements: z.record(z.string(), z.unknown()),
  items: z
    .array(
      z.object({
        variant_id: z.number().int(),
        render_url: z.string().nullable(),
        reference_url: z.string().nullable(),
        render_note: z.string().optional(),
        why: z.string(),
      }),
    )
    .max(3),
  message_to_customer: z.string(),
});

/**
 * The app's own Claude API key, from SWATCHLESS_ANTHROPIC_API_KEY in .env.local. Deliberately not the inherited
 * ANTHROPIC_API_KEY: a shell can carry a tool's session credential under that name, and an app must never run on it.
 */
function appApiKey(): string {
  const key = process.env.SWATCHLESS_ANTHROPIC_API_KEY?.trim();
  if (!key || !key.startsWith("sk-ant-")) {
    throw new Error("Set SWATCHLESS_ANTHROPIC_API_KEY in .env.local to an Anthropic API key created for this app.");
  }
  return key;
}

/**
 * Fetch an image for Claude to look at, downscaled to 768 px. Fetching here rather than passing the URL means
 * an unreachable or expired image becomes a note the agent can work around instead of a failed request.
 */
async function viewable(url: string): Promise<string | null> {
  // Only the stores' CDNs and YouCam's result storage: a crafted customer note must not make the server fetch anything else.
  if (!allowedImageUrl(url)) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mozilla/5.0 Swatchless" } });
    if (!res.ok) return null;
    const out = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize(768, 768, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

function textOf(content: string | { type: string; text?: string }[]): string {
  return typeof content === "string" ? content : content.map((b) => b.text ?? "").join("\n");
}

function urlsIn(text: string): string[] {
  return [...new Set(text.match(/https:\/\/[^\s"'\\)]+/g) ?? [])].filter((u) => /\.(jpe?g|png|webp)(\?|$)/i.test(u));
}

export async function runConsult(input: ConsultInput, emit: (e: ConsultEvent) => void): Promise<ConsultResult> {
  const client = new Anthropic({ apiKey: appApiKey() });
  const renders = new Map<string, { reference: string | null }>(); // render url -> reference used
  const pendingTryons = new Map<string, string | null>(); // mcp tool_use id -> reference url
  const refusals: string[] = [];
  const watch: ConsultResult["watch"] = [];
  let tryons = 0;
  const ablation = input.mode === "no_youcam";
  const exclude = new Set(input.excludeReferences ?? []);
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 };
  const withUsage = (r: Omit<ConsultResult, "watch"> & { watch?: ConsultResult["watch"] }): ConsultResult => ({ ...r, watch, usage });

  const intro: BetaContentBlockParam[] = [
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: input.selfieDataUrl.split(",")[1] } },
    {
      type: "text",
      text: [
        `Customer selfie (shown above). YouCam file id for the selfie: ${input.selfieFileId}`,
        input.headDownFileId
          ? `Head-down photo for density, YouCam file id: ${input.headDownFileId}`
          : "No head-down photo was provided, so density cannot be measured.",
        input.customerNote ? `The customer wrote: "${input.customerNote}"` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
  const messages: BetaMessageParam[] = [{ role: "user", content: intro }];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const toolset = tools
      .filter((t) => !(ablation && "type" in t && t.type === "mcp_toolset"))
      .map((t) =>
        "type" in t && t.type === "mcp_toolset" && tryons >= MAX_TRYONS
          ? { ...t, configs: { ...t.configs, [TRYON_TOOL]: { enabled: false } } }
          : t,
      );
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      system: ablation ? SYSTEM_NO_YOUCAM : SYSTEM,
      // Each turn resends the whole conversation, photos included; caching bills the repeated part at a twentieth.
      cache_control: { type: "ephemeral" },
      betas: ["mcp-client-2025-11-20", "server-side-fallback-2026-07-01"],
      fallbacks: "default",
      mcp_servers: ablation ? [] : [{ type: "url", url: YOUCAM_MCP, name: "youcam", authorization_token: process.env.YOUCAM_API_KEY }],
      tools: toolset,
      messages,
    });
    const message = await stream.finalMessage();
    usage.input_tokens += message.usage.input_tokens;
    usage.output_tokens += message.usage.output_tokens;
    usage.cache_read_tokens += message.usage.cache_read_input_tokens ?? 0;
    usage.cache_write_tokens += message.usage.cache_creation_input_tokens ?? 0;
    const spent = (usage.input_tokens * 4 + usage.output_tokens * 20 + usage.cache_read_tokens * 0.2 + usage.cache_write_tokens * 5) / 1e6;
    if (spent > MAX_CONSULT_USD) {
      // A hard stop, so one consult can never run away with the budget.
      emit({ type: "error", message: `This consult reached its $${MAX_CONSULT_USD} spending cap and stopped before finishing.` });
      return withUsage({ status: "stopped", measurements: {}, recommendations: [], message_to_customer: "", tryons_used: tryons, refusals });
    }
    messages.push({ role: "assistant", content: message.content as BetaContentBlockParam[] });

    for (const block of message.content as BetaContentBlock[]) {
      if (block.type === "text" && block.text.trim()) emit({ type: "say", text: block.text });
      if (block.type === "mcp_tool_use") {
        emit({ type: "youcam_call", id: block.id, tool: block.name, input: block.input });
        if (block.name === TRYON_TOOL) {
          tryons++;
          const ref = (block.input as { request?: { ref_file_url?: string } })?.request?.ref_file_url ?? null;
          pendingTryons.set(block.id, ref);
        }
      }
      if (block.type === "mcp_tool_result") {
        const text = textOf(block.content);
        const images = block.is_error ? [] : urlsIn(text);
        const tool = pendingTryons.has(block.tool_use_id) ? TRYON_TOOL : "youcam";
        if (tool === TRYON_TOOL && images.length && !/"task_status"\s*:\s*"error"/.test(text)) {
          for (const u of images) renders.set(u, { reference: pendingTryons.get(block.tool_use_id) ?? null });
        }
        emit({ type: "youcam_result", id: block.tool_use_id, tool, ok: !block.is_error && !/error_/.test(text), summary: text.slice(0, 600), images });
      }
    }

    if (message.stop_reason === "refusal") {
      emit({ type: "error", message: "The model declined this request." });
      return withUsage({ status: "stopped", measurements: {}, recommendations: [], message_to_customer: "", tryons_used: tryons, refusals });
    }
    if (message.stop_reason === "pause_turn") continue;
    if (message.stop_reason === "max_tokens") {
      // A cut-off reply is not an answer, and a cut-off tool input must never run.
      emit({ type: "error", message: "The reply was cut off before the consult finished." });
      break;
    }
    if (message.stop_reason !== "tool_use") break; // end_turn without finalize: the consult stopped without a recommendation

    const calls = message.content.filter((b): b is Extract<BetaContentBlock, { type: "tool_use" }> => b.type === "tool_use");

    const results: BetaToolResultBlockParam[] = [];
    let finished: ConsultResult | null = null;

    for (const call of calls) {
      emit({ type: "tool", name: call.name, input: call.input });
      const args = call.input as Record<string, unknown>;

      if (call.name === "show_palette") {
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(shadePalette(args.categories as Category[], input.stores, exclude)) });
      } else if (call.name === "search_catalog") {
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: JSON.stringify(searchCatalog({ ...(args as object), stores: input.stores, exclude })),
        });
      } else if (call.name === "view_images") {
        const urls = ((args.urls as string[]) ?? []).slice(0, 6);
        const loaded = await Promise.all(urls.map(viewable));
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: loaded.flatMap((img, i) =>
            img
              ? [
                  { type: "text" as const, text: `Image ${i + 1}: ${urls[i]}` },
                  { type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data: img } },
                ]
              : [{ type: "text" as const, text: `Image ${i + 1} could not be loaded (${urls[i]}). Use another image.` }],
          ),
        });
      } else if (call.name === "ask_for_photo") {
        finished = {
          status: "needs_photo",
          measurements: {},
          recommendations: [],
          message_to_customer: String(args.message_to_customer ?? ""),
          photo_request: { which: String(args.which), reason: String(args.reason) },
          tryons_used: tryons,
          refusals,
          watch,
        };
        results.push({ type: "tool_result", tool_use_id: call.id, content: "Sent to the stylist." });
      } else if (call.name === "finalize") {
        const parsed = FinalizeInput.safeParse(args);
        if (!parsed.success) {
          results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Invalid finalize input: ${parsed.error.message}` });
          continue;
        }
        const { accepted, problems, watch: outOfStock } = await checkShortlist(parsed.data.items, {
          renders,
          ablation,
          lookup: findVariant,
          stock: liveStock,
        });
        for (const w of outOfStock) if (!watch.some((x) => x.variant_id === w.variant_id)) watch.push(w);
        if (problems.length) {
          for (const p of problems) {
            refusals.push(p);
            emit({ type: "refused", reason: p });
          }
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            is_error: true,
            content: `Refused: ${problems.join("; ")}. Fix these items (render them, or choose an in-stock product) and call finalize again.`,
          });
          continue;
        }
        finished = {
          status: "recommended",
          measurements: parsed.data.measurements,
          recommendations: accepted,
          message_to_customer: parsed.data.message_to_customer,
          tryons_used: tryons,
          refusals,
          watch,
        };
        results.push({ type: "tool_result", tool_use_id: call.id, content: "Accepted." });
      } else {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Unknown tool ${call.name}` });
      }
    }

    messages.push({ role: "user", content: results });
    if (finished) {
      const done = withUsage(finished);
      emit({ type: "done", result: done });
      return done;
    }
  }

  const stopped: ConsultResult = { status: "stopped", measurements: {}, recommendations: [], message_to_customer: "", tryons_used: tryons, refusals, watch };
  emit({ type: "done", result: withUsage(stopped) });
  return withUsage(stopped);
}
