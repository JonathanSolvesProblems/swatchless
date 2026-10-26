import { swatchFor } from "./catalog";
import type { StoredConsult } from "./store";

/** A saved consult as the event stream the desk renders, with every image pointed at the copies saved with it. */
export function consultEvents(consult: StoredConsult) {
  const files = `/api/files/${consult.id}`;
  const result = {
    ...consult.result,
    recommendations: consult.result.recommendations.map((r, i) => ({
      ...r,
      // Records saved before the swatch field existed get theirs from the catalogue.
      swatch_url: r.swatch_url ?? swatchFor(r.shade),
      render_url: consult.render_files[i] ? `${files}/${consult.render_files[i]}` : r.render_url,
    })),
  };
  return [
    {
      type: "photos" as const,
      selfie: `${files}/selfie.jpg`,
      head_down: consult.has_head_down ? `${files}/head-down.jpg` : undefined,
      disclosure: consult.disclosure,
    },
    ...consult.events.filter((e) => e.type !== "done"),
    { type: "done" as const, result },
  ];
}

export function consultLabel(consult: StoredConsult): string {
  const when = new Date(consult.created).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }).replace(/\.$/, "");
  return `The latest consult, ${when}.`;
}
