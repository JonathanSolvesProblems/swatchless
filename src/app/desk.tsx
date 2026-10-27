"use client";

import { useCallback, useReducer, useState } from "react";
import type { ConsultEvent, ConsultResult, Recommendation } from "@/lib/agent";
import { PhotoIcon, Ring, Tag, Weft, WireTick } from "./ring";

export type StreamEvent =
  | ConsultEvent
  | { type: "photos"; selfie: string; head_down?: string; disclosure?: string }
  | { type: "saved"; id: string }
  | { type: "reset" };

interface Step {
  id: string;
  tool: string;
  label: string;
  state: "running" | "ok" | "failed";
  detail?: string;
  images?: string[];
}

export interface ConsultState {
  photos: { selfie: string; head_down?: string; disclosure?: string } | null;
  steps: Step[];
  thoughts: string[];
  refusals: string[];
  result: ConsultResult | null;
  savedId: string | null;
  error: string | null;
}

const EMPTY: ConsultState = { photos: null, steps: [], thoughts: [], refusals: [], result: null, savedId: null, error: null };

const TOOL_LABELS: Record<string, string> = {
  "AI-Hair-Density-Detection": "Hair density",
  "AI-Hair-Length-Detection": "Hair length",
  "AI-Hair-Type-Detection": "Hair type",
  "AI-Hair-Style-Virtual-Try-On": "Try-on",
  "AI-Hair-Color-Virtual-Try-On": "Colour try-on",
  "AI-Hair-Volume-Virtual-Try-On": "Volume try-on",
  show_palette: "Read the shade palette",
  search_catalog: "Searched the catalogues",
  view_images: "Looked at photos",
  finalize: "Checked the shortlist against renders and stock",
  ask_for_photo: "Asked for a new photo",
};

const ERRORS: Record<string, string> = {
  error_face_angle_invalid: "the head is tilted too far in this photo for this measurement",
  error_no_face: "no face in the reference photo, so it cannot be used",
  error_large_face_angle: "the face is turned too far",
  error_face_pose: "the head pose is not supported",
};

function summarise(tool: string, text: string): string {
  const density = text.match(/"mapping"\s*:\s*"([\d.]+)".*?"term"\s*:\s*"([^"]+)"/);
  if (density) return `${Number(density[1]).toFixed(1)} of 4, ${density[2].toLowerCase().replace(" density", "")}`;
  const length = text.match(/"hair_length"\s*:\s*\{\s*"term"\s*:\s*"([^"]+)"/);
  if (length) return length[1];
  const err = text.match(/error_(?!message)[a-z_]+/);
  if (err) return ERRORS[err[0]] ?? err[0].replace(/_/g, " ");
  return tool === "AI-Hair-Style-Virtual-Try-On" ? "rendered" : "done";
}

/** One reducer for the live stream and for a saved consult replayed from its log. */
export function consultReducer(s: ConsultState, e: StreamEvent): ConsultState {
  switch (e.type) {
    case "reset":
      return EMPTY;
    case "photos":
      return { ...s, photos: { selfie: e.selfie, head_down: e.head_down, disclosure: e.disclosure } };
    case "say":
      return { ...s, thoughts: [...s.thoughts, e.text] };
    case "youcam_call":
      return { ...s, steps: [...s.steps, { id: e.id, tool: e.tool, label: TOOL_LABELS[e.tool] ?? e.tool, state: "running" }] };
    case "youcam_result":
      return {
        ...s,
        steps: s.steps.map((st) =>
          st.id === e.id ? { ...st, state: e.ok ? "ok" : "failed", detail: summarise(st.tool, e.summary), images: e.images } : st,
        ),
      };
    case "tool":
      return { ...s, steps: [...s.steps, { id: `${e.name}-${s.steps.length}`, tool: e.name, label: TOOL_LABELS[e.name] ?? e.name, state: "ok" }] };
    case "refused":
      return { ...s, refusals: [...s.refusals, e.reason] };
    case "done":
      return { ...s, result: e.result };
    case "saved":
      return { ...s, savedId: e.id };
    case "error":
      return { ...s, error: e.message };
  }
}

export function replay(events: StreamEvent[]): ConsultState {
  return events.reduce(consultReducer, EMPTY);
}

