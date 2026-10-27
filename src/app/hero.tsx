import { catalog, luxyShadeSwatches } from "@/lib/catalog";
import { Swatch } from "./ring";

const usable = catalog.products.filter((p) => p.references.length);
const shades = new Set(usable.map((p) => `${p.store}:${p.shade}`)).size;
const wall = luxyShadeSwatches().filter((s) => s.swatch);

/**
 * The material the product is named for: the shades on the swatch ring a customer would otherwise buy, read by the desk instead.
 * The tag pins the first pick of the consult shown below, so it can never claim a match the desk did not make.
 */
export function Hero({ match }: { match?: string }) {
  const pinned = wall.find((s) => match && s.shade.toLowerCase() === match.toLowerCase())?.shade;
  return (
    <div className="hero-grid">
      {/* The headline sits on the wall's top edge and the catalogue line on its caption's baseline. */}
      <div className="hero-copy flex flex-col gap-8">
        <div className="flex flex-col gap-5">
          <h1 className="max-w-[15ch] text-[clamp(2.4rem,4.4vw,3.6rem)] leading-[1.04]">
            Answer <span className="whitespace-nowrap">&ldquo;which shade?&rdquo;</span> with the customer wearing it
          </h1>
          <p className="max-w-[46ch] text-[18px] leading-relaxed text-muted">
            The customer sends a selfie. YouCam reads their hair, Claude finds the match in your store, and they see it on themselves before
            they buy hair they can&rsquo;t return once worn.
          </p>
        </div>
        <p className="max-w-[46ch] text-[14px] text-muted">
          Built on {usable.length.toLocaleString()} pieces in {shades} shades from{" "}
          {catalog.stores
            .map((s) => s.name)
            .join(", ")
            .replace(/, ([^,]+)$/, " and $1")}
          .
        </p>
      </div>

      <figure className="wall m-0" aria-label={`The ${wall.length} Luxy Hair shades the desk can render`}>
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
          {wall.length} of the shades on Luxy Hair&rsquo;s $127.50 swatch ring, the ring a customer would otherwise buy to match at home. The
          desk reads them from a selfie instead.
        </figcaption>
      </figure>
    </div>
  );
}
