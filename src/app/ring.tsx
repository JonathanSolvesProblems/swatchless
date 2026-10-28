"use client";

import { Children, useId, useState, type ReactNode } from "react";
import type { Recommendation } from "@/lib/agent";
import { addToCartUrl, usd } from "@/lib/cart";
import { shadeName } from "@/lib/shade-name";

/** The mark: a closed steel ring with one shade tag hanging from it. */
export function RingMark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <circle cx="13" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M18.2 18.6 21 22" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M19.4 21.4h7.2l2.4 2.4v6.2h-9.6z" fill="var(--card, #faf6ef)" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

export function Ring({ children, empty }: { children: ReactNode; empty?: string }) {
  // Flattened, so an empty list of renders counts as nothing and the waiting message shows.
  const items = Children.toArray(children);
  return (
    <div className="ring-stage">
      {items.length ? (
        <ul className="ring-wefts">{children}</ul>
      ) : (
        <p className="ring-empty">{empty ?? "Nothing here yet. Each render appears as it comes back from YouCam."}</p>
      )}
    </div>
  );
}

/** A small cut of the store's own swatch photo: the colour itself, wherever a shade is named. */
export function Swatch({ src, size = "sm" }: { src: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  if (!src) return null;
  const url = `${src}${src.includes("?") ? "&" : "?"}width=${size === "lg" ? 200 : 120}`;
  // Eager: a swatch is tiny, and a tag with an empty square where the colour should be is the worst state it has.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" aria-hidden className={`swatch swatch-${size}`} />;
}

/** A plain chip for a measurement or status. Shade tags with clipped corners are separate (charter 6). */
export function Tag({ code, children, tone = "plain" }: { code: string; children?: ReactNode; tone?: "plain" | "refused" }) {
  return (
    <span className={`tag ${tone === "refused" ? "tag-refused" : ""}`}>
      <span className="tag-code">{code}</span>
      {children && <span className="tag-body">{children}</span>}
    </span>
  );
}

/** A shade, as a stylist would hold it up: the swatch and the name together. */
export function Shade({ name, swatch, miss = false }: { name: string; swatch?: string | null; miss?: boolean }) {
  return (
    <span className={`shade ${miss ? "shade-miss" : ""}`}>
      <Swatch src={swatch} />
      <span>{shadeName(name)}</span>
    </span>
  );
}

function Why({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  // The control sits outside the clamped paragraph, or the clamp would hide it with the text it unfolds; it stays
  // mounted as a toggle, so keyboard focus is never dropped.
  return (
    <div className="weft-why">
      <p id={id} className={open ? "" : "weft-why-clamped"}>
        {text}
      </p>
      {/* about three lines at the narrowest tile, so a clamped reason always carries its toggle */}
      {text.length > 100 && (
        <button type="button" className="text-link" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
          {open ? "Show less" : "Read the rest"}
        </button>
      )}
    </div>
  );
}

/** A product line for the tag: no weight suffix, no repeated shade, and "Ultima | Top Power | ... Topper" cut to its name and kind. */
function productLine(rec: Recommendation): string {
  const parts = rec.title.split(/\s*\|\s*/);
  const title = parts.length > 2 ? `${parts[0]}, ${parts[parts.length - 1]}` : parts.join(", ");
  return title.replace(/\s*\(\d+g\)\s*$/, "").replace(rec.shade, "").replace(/\s+/g, " ").trim();
}

export function Weft({ rec, pending, before }: { rec?: Recommendation; pending?: { image: string; index: number }; before?: { image: string } }) {
  // A pick with no render shows no store photo at tile size (charter 12): its swatch is already on the tag.
  const image = rec ? rec.render_url : before ? before.image : pending!.image;
  const rendered = !rec || Boolean(rec.render_url);
  const alt = before ? "The customer's selfie, as sent" : rec ? `The customer wearing ${rec.title}` : "A render";
  return (
    <li className={`weft ${before ? "weft-before" : ""}`}>
      {/* Each weft hangs from the shortlist's rail on a short steel line (charter 4). */}
      <span className="weft-line" aria-hidden />
      <div className="weft-tag">
        {rec ? (
          <>
            <span className="weft-shade">
              <Swatch src={rec.swatch_url} size="md" />
              <span className="weft-title">{shadeName(rec.shade)}</span>
            </span>
            <span className="weft-meta">
              <span className="block">{productLine(rec)}</span>
              <span className="whitespace-nowrap">
                {rec.store} · {usd(rec.price)}
              </span>
            </span>
          </>
        ) : before ? (
          <>
            <span className="weft-title">As sent</span>
            <span className="weft-meta">The customer&rsquo;s own photo, nothing added yet</span>
          </>
        ) : (
          <span className="weft-title">Render {pending!.index}</span>
        )}
      </div>
      <figure className={`weft-tail ${rendered ? "" : "weft-tail-swatch"}`}>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={alt} />
        )}
        {rec && !rendered && <Swatch src={rec.swatch_url} size="lg" />}
        {rec && !rendered && (
          <figcaption className="weft-note">
            Not shown on the customer. {rec.render_note?.replace(/^not (rendered|shown)[^:.]*[:.]\s*/i, "").replace(/^\p{Ll}/u, (c) => c.toUpperCase())}
          </figcaption>
        )}
        {rec && rendered && rec.reference_url && (
          <figcaption className="weft-ref">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={rec.reference_url} alt="" />
            <span>Rendered from {rec.store}&rsquo;s photo</span>
          </figcaption>
        )}
      </figure>
      {rec && (
        <div className="weft-actions">
          <a className="tag-button" href={addToCartUrl(rec.cart_url)} target="_blank" rel="noreferrer">
            Add to {rec.store} cart
          </a>
          <a className="text-link" href={rec.product_url} target="_blank" rel="noreferrer">
            Product page
          </a>
        </div>
      )}
      {rec?.why && <Why text={rec.why} />}
    </li>
  );
}

/** Line icons in one hand: a face for the selfie, the crown of a head for the density photo. */
export function PhotoIcon({ kind }: { kind: "selfie" | "head_down" }) {
  return (
    <svg className="drop-icon" viewBox="0 0 44 52" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="1" width="42" height="50" rx="2" />
      {kind === "selfie" ? (
        <>
          <path d="M22 11c-6 0-9 5-9 11s3 12 9 12 9-6 9-12-3-11-9-11z" />
          <path d="M13 24c2-3 3-8 9-9 6 1 7 6 9 9" />
          <path d="M8 46c3-6 8-8 14-8s11 2 14 8" />
        </>
      ) : (
        <>
          <path d="M9 34c0-11 6-20 13-20s13 9 13 20" />
          <path d="M22 14v13" strokeDasharray="2 3" />
          <path d="M12 44c3-5 6-7 10-7s7 2 10 7" />
        </>
      )}
    </svg>
  );
}

/** A tick drawn as a bent length of the ring's steel wire (the brand's only check mark). */
export function WireTick({ className = "" }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" aria-hidden className={className}>
      <path d="M2 7.6 5.4 11 12 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