export function Desk({ hero, latest }: { hero: React.ReactNode; latest?: { id: string; label: string; events: StreamEvent[] } }) {
  const [selfie, setSelfie] = useState<File | null>(null);
  const [headDown, setHeadDown] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [code, setCode] = useState("");
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [state, dispatch] = useReducer(consultReducer, EMPTY);
  const shown = started ? state : latest ? replay(latest.events) : null;

  const run = useCallback(
    async (demo = false) => {
      if (running) return;
      let s = selfie;
      let h = headDown;
      let n = note;
      if (demo) {
        // The composite demo customer's own photos, so a judge can run a live consult without photos of their own.
        const load = async (path: string, name: string) => new File([await (await fetch(path)).blob()], name, { type: "image/jpeg" });
        [s, h] = await Promise.all([load("/demo/customer.jpg", "selfie.jpg"), load("/demo/customer-head-down.jpg", "head-down.jpg")]);
        n = "Since the baby my part keeps getting wider and you can see my scalp. Which pieces would match my colour and cover it?";
        setSelfie(s);
        setHeadDown(h);
        setNote(n);
      }
      if (!s) {
        setRefused("Add the customer's selfie first, or run it on the demo customer.");
        return;
      }
      setRunning(true);
      setRefused(null);
      const body = new FormData();
      body.set("selfie", s);
      if (h) body.set("head_down", h);
      if (n.trim()) body.set("note", n.trim());
      // The testing-instructions link carries the access code (?code=...), so a judge's first click is ready to run.
      const access = code.trim() || new URLSearchParams(window.location.search).get("code") || "";
      if (access) body.set("access_code", access);
      try {
        const res = await fetch("/api/consult", { method: "POST", body });
        if (!res.ok || !res.body) {
          // Refused before any paid call: keep the latest consult on screen and say why under the form.
          setRefused((await res.json().catch(() => null))?.error ?? `The desk could not start (HTTP ${res.status}).`);
          return;
        }
        setStarted(true);
        dispatch({ type: "reset" });
        const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) if (frame.startsWith("data: ")) dispatch(JSON.parse(frame.slice(6)) as StreamEvent);
      }
      } catch (err) {
        dispatch({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        setRunning(false);
      }
    },
    [selfie, headDown, note, code, running],
  );

  return (
    <div className="flex flex-col gap-16">
      {hero}
      <Intake selfie={selfie} headDown={headDown} onSelfie={setSelfie} onHeadDown={setHeadDown} note={note} onNote={setNote} code={code} onCode={setCode} onRun={() => run(false)} onDemo={() => run(true)} running={running} refused={refused} />
      {shown && (
        <section aria-label={started ? "This consult" : "The latest consult"} className="flex flex-col gap-6">
          {!started && latest && (
            <p className="text-[14px] text-muted">
              The desk&rsquo;s latest consult.{" "}
              <a className="text-link" href={`/consult/${latest.id}`}>
                Open it on its own page
              </a>
            </p>
          )}
          <ConsultView state={shown} />
        </section>
      )}
    </div>
  );
}

