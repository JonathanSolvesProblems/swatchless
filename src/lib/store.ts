/**
 * Consult records: the customer's profile, every render, and the agent's full log.
 *
 * YouCam's result URLs expire after 7,200 seconds, but the reply email and the restock watcher need
 * the renders for weeks, so each render is copied into the consult's own folder when it is saved.
 */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import type { ConsultEvent, ConsultResult } from "./agent";

const DIR = process.env.CONSULT_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.CONSULT_DIR) : path.join(process.cwd(), ".consults");

const DEMO_SELFIE = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "demo", "customer.jpg");
export const DEMO_DISCLOSURE =
  "Composite customer for the demo: both photos are AI-generated, not a real person. Everything after them is a live run: YouCam's measurements and try-ons, the three stores' real catalogues.";

async function thumb(image: Buffer): Promise<Buffer> {
  return sharp(image).rotate().resize(16, 16, { fit: "fill" }).greyscale().raw().toBuffer();
}

/**
 * True when the selfie is the AI-generated demo customer, judged from the pixels rather than from
 * anything the browser says, so a real customer's photo can never be labelled as generated.
 */
export async function isDemoCustomer(selfie: Buffer): Promise<boolean> {
  try {
    const [a, b] = await Promise.all([thumb(selfie), fs.readFile(DEMO_SELFIE).then(thumb)]);
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
    return diff / a.length < 4;
  } catch {
    return false;
  }
}

export interface StoredConsult {
  id: string;
  created: string;
  note: string;
  result: ConsultResult;
  events: ConsultEvent[];
  /** Local file names for each recommendation's render, in the same order as result.recommendations. */
  render_files: (string | null)[];
  has_head_down: boolean;
  follow_ups?: FollowUp[];
  /** Shown under the photo, e.g. that the customer is an AI-generated composite used for the demo. */
  disclosure?: string;
}

export interface FollowUp {
  variant_id: number;
  at: string;
  result: ConsultResult;
  render_file?: string | null;
}

export async function saveConsult(input: { result: ConsultResult; events: ConsultEvent[]; selfie: Buffer; headDown?: Buffer; note: string }) {
  const id = `${new Date().toISOString().slice(0, 10)}-${crypto.randomBytes(4).toString("hex")}`;
  const dir = path.join(/*turbopackIgnore: true*/ DIR, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "selfie.jpg"), input.selfie);
  if (input.headDown) await fs.writeFile(path.join(dir, "head-down.jpg"), input.headDown);

  const render_files: (string | null)[] = [];
  for (const [i, rec] of input.result.recommendations.entries()) {
    if (!rec.render_url) {
      render_files.push(null);
      continue;
    }
    try {
      const res = await fetch(rec.render_url);
      if (!res.ok) throw new Error(String(res.status));
      const name = `render-${i + 1}.jpg`;
      await fs.writeFile(path.join(dir, name), Buffer.from(await res.arrayBuffer()));
      render_files.push(name);
    } catch {
      render_files.push(null); // the record says so rather than pointing at an expired URL
    }
  }

  const record: StoredConsult = {
    id,
    created: new Date().toISOString(),
    note: input.note,
    result: input.result,
    events: input.events,
    render_files,
    has_head_down: Boolean(input.headDown),
    ...((await isDemoCustomer(input.selfie)) && { disclosure: DEMO_DISCLOSURE }),
  };
  await fs.writeFile(path.join(dir, "consult.json"), JSON.stringify(record, null, 1));
  return id;
}

export async function loadConsult(id: string): Promise<StoredConsult | null> {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(/*turbopackIgnore: true*/ DIR, id, "consult.json"), "utf8"));
  } catch {
    return null;
  }
}

export async function listConsults(): Promise<StoredConsult[]> {
  try {
    const ids = (await fs.readdir(DIR)).filter((d) => /^[\w-]+$/.test(d));
    const all = await Promise.all(ids.map(loadConsult));
    // Ids carry random hex after the date, so only the timestamp gives the real order.
    return all.filter((c): c is StoredConsult => c !== null).sort((a, b) => b.created.localeCompare(a.created));
  } catch {
    return [];
  }
}

export async function readConsultFile(id: string, name: string): Promise<Buffer | null> {
  if (!/^[\w-]+$/.test(id) || !/^[\w.-]+\.jpg$/.test(name)) return null;
  try {
    return await fs.readFile(path.join(/*turbopackIgnore: true*/ DIR, id, name));
  } catch {
    return null;
  }
}

/** Append a watch-list follow-up to its consult, copying the new render before YouCam's URL expires. */
export async function saveFollowUp(id: string, fu: FollowUp) {
  const record = await loadConsult(id);
  if (!record) throw new Error(`No consult ${id}`);
  const dir = path.join(/*turbopackIgnore: true*/ DIR, id);
  const rec = fu.result.recommendations[0];
  let render_file: string | null = null;
  if (rec?.render_url) {
    try {
      const res = await fetch(rec.render_url);
      if (res.ok) {
        render_file = `follow-up-${(record.follow_ups?.length ?? 0) + 1}.jpg`;
        await fs.writeFile(path.join(dir, render_file), Buffer.from(await res.arrayBuffer()));
      }
    } catch {
      render_file = null;
    }
  }
  record.follow_ups = [...(record.follow_ups ?? []), { ...fu, render_file }];
  await fs.writeFile(path.join(dir, "consult.json"), JSON.stringify(record, null, 1));
}
