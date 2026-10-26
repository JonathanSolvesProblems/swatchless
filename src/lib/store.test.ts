import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { isDemoCustomer } from "./store";

const demo = fs.readFileSync(path.join(process.cwd(), "public", "demo", "customer.jpg"));

describe("isDemoCustomer", () => {
  it("recognises the demo selfie after the route's own resize and re-encode", async () => {
    const prepared = await sharp(demo).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
    expect(await isDemoCustomer(prepared)).toBe(true);
  });

  it("never labels another photo as the generated customer", async () => {
    const other = fs.readFileSync(path.join(process.cwd(), "public", "demo", "customer-head-down.jpg"));
    expect(await isDemoCustomer(other)).toBe(false);
  });

  it("treats an unreadable file as not the demo", async () => {
    expect(await isDemoCustomer(Buffer.from("not an image"))).toBe(false);
  });
});
