import { describe, expect, it } from "vitest";
import type { Product } from "./catalog";
import { checkShortlist, type GateContext } from "./gate";

const product = (over: Partial<Product> = {}): Product => ({
  store: "luxy",
  product_id: 1,
  variant_id: 101,
  handle: "16-jet-black-scalp-hair-fill-ins",
  title: '16" Jet Black Scalp Hair Fill-Ins (40g)',
  type: "Scalp Hair Fill-ins",
  shade: "Jet Black",
  price: 155,
  available: true,
  url: "https://luxyhair.com/products/16-jet-black-scalp-hair-fill-ins",
  cart_url: "https://luxyhair.com/cart/101:1",
  swatch: "https://cdn.example/swatch-jet-black.jpg",
  references: ["https://cdn.example/uma-1.jpg"],
  reference_in_this_shade: true,
  images: 6,
  ...over,
});

const RENDER = "https://yce.example/render-1.jpg";

function ctx(over: Partial<GateContext> = {}): GateContext {
  return {
    renders: new Map([[RENDER, { reference: "https://cdn.example/uma-1.jpg" }]]),
    ablation: false,
    lookup: (id) => (id === 101 ? product() : id === 202 ? product({ variant_id: 202, available: false, title: '12" Off Black Scalp Hair Fill-Ins (30g)', shade: "Off Black" }) : undefined),
    stock: async (p) => ({ available: p.available, source: "store" }),
    ...over,
  };
}

const item = (over = {}) => ({ variant_id: 101, render_url: RENDER, reference_url: "https://cdn.example/uma-1.jpg", why: "closest to the roots", ...over });

describe("the desk's gate", () => {
  it("accepts a rendered, in-stock pick and carries the store's swatch and cart link", async () => {
    const r = await checkShortlist([item()], ctx());
    expect(r.problems).toEqual([]);
    expect(r.accepted).toHaveLength(1);
    expect(r.accepted[0]).toMatchObject({
      shade: "Jet Black",
      store: "Luxy Hair",
      swatch_url: "https://cdn.example/swatch-jet-black.jpg",
      cart_url: "https://luxyhair.com/cart/101:1",
      reference_url: "https://cdn.example/uma-1.jpg",
    });
  });

  it("refuses a render_url YouCam did not return in this consult", async () => {
    const r = await checkShortlist([item({ render_url: "https://yce.example/made-up.jpg" })], ctx());
    expect(r.accepted).toEqual([]);
    expect(r.problems[0]).toMatch(/not returned by YouCam in this consult/);
  });

  it("refuses a pick with no render unless it says why it is not shown", async () => {
    const bare = await checkShortlist([item({ render_url: null })], ctx());
    expect(bare.problems[0]).toMatch(/render_note must say why/);
    const explained = await checkShortlist([item({ render_url: null, render_note: "every render widened the jaw" })], ctx());
    expect(explained.problems).toEqual([]);
    expect(explained.accepted[0].render_note).toBe("every render widened the jaw");
  });

  it("refuses an out-of-stock variant and puts it on the watch list", async () => {
    const r = await checkShortlist([item({ variant_id: 202 })], ctx());
    expect(r.accepted).toEqual([]);
    expect(r.problems[0]).toMatch(/out of stock on the store's site right now/);
    expect(r.watch).toEqual([{ variant_id: 202, title: '12" Off Black Scalp Hair Fill-Ins (30g)', store: "luxy", render_url: RENDER }]);
  });

  it("says when stock came from the last catalogue rather than the store", async () => {
    const r = await checkShortlist([item({ variant_id: 202 })], ctx({ stock: async (p) => ({ available: p.available, source: "snapshot" }) }));
    expect(r.problems[0]).toMatch(/in the store's last catalogue/);
  });

  it("refuses a variant no store sells", async () => {
    const r = await checkShortlist([item({ variant_id: 999 })], ctx());
    expect(r.problems).toEqual(["variant 999 is not in any store's feed"]);
  });

  it("checks live stock before accepting, even when the catalogue said in stock", async () => {
    const r = await checkShortlist([item()], ctx({ stock: async () => ({ available: false, source: "store" }) }));
    expect(r.accepted).toEqual([]);
    expect(r.watch[0].variant_id).toBe(101);
  });

  it("does not demand renders in the no-YouCam benchmark arm", async () => {
    const r = await checkShortlist([item({ render_url: null, reference_url: null })], ctx({ ablation: true, renders: new Map() }));
    expect(r.problems).toEqual([]);
    expect(r.accepted[0].render_url).toBeNull();
  });

  it("keeps the good items when one of three fails", async () => {
    const r = await checkShortlist([item(), item({ variant_id: 202 }), item({ variant_id: 999 })], ctx());
    expect(r.accepted.map((a) => a.variant_id)).toEqual([101]);
    expect(r.problems).toHaveLength(2);
  });
});
