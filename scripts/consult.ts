/**
 * Run one consult from the command line and print every step.
 *   pnpm tsx --env-file=.env.local scripts/consult.ts <selfie.jpg> [head-down.jpg] [--note "..."]
 * Writes the full event log and result to tmp/consults/<timestamp>.json.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { runConsult, type ConsultEvent } from "../src/lib/agent";
import { saveConsult } from "../src/lib/store";
import { unitBalance, uploadImage } from "../src/lib/youcam";

async function prepare(file: string): Promise<Buffer> {
  // YouCam's hair tools want the long side at or under 1024 px; a fixed size also keeps runs comparable.
  return sharp(file).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const noteAt = args.indexOf("--note");
  const note = noteAt >= 0 ? args[noteAt + 1] : undefined;
  const files = args.filter((a, i) => !a.startsWith("--") && (noteAt < 0 || i !== noteAt + 1));
  const [selfiePath, headDownPath] = files;
  if (!selfiePath) throw new Error("usage: consult.ts <selfie.jpg> [head-down.jpg] [--note text]");

  const before = await unitBalance();
  const selfie = await prepare(selfiePath);
  const selfieFileId = await uploadImage(selfie);
  const headDown = headDownPath ? await prepare(headDownPath) : undefined;
  const headDownFileId = headDown ? await uploadImage(headDown) : undefined;

  const events: ConsultEvent[] = [];
  const t0 = Date.now();
  const result = await runConsult(
    { selfieFileId, selfieDataUrl: `data:image/jpeg;base64,${selfie.toString("base64")}`, headDownFileId, customerNote: note },
    (e) => {
      events.push(e);
      const s = (Date.now() - t0) / 1000;
      if (e.type === "say") console.log(`[${s.toFixed(0)}s] ${e.text}`);
      else if (e.type === "youcam_call") console.log(`[${s.toFixed(0)}s] YouCam ${e.tool} ${JSON.stringify(e.input)}`);
      else if (e.type === "youcam_result") console.log(`[${s.toFixed(0)}s]   -> ${e.ok ? "ok" : "FAILED"} ${e.summary.slice(0, 200)}`);
      else if (e.type === "tool") console.log(`[${s.toFixed(0)}s] tool ${e.name} ${JSON.stringify(e.input).slice(0, 200)}`);
      else if (e.type === "refused") console.log(`[${s.toFixed(0)}s] REFUSED ${e.reason}`);
      else if (e.type === "error") console.log(`[${s.toFixed(0)}s] ERROR ${e.message}`);
    },
  );
  const after = await unitBalance();
  const out = path.join(process.cwd(), "tmp", "consults", `${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ result, events, units_spent: before - after, seconds: (Date.now() - t0) / 1000 }, null, 1));
  const id = await saveConsult({ result, events, selfie, headDown, note: note ?? "" });
  console.log("\nRESULT", JSON.stringify(result, null, 1));
  console.log(`saved consult ${id}: /consult/${id}`);
  console.log(`units spent ${before - after}, ${((Date.now() - t0) / 1000).toFixed(0)} s, log ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
