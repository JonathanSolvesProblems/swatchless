/**
 * YouCam (Perfect Corp) REST calls the agent does not make itself: uploading the customer's
 * photos once, and reading the unit balance. Every analysis and try-on runs through the YouCam
 * MCP server, driven by Claude (see agent.ts).
 *
 * Server-side only: the key is a bearer credential with spend attached.
 *
 * Behaviours verified against the live API (2026-10-07 and 2026-10-25), several absent from the docs:
 *   - the success envelope key varies by endpoint: `data`, `result` or `results`
 *   - a failed task reports its code in `error`, not `error_code`
 *   - the balance is a list of separately expiring grants; the spendable figure is their sum
 *   - failed tasks (no face, bad angle) cost nothing; a hair transfer costs 2 units
 */

const BASE = (process.env.YOUCAM_API_BASE ?? "https://yce-api-01.makeupar.com").replace(/\/$/, "");

export class YouCamError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) {
    super(message);
    this.name = "YouCamError";
  }
}

function key(): string {
  const k = process.env.YOUCAM_API_KEY;
  if (!k) throw new YouCamError("YOUCAM_API_KEY is not set (see .env.example).");
  return k;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const text = await res.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text);
  } catch {
    throw new YouCamError(`YouCam returned non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`, undefined, res.status);
  }
  if (!res.ok || (typeof body.status === "number" && body.status >= 400)) {
    const code = (body.error_code ?? body.errorCode ?? body.error) as string | undefined;
    throw new YouCamError(String(body.message ?? body.error ?? `YouCam request failed: ${path}`), code, res.status);
  }
  return (body.data ?? body.result ?? body.results ?? body) as T;
}

interface FileTarget {
  file_id: string;
  requests: { url: string; method?: string; headers?: Record<string, string> }[];
}

/**
 * Reserve a file id, then PUT the bytes to the presigned URL. The id is valid for every YouCam
 * feature on this account, including calls the agent makes through the MCP server.
 */
export async function uploadImage(bytes: Uint8Array, contentType = "image/jpeg"): Promise<string> {
  if (bytes.byteLength > 10 * 1024 * 1024) throw new YouCamError("Image is over the 10 MB limit.");
  const data = await call<{ files: FileTarget[] }>("/s2s/v2.0/file/hair-transfer", {
    method: "POST",
    body: JSON.stringify({ files: [{ content_type: contentType, file_name: "photo.jpg", file_size: bytes.byteLength }] }),
  });
  const target = data.files?.[0];
  const put = target?.requests?.[0];
  if (!target || !put) throw new YouCamError("YouCam did not return an upload target.");
  const res = await fetch(put.url, {
    method: put.method ?? "PUT",
    headers: put.headers ?? { "Content-Type": contentType },
    body: new Uint8Array(bytes).buffer as ArrayBuffer,
  });
  if (!res.ok) throw new YouCamError(`Presigned upload failed (HTTP ${res.status}).`, undefined, res.status);
  return target.file_id;
}

/** Spendable units across every grant on the account. */
export async function unitBalance(): Promise<number> {
  const grants = await call<{ amount?: number }[]>("/s2s/v1.0/client/credit", { method: "GET" });
  return Array.isArray(grants) ? grants.reduce((sum, g) => sum + (g.amount ?? 0), 0) : 0;
}
