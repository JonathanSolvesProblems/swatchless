/**
 * Each Luxy swatch's lightness, so the desk's rail hangs the shades in order like a real swatch ring.
 * Median CIE L* of the centre crop of the store's own swatch photo, so a shine highlight does not lift a dark shade.
 * Writes data/luxy-levels.json, darkest first.
 *
 *   pnpm exec tsx scripts/levels.ts
 */
import fs from "node:fs";
import sharp from "sharp";
import { luxyShadeSwatches } from "../src/lib/catalog";

const linear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lstar = (y: number) => (y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y);

async function lightness(swatch: string): Promise<number> {
  const buf = Buffer.from(await (await fetch(`${swatch}${swatch.includes("?") ? "&" : "?"}width=120`)).arrayBuffer());
  const img = sharp(buf);
  const { width = 120, height = 160 } = await img.metadata();
  const crop = { left: Math.round(width * 0.2), top: Math.round(height * 0.2), width: Math.round(width * 0.6), height: Math.round(height * 0.6) };
  const { data } = await img.extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const ys: number[] = [];
  for (let i = 0; i < data.length; i += 3) ys.push(0.2126 * linear(data[i]) + 0.7152 * linear(data[i + 1]) + 0.0722 * linear(data[i + 2]));
  ys.sort((a, b) => a - b);
  return Math.round(lstar(ys[ys.length >> 1]) * 10) / 10;
}

async function main() {
  const shades: { shade: string; lightness: number }[] = [];
  for (const { shade, swatch } of luxyShadeSwatches()) if (swatch) shades.push({ shade, lightness: await lightness(swatch) });
  shades.sort((a, b) => a.lightness - b.lightness);
  const description =
    "Luxy shades by measured median swatch lightness (CIE L*, centre crop of the store's swatch photo), darkest first. Written by scripts/levels.ts.";
  fs.writeFileSync("data/luxy-levels.json", JSON.stringify({ description, shades }, null, 1) + "\n");
  console.log(shades.map((s) => `${s.lightness} ${s.shade}`).join("\n"));
}

main();