export function ConsultView({ state }: { state: ConsultState }) {
  const { photos, steps, thoughts, refusals, result, savedId, error } = state;
  const renders = steps.filter((s) => s.tool === "AI-Hair-Style-Virtual-Try-On" && s.state === "ok" && s.images?.length);
  const measured = steps.filter((s) => ["Hair density", "Hair length", "Hair type"].includes(s.label) && s.state !== "running");
  const recs: Recommendation[] = result?.recommendations ?? [];

  return (
    <div className="consult">
      <section aria-labelledby="customer-h" className="consult-side">
        <h2 id="customer-h" className="text-[28px]">What YouCam measured</h2>
        {photos ? (
          <div className="customer">
            <div className="customer-photos">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photos.selfie} alt="The customer's selfie" />
              {photos.head_down && photos.head_down !== photos.selfie && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photos.head_down} alt="The head-down photo used for density" />
              )}
            </div>
            {measured.length > 0 ? (
              <dl className="measures">
                {measured.map((m) => (
                  <div key={m.id} className={m.state === "failed" ? "measure measure-failed" : "measure"}>
                    <dt>{m.label}</dt>
                    <dd>{m.state === "failed" ? `Not measured: ${m.detail}` : m.detail}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[14px] text-muted">Measuring</p>
            )}
          </div>
        ) : (
          <p className="ring-empty">Uploading the customer&rsquo;s photos</p>
        )}
        {photos?.disclosure && <p className="disclosure">{photos.disclosure}</p>}
        {result?.message_to_customer && <Reply result={result} savedId={savedId} />}
        {result?.status === "needs_photo" && result.photo_request && <Tag code="Needs a photo">{result.photo_request.reason}</Tag>}
        {error && <p className="text-refuse-text">{error}</p>}
      </section>

      <section aria-labelledby="ring-h" className="flex flex-col gap-6">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="ring-h" className="text-[28px]">
            {recs.length ? "Shortlisted" : renders.length ? "Try-ons so far" : "Try-ons"}
          </h2>
          {result && (
            <p className="text-[14px] text-muted">
              {result.tryons_used} try-on{result.tryons_used === 1 ? "" : "s"} used
            </p>
          )}
        </div>
        <Ring>
          {recs.length
            ? recs.map((r) => <Weft key={r.variant_id} rec={r} />)
            : renders.map((s, i) => <Weft key={s.id} pending={{ image: s.images![0], index: i + 1 }} />)}
        </Ring>
        {(recs.length > 0 || renders.length > 0) && <p className="text-sm text-muted">A render shows the finished look, not how a piece clips in.</p>}
        {refusals.length > 0 && (
          <ul className="flex flex-col gap-2" aria-label="Refused by the desk">
            {refusals.map((r, i) => (
              <li key={i}>
                <Tag code="Refused" tone="refused">
                  {r}
                </Tag>
              </li>
            ))}
          </ul>
        )}
        <Steps steps={steps} thoughts={thoughts} decided={result?.measurements} />
      </section>
    </div>
  );
}

