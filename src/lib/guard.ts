/**
 * Abuse guard for live consults. Every consult spends real money on two paid APIs (Claude and YouCam), so a public
 * deployment has to fail closed. Checked before any paid call:
 *   - an access code, required whenever NODE_ENV is production (no code configured = no live consults)
 *   - a per-visitor rate limit, keyed on a hash of the IP (the raw IP is never stored)
 *   - a cap on consults running at the same time
 *   - daily caps on consults started and on Claude dollars spent, from a ledger of every consult started,
 *     so a consult that fails half way still counts
 * The ledger is one JSON line per consult in CONSULT_DIR/_ledger.jsonl.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface GuardConfig {
  production: boolean;
  accessCode: string | undefined;
  perVisitorPerHour: number;
  maxConcurrent: number;
  dailyConsults: number;
  dailyUsd: number;
}

export interface LedgerEntry {
  id: string;
  at: string; // ISO time the consult started
  visitor: string; // sha256 of the IP and a salt, first 16 hex chars
  usd?: number; // Claude cost, written when the consult ends
  ended?: boolean;
}

export type Verdict = { ok: true } | { ok: false; status: number; reason: string };

export function configFromEnv(env: NodeJS.ProcessEnv = process.env): GuardConfig {
  const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
  return {
    production: env.NODE_ENV === "production",
    accessCode: env.CONSULT_ACCESS_CODE?.trim() || undefined,
    perVisitorPerHour: num(env.CONSULT_PER_VISITOR_PER_HOUR, 3),
    maxConcurrent: num(env.CONSULT_MAX_CONCURRENT, 2),
    dailyConsults: num(env.CONSULT_DAILY_LIMIT, 15),
    dailyUsd: num(env.CONSULT_DAILY_USD, 25),
  };
}

export function visitorId(ip: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

const deskDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });

/** The decision, pure: given the config, the ledger, who is asking and when. */
export function decide(cfg: GuardConfig, ledger: LedgerEntry[], visitor: string, code: string | undefined, now: Date): Verdict {
  if (cfg.production && !cfg.accessCode) {
    return { ok: false, status: 503, reason: "Live consults are switched off on this deployment. Saved consults are open to everyone." };
  }
  if (cfg.accessCode && code !== cfg.accessCode) {
    return { ok: false, status: 403, reason: "Live consults need the access code from the testing instructions. Saved consults are open to everyone." };
  }
  const t = now.getTime();
  const running = ledger.filter((e) => !e.ended && t - Date.parse(e.at) < 10 * 60_000).length;
  if (running >= cfg.maxConcurrent) {
    const n = cfg.maxConcurrent === 1 ? "A consult is" : `${cfg.maxConcurrent} consults are`;
    return { ok: false, status: 429, reason: `${n} already running. Try again in a couple of minutes.` };
  }
  const lastHour = ledger.filter((e) => e.visitor === visitor && t - Date.parse(e.at) < 3_600_000).length;
  if (lastHour >= cfg.perVisitorPerHour) {
    return { ok: false, status: 429, reason: `That's ${cfg.perVisitorPerHour} live consults from you this hour. Saved consults are still open.` };
  }
  // "Today" is the desk's day in Toronto, so the cap resets at local midnight, as "try again tomorrow" promises.
  const today = deskDay(now);
  const todays = ledger.filter((e) => deskDay(new Date(e.at)) === today);
  if (todays.length >= cfg.dailyConsults) {
    return { ok: false, status: 429, reason: `Today's ${cfg.dailyConsults} live consults have been used. Saved consults are still open; try again tomorrow.` };
  }
  const spent = todays.reduce((s, e) => s + (e.usd ?? 0), 0);
  if (spent >= cfg.dailyUsd) {
    return { ok: false, status: 429, reason: "Today's spending cap for live consults has been reached. Saved consults are still open; try again tomorrow." };
  }
  return { ok: true };
}

const DIR = process.env.CONSULT_DIR ? path.resolve(/*turbopackIgnore: true*/ process.env.CONSULT_DIR) : path.join(process.cwd(), ".consults");
const LEDGER = path.join(/*turbopackIgnore: true*/ DIR, "_ledger.jsonl");

export async function readLedger(): Promise<LedgerEntry[]> {
  try {
    const text = await fs.readFile(LEDGER, "utf8");
    const byId = new Map<string, LedgerEntry>();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line) as LedgerEntry;
        byId.set(e.id, { ...byId.get(e.id), ...e });
      } catch {
        // a torn last line from a crash is skipped, not fatal
      }
    }
    return [...byId.values()];
  } catch {
    return [];
  }
}

async function append(e: Partial<LedgerEntry> & { id: string }) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.appendFile(LEDGER, JSON.stringify(e) + "\n");
}

/** Check and, if allowed, record the start in one step, so two requests cannot both slip under a cap. */
let queue: Promise<unknown> = Promise.resolve();
export function admit(visitor: string, code: string | undefined, cfg = configFromEnv()): Promise<{ verdict: Verdict; id?: string }> {
  const run = queue.then(async () => {
    const verdict = decide(cfg, await readLedger(), visitor, code, new Date());
    if (!verdict.ok) return { verdict };
    const id = crypto.randomBytes(6).toString("hex");
    await append({ id, at: new Date().toISOString(), visitor });
    return { verdict, id };
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function finish(id: string, usd: number) {
  await append({ id, usd: Math.round(usd * 1000) / 1000, ended: true });
}

/** Hosts the agent may ask the server to fetch images from: the three stores' CDNs and YouCam's result storage. */
const IMAGE_HOSTS = [/(^|\.)cdn\.shopify\.com$/, /(^|\.)luxyhair\.com$/, /(^|\.)halocouture\.com$/, /(^|\.)ellenwille\.com$/, /^yce-[a-z0-9-]+\.s3[a-z0-9.-]*\.amazonaws\.com$/];
export function allowedImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && IMAGE_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}
