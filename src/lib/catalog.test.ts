import { describe, expect, it } from "vitest";
import { catalog, categoryOf, searchCatalog, shadePalette, swatchFor } from "./catalog";

describe("the catalogue the desk searches", () => {
  it("only offers products with a front-facing reference photo YouCam can use", () => {
    for (const row of searchCatalog({ limit: 80 })) expect(row.reference_urls.length).toBeGreaterThan(0);
  });

  it("hides excluded reference photos, and drops a product whose only references are excluded", () => {
    const all = searchCatalog({ categories: ["fill-in"], limit: 80 });
    const victim = all.find((p) => p.reference_urls.length >= 1)!;
    const exclude = new Set(victim.reference_urls);
    const after = searchCatalog({ categories: ["fill-in"], limit: 80, exclude });
    const same = after.find((p) => p.variant_id === victim.variant_id);
    if (same) expect(same.reference_urls.every((u) => !exclude.has(u))).toBe(true);
    for (const p of after) for (const u of p.reference_urls) expect(exclude.has(u)).toBe(false);
  });

  it("leaves out-of-stock variants out unless asked for them", () => {
    expect(searchCatalog({ limit: 80 }).every((p) => p.in_stock)).toBe(true);
    const withOut = searchCatalog({ limit: 80, include_unavailable: true });
    expect(withOut.length).toBeGreaterThanOrEqual(searchCatalog({ limit: 80 }).length);
  });

  it("finds Luxy's swatch for a shade regardless of case", () => {
    expect(swatchFor("jet black")).toMatch(/^https:\/\//);
    expect(swatchFor("Jet Black")).toBe(swatchFor("jet black"));
    expect(swatchFor("No Such Shade")).toBeNull();
  });

  it("lists each shade once in the palette, with its swatch", () => {
    const palette = shadePalette(["fill-in", "topper", "hairpiece"]);
    const keys = palette.map((p) => `${p.store}:${p.shade}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(palette.some((p) => p.swatch_url)).toBe(true);
  });

  it("classifies the three stores' product lines", () => {
    const sample = (re: RegExp, not?: RegExp) => catalog.products.find((p) => re.test(p.title) && !(not && not.test(p.title)))!;
    expect(categoryOf(sample(/Fill-Ins/))).toBe("fill-in");
    // A Luxy "Topper & Fill-Ins" bundle is filed as a fill-in; a plain topper is a topper.
    expect(categoryOf(sample(/Topper/, /Fill-Ins/))).toBe("topper");
    expect(categoryOf(sample(/Topper.*Fill-Ins/))).toBe("fill-in");
    expect(categoryOf(sample(/Hat|Headcover/i) ?? sample(/Topper/, /Fill-Ins/))).toMatch(/headcover|topper/);
  });
});