function Drop(props: { label: string; hint: string; file: File | null; onFile: (f: File | null) => void; required?: boolean; kind: "selfie" | "head_down" }) {
  const [over, setOver] = useState(false);
  const preview = props.file ? URL.createObjectURL(props.file) : null;
  return (
    <label
      className={`drop ${over ? "drop-over" : ""} ${props.file ? "drop-full" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        props.onFile(e.dataTransfer.files?.[0] ?? null);
      }}
    >
      <input type="file" accept="image/*" required={props.required} className="sr-only" onChange={(e) => props.onFile(e.target.files?.[0] ?? null)} />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="drop-thumb" />
      ) : (
        <PhotoIcon kind={props.kind} />

      )}
      <span className="flex flex-col">
        <span className="font-semibold text-ink">{props.label}</span>
        <span className="text-[13px] text-muted">{props.file ? props.file.name : props.hint}</span>
      </span>
    </label>
  );
}

function Intake(props: {
  selfie: File | null;
  headDown: File | null;
  onSelfie: (f: File | null) => void;
  onHeadDown: (f: File | null) => void;
  note: string;
  onNote: (s: string) => void;
  onRun: () => void;
  running: boolean;
  code: string;
  onCode: (s: string) => void;
  onDemo: () => void;
  refused: string | null;
}) {
  return (
    <form
      className="intake"
      aria-labelledby="intake-h"
      onSubmit={(e) => {
        e.preventDefault();
        props.onRun();
      }}
    >
      <h2 id="intake-h" className="text-[26px]">Start a consult</h2>
      <div className="intake-row">
        <Drop kind="selfie" label="Selfie" hint="Facing the camera, hair down" file={props.selfie} onFile={props.onSelfie} required />
        <Drop kind="head_down" label="Head-down photo" hint="Optional: lets YouCam measure density" file={props.headDown} onFile={props.onHeadDown} />
        <label className="intake-note">
          <span className="sr-only">What the customer wrote</span>
          <textarea
            value={props.note}
            onChange={(e) => props.onNote(e.target.value)}
            rows={2}
            placeholder="What the customer wrote, e.g. My part has been getting wider. Which fill-ins would match me?"
          />
        </label>
        <button type="submit" className="primary" disabled={props.running} aria-disabled={!props.selfie}>
          {props.running ? "Working on it" : "Find the match"}
        </button>
      </div>
      <div className="intake-extra">
        {process.env.NEXT_PUBLIC_CONSULT_CODE_REQUIRED === "1" && (
          <label className="intake-code">
            <span>Access code</span>
            <input value={props.code} onChange={(e) => props.onCode(e.target.value)} autoComplete="off" spellCheck={false} placeholder="from the testing instructions" />
          </label>
        )}
        <button type="button" className="text-link" onClick={props.onDemo} disabled={props.running}>
          No photos to hand? Run it live on the demo customer
        </button>
        <span className="text-[13px] text-muted">
          Photos go to YouCam for this consult only. The finished consult is saved at its own link; only the demo customer appears on this page.
        </span>
      </div>
      {props.refused && (
        <p role="alert" className="intake-refused">
          {props.refused}
        </p>
      )}
    </form>
  );
}

function Steps({ steps, thoughts, decided }: { steps: Step[]; thoughts: string[]; decided?: Record<string, unknown> }) {
  if (!steps.length) return null;
  const entries = Object.entries(decided ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== "");
  const label = (k: string) => k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (
    <details className="steps">
      <summary>How the desk got there: {steps.length} steps</summary>
      {entries.length > 0 && (
        <dl className="decided" aria-label="What the desk decided">
          {entries.map(([k, v]) => (
            <div key={k} className={k === "dropped" ? "decided-dropped" : undefined}>
              <dt>{k === "dropped" ? "Dropped, and why" : label(k)}</dt>
              {Array.isArray(v) ? (
                <dd>
                  <ul>
                    {v.map((x, i) => (
                      <li key={i}>{String(x)}</li>
                    ))}
                  </ul>
                </dd>
              ) : (
                <dd>{typeof v === "string" ? v : JSON.stringify(v)}</dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {thoughts.length > 0 && (
        <ol className="mt-4 flex flex-col gap-2 text-[14px] leading-relaxed text-muted">
          {thoughts.map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ol>
      )}
      <ol className="mt-4 flex flex-col gap-1.5 text-[13.5px]">
        {steps.map((s) => (
          <li key={s.id} className="flex gap-3">
            <span aria-hidden className={s.state === "failed" ? "text-refuse-text" : s.state === "running" ? "text-muted" : "text-steel"}>
              {s.state === "failed" ? "×" : s.state === "running" ? "·" : <WireTick className="inline align-[-1px]" />}
            </span>
            <span className="text-ink">{s.label}</span>
            {s.detail && <span className="text-muted">{s.detail}</span>}
          </li>
        ))}
      </ol>
    </details>
  );
}

/** The reply goes out from the stylist's own mail client, so it lands where they already work. */
function mailto(result: ConsultResult, savedId: string | null): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const lines = [
    result.message_to_customer,
    "",
    ...result.recommendations.map((r) => `${r.title} (${r.store}, $${r.price.toFixed(0)}): add to cart ${r.cart_url}`),
    savedId ? `\nSee yourself wearing each one: ${origin}/consult/${savedId}` : "",
  ];
  return `mailto:?subject=${encodeURIComponent("Your shade match")}&body=${encodeURIComponent(lines.join("\n"))}`;
}

function ReplyText({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const paras = text.split(/\n\s*\n/);
  const shown = open ? paras : paras.slice(0, 2);
  return (
    <div className="mt-3 flex flex-col gap-3 text-[15px] leading-relaxed">
      {shown.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
      {paras.length > 2 && (
        <button type="button" className="text-link self-start" onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read the whole reply"}
        </button>
      )}
    </div>
  );
}

function Reply({ result, savedId }: { result: ConsultResult; savedId: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <article className="reply">
      <h3 className="text-2xl">Reply to send</h3>
      <ReplyText text={result.message_to_customer} />
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {result.recommendations.length > 0 && (
          <a className="tag-button tag-button-ink" href={mailto(result, savedId)}>
            Send from my email
          </a>
        )}
        <button
          type="button"
          className="text-link"
          onClick={async () => {
            await navigator.clipboard.writeText(result.message_to_customer);
            setCopied(true);
          }}
        >
          {copied ? "Copied" : "Copy the reply"}
        </button>
        {savedId && (
          <a className="text-link" href={`/consult/${savedId}`}>
            Open the saved consult
          </a>
        )}
      </div>
    </article>
  );
}
