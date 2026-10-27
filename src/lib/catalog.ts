/**
 * The three retailers' thinning-hair catalogues, built by scripts/ingest.py from their public
 * Shopify feeds. Every product photo was classified once, so `references` only ever holds
 * front-facing on-model shots: the photos YouCam's hair transfer can actually use.
 */
import catalogJson from "../../data/catalog.json";

export type Category = "fill-in" | "topper" | "hairpiece" | "bangs" | "headcover";

export interface Product {
  store: string;
  product_id: number;
  variant_id: number;
  handle: string;
  title: string;
  type: string;
  shade: string;
  price: number;
  available: boolean;
  url: string;
  cart_url: string;
  swatch: string | null;
  references: string[];
  /** False when the only on-model photos show this style in a different colour. */
  reference_in_this_shade: boolean;
  images: number;
}

interface Catalog {
  generated: string;
  stores: { id: string; name: string; domain: string; products_kept: number }[];
  products: Product[];
}

export const catalog = catalogJson as Catalog;

export function storeName(id: string): string {
  return catalog.stores.find((s) => s.id === id)?.name ?? id;
}

export function categoryOf(p: Product): Category {
  const t = `${p.title} ${p.type}`;
  if (/hat|headcover|turban|scarf/i.test(t)) return "headcover";
  if (/bangs?/i.test(t)) return "bangs";
  if (/fill-?ins?/i.test(t)) return "fill-in";
  if (/hairpiece|power pieces/i.test(t)) return "hairpiece";
  return "topper";
}

export function findVariant(variantId: number): Product | undefined {
  return catalog.products.find((p) => p.variant_id === variantId);
}

// Store photo -> the shades it is catalogued under, counting only photos that show their own product's shade.
let byReference: Map<string, Set<string>> | null = null;
const bare = (url: string) => url.split("?")[0];
export function referenceShades(url: string): string[] {
  if (!byReference) {
    byReference = new Map();
    for (const p of catalog.products) {
      if (!p.reference_in_this_shade) continue;
      for (const r of p.references) {
        const k = bare(r);
        byReference.set(k, (byReference.get(k) ?? new Set()).add(p.shade));
      }
    }
  }
  return [...(byReference.get(bare(url)) ?? [])];
}

export interface SearchQuery {
  categories?: Category[];
  stores?: string[];
  shade_contains?: string;
  max_price?: number;
  include_unavailable?: boolean;
  limit?: number;
  /** Product photos that may not be offered as references (benchmark leakage control). */
  exclude?: Set<string>;
}

/** What the agent sees for each candidate: enough to choose, nothing it could mistake for a render. */
export function searchCatalog(q: SearchQuery) {
  const shade = q.shade_contains?.toLowerCase();
  const refs = (p: Product) => (q.exclude?.size ? p.references.filter((r) => !q.exclude!.has(r)) : p.references);
  return catalog.products
    .filter((p) => refs(p).length > 0)
    .filter((p) => !q.categories?.length || q.categories.includes(categoryOf(p)))
    .filter((p) => !q.stores?.length || q.stores.includes(p.store))
    .filter((p) => !shade || p.shade.toLowerCase().includes(shade) || p.title.toLowerCase().includes(shade))
    .filter((p) => q.max_price === undefined || p.price <= q.max_price)
    .filter((p) => q.include_unavailable || p.available)
    .slice(0, Math.min(q.limit ?? 40, 80))
    .map((p) => ({
      variant_id: p.variant_id,
      store: storeName(p.store),
      title: p.title,
      category: categoryOf(p),
      shade: p.shade,
      price: p.price,
      in_stock: p.available,
      swatch_url: p.swatch,
      reference_urls: refs(p),
      reference_shows_this_shade: p.reference_in_this_shade,
    }));
}

/** The Luxy shades the desk can be offered (those with a trusted on-model photo), each with the store's swatch, dark to light by name order of the catalogue. */
export function luxyShadeSwatches(): { shade: string; swatch: string | null }[] {
  const seen = new Map<string, string | null>();
  for (const p of catalog.products) {
    if (p.store !== "luxy" || !p.references.length || seen.has(p.shade)) continue;
    seen.set(p.shade, swatchFor(p.shade));
  }
  return [...seen.entries()].map(([shade, swatch]) => ({ shade, swatch }));
}

/** The store's own close-up swatch photo for a shade, so every shade name on screen carries its colour. */
export function swatchFor(shade: string, store = "luxy"): string | null {
  const s = shade.trim().toLowerCase();
  const hit =
    catalog.products.find((p) => p.store === store && p.swatch && p.shade.trim().toLowerCase() === s) ??
    catalog.products.find((p) => p.swatch && p.shade.trim().toLowerCase() === s);
  return hit?.swatch ?? null;
}

/** Distinct shades on offer for a category, so the agent can see the whole palette before choosing. */
export function shadePalette(categories?: Category[], stores?: string[], exclude?: Set<string>) {
  const seen = new Map<string, { shade: string; store: string; swatch_url: string | null; variants: number }>();
  for (const p of catalog.products) {
    if (!p.references.some((r) => !exclude?.has(r))) continue;
    if (categories?.length && !categories.includes(categoryOf(p))) continue;
    if (stores?.length && !stores.includes(p.store)) continue;
    const k = `${p.store}:${p.shade}`;
    const e = seen.get(k);
    if (e) e.variants++;
    else seen.set(k, { shade: p.shade, store: storeName(p.store), swatch_url: p.swatch, variants: 1 });
  }
  return [...seen.values()];
}

const DOMAINS: Record<string, string> = Object.fromEntries(catalog.stores.map((s) => [s.id, s.domain]));

/**
 * Stock right now, from the store's own product endpoint. Falls back to the catalogue snapshot (and says so)
 * when the store does not answer, so a network blip never turns into a claim the desk cannot stand behind.
 */
export async function liveStock(p: Product): Promise<{ available: boolean; source: "store" | "snapshot" }> {
  try {
    const res = await fetch(`https://${DOMAINS[p.store]}/products/${p.handle}.js`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 Swatchless stock check" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { variants?: { id: number; available: boolean }[] };
    const v = data.variants?.find((x) => x.id === p.variant_id);
    if (!v) throw new Error("variant not listed");
    return { available: v.available, source: "store" };
  } catch {
    return { available: p.available, source: "snapshot" };
  }
}
