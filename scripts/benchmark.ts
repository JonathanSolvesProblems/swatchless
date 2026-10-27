/**
 * Swatchless against Luxy's own stylists.
 *
 * For each real customer in data/benchmark/luxy-truth.json, run the consult on Luxy's own "before" photo of
 * them, with every photo of that customer excluded from the references, and compare the desk's first pick
 * with the shade Luxy put on them. Two arms:
 *   full       Claude with the YouCam MCP tools (measure, try on, look at the renders)
 *   no_youcam  Claude alone, choosing from the photo and the swatches
 *
 *   pnpm tsx --env-file=.env.local scripts/benchmark.ts [--limit N] [--arms full,no_youcam] [--only luxy-01,luxy-02]
 * Results append to data/benchmark/results.json; a re-run skips finished (item, arm) pairs.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { consultUsd, runConsult, type ConsultEvent } from "../src/lib/agent";
import { unitBalance, uploadImage } from "../src/lib/youcam";

const ROOT = path.resolve(__dirname, "..");
const TRUTH = path.join(ROOT, "data", "benchmark", "luxy-truth.json");
const OUT = path.join(ROOT, "data", "benchmark", "results.json");
const NOTE = "I already know which product I want. I just need to know which shade matches my natural hair colour.";

interface Item {
  id: string;
  shade: string;
  before_photo: string;
  exclude_references: string[];
  /** False when every trusted photo of this shade is of this customer, so the desk cannot be offered it. */
  shade_offerable: boolean;
}

const norm = (s: string) => s.toLowerCase().replace(/^(classic|seamless)\s+/, "").trim();

async function main() {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const arms = (opt("--arms") ?? "full,no_youcam").split(",") as ("full" | "no_youcam")[];
  const only = opt("--only")?.split(",");
  const limit = Number(opt("--limit") ?? Infinity);
  // A hard stop on Claude spend for this session, checked before every run.
  const maxUsd = Number(opt("--max-usd") ?? 30);
  let spent = 0;
  const truth: Item[] = JSON.parse(fs.readFileSync(TRUTH, "utf8")).items;
  const results: Record<string, unknown>[] = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : [];
  const done = new Set(results.map((r) => `${r.id}:${r.arm}`));

  const items = truth.filter((t) => !only || only.includes(t.id)).slice(0, limit);
  for (const item of items) {
    const photo = await sharp(Buffer.from(await (await fetch(item.before_photo)).arrayBuffer()))
      .rotate()
      .resize(1024, 1024, { fit: "inside" })
      .jpeg({ quality: 90 })
      .toBuffer();
    for (const arm of arms) {
      if (spent >= maxUsd) {
        console.log(`Stopping: $${spent.toFixed(2)} spent this session, ceiling $${maxUsd}. Re-run to continue.`);
        break;
      }
      if (done.has(`${item.id}:${arm}`)) continue;
      const units0 = await unitBalance();
      const fileId = arm === "full" ? await uploadImage(photo) : "not-uploaded";
      const events: ConsultEvent[] = [];
      const t0 = Date.now();
      let result;
      try {
        result = await runConsult(
          {
            selfieFileId: fileId,
            selfieDataUrl: `data:image/jpeg;base64,${photo.toString("base64")}`,
            customerNote: NOTE,
            stores: ["luxy"],
            excludeReferences: item.exclude_references,
            mode: arm,
          },
          (e) => events.push(e),
        );
      } catch (err) {
        // Not recorded: an API failure is not an abstention. A re-run retries this (item, arm).
        console.log(`${item.id} ${arm} ERROR, skipped for retry: ${err instanceof Error ? err.message.slice(0, 160) : err}`);
        continue;
      }
      const picks = result.recommendations.map((r) => r.shade);
      const u = result.usage ?? { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0 };
      const row = {
        id: item.id,
        arm,
        truth: item.shade,
        status: result.status,
        picks,
        shade_offerable: item.shade_offerable,
        top1: picks.length > 0 && norm(picks[0]) === norm(item.shade),
        in_shortlist: picks.some((p) => norm(p) === norm(item.shade)),
        tryons: result.tryons_used,
        refusals: result.refusals,
        youcam_units: units0 - (await unitBalance()),
        usd_claude: +consultUsd(u).toFixed(3),
        seconds: Math.round((Date.now() - t0) / 1000),
        usage: u,
        measurements: result.measurements,
        reasons: result.recommendations.map((r) => r.why),
        leaked_reference: result.recommendations.some((r) => item.exclude_references.includes(r.reference_url ?? "")),
        ran_at: new Date().toISOString(),
      };
      spent += row.usd_claude;
      results.push(row);
      fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
      console.log(`${item.id} ${arm.padEnd(9)} truth=${item.shade} picks=${picks.join(" | ") || "-"} top1=${row.top1} $${row.usd_claude} units=${row.youcam_units} ${row.seconds}s`);
    }
  }

  for (const arm of arms) {
    const rows = results.filter((r) => r.arm === arm && r.shade_offerable);
    const n = rows.length;
    const t1 = rows.filter((r) => r.top1).length;
    const sl = rows.filter((r) => r.in_shortlist).length;
    const impossible = results.filter((r) => r.arm === arm && !r.shade_offerable).length;
    console.log(`${arm}: top pick matched Luxy's stylists ${t1}/${n}, in shortlist ${sl}/${n} (${impossible} customers whose shade could not be offered, not counted)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
