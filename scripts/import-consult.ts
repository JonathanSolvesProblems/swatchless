/** Import a command-line consult log (tmp/consults/*.json) into the consult store. */
import fs from "node:fs";
import sharp from "sharp";
import { saveConsult } from "../src/lib/store";

async function main() {
  const [log, selfiePath, headPath, note] = process.argv.slice(2);
  const d = JSON.parse(fs.readFileSync(log, "utf8"));
  const prep = (f: string) => sharp(f).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
  const selfie = await prep(selfiePath);
  const headDown = headPath ? await prep(headPath) : undefined;
  console.log(await saveConsult({ result: d.result, events: d.events, selfie, headDown, note: note ?? "" }));
}
main();
