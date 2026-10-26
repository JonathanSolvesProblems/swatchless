import { catalog, luxyShadeSwatches } from "@/lib/catalog";
import { Swatch } from "./ring";

const usable = catalog.products.filter((p) => p.references.length);
const shades = new Set(usable.map((p) => `${p.store}:${p.shade}`)).size;
const wall = luxyShadeSwatches().filter((s) => s.swatch);
const pinned = "Off Black";

/** The material the product is named for: the shades a stylist would otherwise mail out, read by the desk instead. */
export function Hero() {
  return (
    <div className="hero-grid">
      <div className="flex flex-col gap-5">
        <h1 className="max-w-[15ch] text-[clamp(2.6rem,5.2vw,4.4rem)] leading-[1.02]">
          Answer <span className="whitespace-nowrap">&ldquo;which shade?&rdquo;</span> with the customer wearing it
        </h1>
        <p className="max-w-[46ch] text-[18px] leading-relaxed text-muted">
          The customer sends a selfie. YouCam reads their hair, Claude finds the match in your store, and they see it on themselves before
          they buy hair they can&rsquo;t return once worn.
        </p>
        <p className="max-w-[46ch] text-[14px] text-muted">
          Built on {usable.length.toLocaleString()} pieces in {shades} shades from {catalog.stores.map((s) => s.name).join(", ")}.
        </p>
      </div>

      <figure className="wall m-0" aria-label={`The ${wall.length} Luxy Hair shades the desk picks from`}>
        <div className="wall-grid">
          {wall.map((s) => (
            <span key={s.shade} className={`wall-cell ${s.shade === pinned ? "wall-cell-pinned" : ""}`} title={s.shade}>
              <Swatch src={s.swatch} size="lg" />
              {s.shade === pinned && (
                <span className="wall-tag">
                  <span className="wall-shade">{pinned}</span>
                  <span className="wall-meta">matched for the customer below</span>
                </span>
              )}
            </span>
          ))}
        </div>
        <figcaption className="wall-caption">
          The {wall.length} Luxy Hair shades a stylist would otherwise mail out as a $127.50 swatch ring. The desk reads them instead.
        </figcaption>
      </figure>
    </div>
  );
}
