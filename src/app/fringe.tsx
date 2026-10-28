import type { CSSProperties } from "react";
import fs from "node:fs";
import path from "node:path";
import { luxyShadeSwatches } from "@/lib/catalog";

// The ring opened out: the Luxy shades the desk can render, hung light to dark by the measured lightness of the
// store's own swatch photo (data/luxy-levels.json), so the dark shades most picks land on sit on the right, away
// from the headline. A shade not yet measured hangs at the light end.
const levels: string[] = (() => {
  try {
    const file = path.join(process.cwd(), "data", "luxy-levels.json");
    return (JSON.parse(fs.readFileSync(file, "utf8")) as { shades: { shade: string }[] }).shades.map((s) => s.shade);
  } catch {
    return [];
  }
})();
const rank = (shade: string) => (levels.includes(shade) ? levels.indexOf(shade) : levels.length);
export const strands = luxyShadeSwatches()
  .filter((s): s is { shade: string; swatch: string } => Boolean(s.swatch))
  .sort((a, b) => rank(b.shade) - rank(a.shade));

/**
 * A steel rail with every shade hanging from it as a strand. Long on the desk, where it is the first view and one
 * strand carries the tag of the latest consult's first pick; short under the masthead everywhere else.
 */
export function Fringe({ long = false, pinned }: { long?: boolean; pinned?: string }) {
  const at = pinned ? strands.findIndex((s) => s.shade.toLowerCase() === pinned.toLowerCase()) : -1;
  return (
    <figure
      className={`fringe ${long ? "fringe-long" : "fringe-short"}`}
      aria-label={long ? `The ${strands.length} Luxy Hair shades the desk can render, lightest to darkest` : undefined}
      aria-hidden={long ? undefined : true}
    >
      <ul className="fringe-strands" role={long ? "list" : undefined}>
        {strands.map((s, i) => (
          <li
            key={s.shade}
            className={i === at ? "strand strand-pinned" : "strand"}
            title={long ? s.shade : undefined}
            style={{ "--i": i } as CSSProperties}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${s.swatch}${s.swatch.includes("?") ? "&" : "?"}width=${long ? 240 : 80}`} alt={long ? s.shade : ""} />
            {i === at && (
              // The tag hangs from its strand on a steel line (charter 4) and opens toward the middle, so it stays
              // on screen; the headline takes the other half (pinnedSide).
              <span className={`strand-tag ${i < strands.length / 2 ? "strand-tag-right" : "strand-tag-left"}`}>
                <span className="strand-tag-line" aria-hidden />
                <span className="wall-tag">
                  <span className="wall-shade">{strands[at].shade}</span>
                  <span className="wall-meta">matched for the customer below</span>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function pinnedSide(pinned?: string): "left" | "right" | null {
  const at = pinned ? strands.findIndex((s) => s.shade.toLowerCase() === pinned.toLowerCase()) : -1;
  return at < 0 ? null : at < strands.length / 2 ? "left" : "right";
}
