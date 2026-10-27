import { describe, expect, it } from "vitest";
import { allowedImageUrl, configFromEnv, decide, visitorId, type GuardConfig, type LedgerEntry } from "./guard";

const now = new Date("2026-10-27T15:00:00Z");
const cfg = (over: Partial<GuardConfig> = {}): GuardConfig => ({
  production: true,
  accessCode: "rings",
  perVisitorPerHour: 3,
  maxConcurrent: 2,
  dailyConsults: 15,
  dailyUsd: 25,
  ...over,
});
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({ id: Math.random().toString(16), at: at(30), visitor: "v1", ended: true, usd: 0.5, ...over });

describe("the live-consult guard", () => {
  it("lets a visitor with the code through on a quiet day", () => {
    expect(decide(cfg(), [], "v1", "rings", now)).toEqual({ ok: true });
  });

  it("fails closed in production when no access code is configured", () => {
    const v = decide(cfg({ accessCode: undefined }), [], "v1", undefined, now);
    expect(v).toMatchObject({ ok: false, status: 503 });
  });

  it("allows local development without a code", () => {
    expect(decide(cfg({ production: false, accessCode: undefined }), [], "v1", undefined, now)).toEqual({ ok: true });
  });

  it("refuses a wrong or missing code", () => {
    expect(decide(cfg(), [], "v1", "guess", now)).toMatchObject({ ok: false, status: 403 });
    expect(decide(cfg(), [], "v1", undefined, now)).toMatchObject({ ok: false, status: 403 });
  });

  it("limits one visitor per hour but not another", () => {
    const ledger = [entry({ at: at(10) }), entry({ at: at(20) }), entry({ at: at(50) })];
    expect(decide(cfg(), ledger, "v1", "rings", now)).toMatchObject({ ok: false, status: 429 });
    expect(decide(cfg(), ledger, "v2", "rings", now)).toEqual({ ok: true });
    const older = [entry({ at: at(10) }), entry({ at: at(20) }), entry({ at: at(70) })];
    expect(decide(cfg(), older, "v1", "rings", now)).toEqual({ ok: true });
  });

  it("caps consults running at the same time, ignoring ones stuck for over ten minutes", () => {
    const running = [entry({ visitor: "a", at: at(1), ended: false }), entry({ visitor: "b", at: at(2), ended: false })];
    expect(decide(cfg(), running, "v1", "rings", now)).toMatchObject({ ok: false, status: 429 });
    const stale = [entry({ visitor: "a", at: at(15), ended: false }), entry({ visitor: "b", at: at(2), ended: false })];
    expect(decide(cfg(), stale, "v1", "rings", now)).toEqual({ ok: true });
  });

  it("caps consults per day, counting ones that failed half way", () => {
    const ledger = Array.from({ length: 15 }, (_, i) => entry({ visitor: `x${i}`, at: at(60 + i), usd: undefined }));
    expect(decide(cfg(), ledger, "v1", "rings", now)).toMatchObject({ ok: false, status: 429 });
  });

  it("caps Claude dollars per day", () => {
    const ledger = Array.from({ length: 5 }, (_, i) => entry({ visitor: `x${i}`, at: at(90 + i), usd: 5.1 }));
    expect(decide(cfg(), ledger, "v1", "rings", now)).toMatchObject({ ok: false, status: 429 });
  });

  it("starts each day fresh", () => {
    const yesterday = Array.from({ length: 15 }, (_, i) => entry({ visitor: `x${i}`, at: "2026-10-26T12:00:00Z", usd: 3 }));
    expect(decide(cfg(), yesterday, "v1", "rings", now)).toEqual({ ok: true });
  });

  it("counts the day in Toronto, so an evening visit still sees that afternoon's consults", () => {
    const evening = new Date("2026-10-28T01:00:00Z"); // 21:00 on Oct 27 in Toronto, already Oct 28 in UTC
    const afternoon = Array.from({ length: 15 }, (_, i) => entry({ visitor: `x${i}`, at: "2026-10-27T18:00:00Z", usd: 0.5 }));
    expect(decide(cfg(), afternoon, "v1", "rings", evening)).toMatchObject({ ok: false, status: 429 });
  });

  it("names the real concurrency cap", () => {
    const running = [entry({ visitor: "a", at: at(1), ended: false })];
    expect(decide(cfg({ maxConcurrent: 1 }), running, "v1", "rings", now)).toMatchObject({ reason: expect.stringMatching(/^A consult is already running/) });
  });

  it("hashes visitors without keeping the IP", () => {
    const id = visitorId("203.0.113.7", "salt");
    expect(id).toHaveLength(16);
    expect(id).not.toContain("203");
    expect(visitorId("203.0.113.7", "salt")).toBe(id);
    expect(visitorId("203.0.113.8", "salt")).not.toBe(id);
  });

  it("reads its limits from the environment with safe defaults", () => {
    const c = configFromEnv({ NODE_ENV: "production", CONSULT_ACCESS_CODE: " rings ", CONSULT_DAILY_USD: "10" } as NodeJS.ProcessEnv);
    expect(c).toMatchObject({ production: true, accessCode: "rings", dailyUsd: 10, dailyConsults: 15, perVisitorPerHour: 3, maxConcurrent: 2 });
  });
});

describe("which images the agent may have the server fetch", () => {
  it("allows the stores' CDNs and YouCam's result storage", () => {
    expect(allowedImageUrl("https://cdn.shopify.com/s/files/1/0066/0052/files/swatch.jpg")).toBe(true);
    expect(allowedImageUrl("https://yce-us.s3-accelerate.amazonaws.com/ttl30/x/render.jpg?sig=1")).toBe(true);
    expect(allowedImageUrl("https://www.ellenwille.com/cdn/shop/files/a.jpg")).toBe(true);
  });

  it("refuses anything else, including internal addresses and plain http", () => {
    expect(allowedImageUrl("http://cdn.shopify.com/a.jpg")).toBe(false);
    expect(allowedImageUrl("https://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(allowedImageUrl("https://localhost:3210/api/files/x/selfie.jpg")).toBe(false);
    expect(allowedImageUrl("https://evil.example/cdn.shopify.com/a.jpg")).toBe(false);
    expect(allowedImageUrl("https://cdn.shopify.com.evil.example/a.jpg")).toBe(false);
    expect(allowedImageUrl("not a url")).toBe(false);
  });
});
