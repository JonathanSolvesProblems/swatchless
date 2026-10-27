/**
 * The desk's gate: the checks a shortlist must pass before it reaches the stylist. Pure, so every refusal is tested.
 *
 * The model chooses the shades; this decides whether each chosen item may be shown:
 *   - the variant must exist in a store's feed
 *   - a render_url must be one YouCam returned in this consult (never a URL the model made up or reused)
 *   - a render made from a store photo must have been made from a photo of this shade, so a render of one product
 *     is never shown under another
 *   - an item with no render must say why it is not shown
 *   - no product twice in one shortlist
 *   - the variant must be in stock on the store's site right now (or in the last catalogue when the store does not answer)
 * Out-of-stock items are refused and handed back as watch-list entries, so the desk can follow up when they return.
 */
import { storeName, type Product } from "./catalog";

export interface Recommendation {
  variant_id: number;
  store: string;
  title: string;
  shade: string;
  price: number;
  /** The YouCam render of the customer wearing it, or null when every render of it was dropped (see render_note). */
  render_url: string | null;
  render_note?: string;
  reference_url: string | null;
  swatch_url: string | null;
  cart_url: string;
  product_url: string;
  why: string;
}

export interface WatchItem {
  variant_id: number;
  title: string;
  store: string;
  render_url: string | null;
}

export interface ShortlistItem {
  variant_id: number;
  render_url: string | null;
  reference_url: string | null;
  render_note?: string;
  why: string;
}

export interface GateContext {
  /** Every render YouCam returned in this consult, keyed by URL, with the reference photo it was made from. */
  renders: Map<string, { reference: string | null }>;
  /** The no-YouCam benchmark arm: there are no renders to demand. */
  ablation: boolean;
  lookup: (variantId: number) => Product | undefined;
  stock: (p: Product) => Promise<{ available: boolean; source: "store" | "snapshot" }>;
  /** The shades a store photo is catalogued under; empty when the photo is not a catalogued reference. */
  referenceShades?: (url: string) => string[];
}

const sameShade = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export interface GateResult {
  accepted: Recommendation[];
  problems: string[];
  watch: WatchItem[];
}

export async function checkShortlist(items: ShortlistItem[], ctx: GateContext): Promise<GateResult> {
  const accepted: Recommendation[] = [];
  const problems: string[] = [];
  const watch: WatchItem[] = [];

  for (const item of items) {
    const product = ctx.lookup(item.variant_id);
    if (!product) {
      problems.push(`variant ${item.variant_id} is not in any store's feed`);
      continue;
    }
    if (accepted.some((a) => a.variant_id === product.variant_id)) {
      problems.push(`${product.title}: listed twice; each product goes on the shortlist once`);
      continue;
    }
    const render = item.render_url ? ctx.renders.get(item.render_url) : undefined;
    if (item.render_url && !render && !ctx.ablation) {
      problems.push(`${product.title}: that render_url was not returned by YouCam in this consult`);
      continue;
    }
    const madeFrom = render?.reference ? (ctx.referenceShades?.(render.reference) ?? []) : [];
    if (madeFrom.length && !madeFrom.some((s) => sameShade(s, product.shade))) {
      problems.push(`${product.title}: that render was made from a photo of ${madeFrom[0]}, not ${product.shade}; render this shade or use its own render`);
      continue;
    }
    if (!item.render_url && !ctx.ablation && !item.render_note?.trim()) {
      problems.push(`${product.title}: no render, so render_note must say why it is not shown`);
      continue;
    }
    const stock = await ctx.stock(product);
    if (!stock.available) {
      problems.push(`${product.title}: out of stock ${stock.source === "store" ? "on the store's site right now" : "in the store's last catalogue"}`);
      if (!watch.some((w) => w.variant_id === product.variant_id)) {
        watch.push({ variant_id: product.variant_id, title: product.title, store: product.store, render_url: render ? item.render_url : null });
      }
      continue;
    }
    accepted.push({
      variant_id: product.variant_id,
      store: storeName(product.store),
      title: product.title,
      shade: product.shade,
      price: product.price,
      render_url: item.render_url,
      render_note: item.render_note,
      reference_url: render?.reference ?? item.reference_url,
      swatch_url: product.swatch,
      cart_url: product.cart_url,
      product_url: product.url,
      why: item.why,
    });
  }
  return { accepted, problems, watch };
}
