import { catalog } from "@/lib/catalog";
import { Fringe, pinnedSide, strands } from "./fringe";

const usable = catalog.products.filter((p) => p.references.length);
const stores = catalog.stores
  .map((s) => s.name)
  .join(", ")
  .replace(/, ([^,]+)$/, " and $1");

/**
 * The material the product is named for: the swatch ring a customer would otherwise buy, opened out across the
 * page. The tag pins the first pick of the consult shown below, so it can never claim a match the desk did not make.
 */
export function Hero({ match }: { match?: string }) {
  const side = pinnedSide(match);
  return (
    <div className="hero">
      <Fringe long pinned={match} />
      {/* The paragraph sits under the tag's half, so the tag hangs into it; the headline takes the open half. */}
      <div className={`page-measure hero-copy ${side === "left" ? "hero-copy-flip" : ""}`}>
        <h1 className="hero-title">
          Answer <span className="whitespace-nowrap">&ldquo;which shade?&rdquo;</span> with the customer wearing it
        </h1>
        <p className="hero-lede">
          Above are {strands.length} of the shades on Luxy Hair&rsquo;s $127.50 swatch ring, the ring a customer would otherwise buy to match
          at home. Here the customer sends a selfie instead. YouCam reads their hair, Claude finds the match among{" "}
          {usable.length.toLocaleString()} pieces from {stores}, and the customer sees it on themselves before buying hair they can&rsquo;t
          return once worn.
        </p>
      </div>
    </div>
  );
}
