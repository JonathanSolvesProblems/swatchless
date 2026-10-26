import fs from "node:fs";
import path from "node:path";
import { luxyShadeSwatches, swatchFor } from "@/lib/catalog";
import { Footer, Masthead } from "../chrome";
import { Shade, Swatch } from "../ring";

// Read once at module scope: the committed benchmark files are the source of every number on this page.
const DIR = path.join(process.cwd(), "data", "benchmark");
const truth = JSON.parse(fs.readFileSync(path.join(DIR, "luxy-truth.json"), "utf8")) as {
  description: string;
  exclusion_rule: string;
  items: { id: string; shade: string; before_photo: string; source_product: string; source_url: string; shade_offerable: boolean; why_not_offerable?: string }[];
};
const results: Row[] = fs.existsSync(path.join(DIR, "results.json")) ? JSON.parse(fs.readFileSync(path.join(DIR, "results.json"), "utf8")) : [];
// The Luxy shades the desk can be offered: those with a trusted on-model photo, shown as the store's own swatches.
const luxyShades = luxyShadeSwatches();
const LUXY_SHADES = luxyShades.length;

interface Row {
  id: string;
  arm: "full" | "no_youcam";
  truth: string;
  status: string;
  picks: string[];
  top1: boolean;
  in_shortlist: boolean;
  tryons: number;
  youcam_units: number;
  usd_claude: number;
  seconds: number;
  shade_offerable?: boolean;
}

function tally(arm: Row["arm"]) {
  const ran = results.filter((r) => r.arm === arm);
  const rows = ran.filter((r) => r.shade_offerable !== false);
  return {
    ran: ran.length,
    impossible: ran.length - rows.length,
    n: rows.length,
    top1: rows.filter((r) => r.top1).length,
    shortlist: rows.filter((r) => r.in_shortlist).length,
    abstained: rows.filter((r) => r.status !== "recommended").length,
    rendered: rows.filter((r) => r.tryons > 0).length,
  };
}

export default function BenchmarkPage() {
  const full = tally("full");
  const plain = tally("no_youcam");
  const pending = truth.items.length - full.ran;
  return (
    <>
      <Masthead current="benchmark" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 sm:px-8">
        <section className="grid gap-10 pb-12 pt-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-center">
          <div className="flex flex-col gap-5">
            <h1 className="max-w-[22ch] text-[clamp(2.2rem,4.5vw,3.6rem)] leading-[1.04]">
              {full.n > 0 ? (
                <>
                  The shade Luxy&rsquo;s own stylists chose was on the desk&rsquo;s shortlist for {full.shortlist} of {full.n} real customers
                </>
              ) : (
                <>Against Luxy&rsquo;s own stylists</>
              )}
            </h1>
            <p className="max-w-[64ch] text-[17px] leading-relaxed text-muted">
              Luxy Hair photographs real customers before they wear its hair, then publishes the shade it put on them. That shade is the
              answer here. The desk gets only Luxy&rsquo;s &ldquo;before&rdquo; photo, never sees that customer as a reference, and picks
              from {LUXY_SHADES} shades.
              {full.n > 0 && (
                <>
                  {" "}
                  A random shortlist of three would hold it about {((full.n * 3) / LUXY_SHADES).toFixed(1)} times. The first pick was the exact
                  shade for {full.top1} of {full.n}, where chance is about one in {LUXY_SHADES}, and every customer was shown wearing the
                  desk&rsquo;s pick.
                </>
              )}
              {full.impossible > 0 && (
                <>
                  {" "}
                  For {full.impossible} more {full.impossible === 1 ? "customer" : "customers"}, every trusted photo of the shade was a photo of them,
                  so once those were excluded the desk could not be offered it; those rows are counted on neither side.
                </>
              )}
              {pending > 0 && <> {pending} of the {truth.items.length} customers have not been run yet.</>}
            </p>
          </div>
          <figure className="m-0 flex flex-col gap-3">
            <div className="palette" aria-hidden>
              {luxyShades.map(({ shade, swatch }) => (
                <span key={shade} title={shade}>
                  <Swatch src={swatch} size="md" />
                </span>
              ))}
            </div>
            <figcaption className="text-[13px] text-muted">The {LUXY_SHADES} Luxy shades the desk picks from, as the store&rsquo;s own swatches.</figcaption>
          </figure>
        </section>

        <section aria-labelledby="rows-h" className="flex flex-col gap-4">
          <h2 id="rows-h" className="text-3xl">Customer by customer</h2>
          <p className="legend text-[14px] text-muted" aria-label="How to read the table">
            <Shade name="Filled" swatch={swatchFor("Jet Black")} /> the first pick is the shade Luxy chose &nbsp;
            <Shade name="Outlined" swatch={swatchFor("Off Black")} miss /> it differs
          </p>
          <div className="overflow-x-auto">
            <table className="bench">
              <thead>
                <tr>
                  <th scope="col">Luxy&rsquo;s before photo</th>
                  <th scope="col">Shade Luxy chose</th>
                  <th scope="col">Desk with YouCam</th>
                  <th scope="col">Same desk, YouCam off</th>
                </tr>
              </thead>
              <tbody>
                {truth.items.map((t, i) => {
                  const f = results.find((r) => r.id === t.id && r.arm === "full");
                  const p = results.find((r) => r.id === t.id && r.arm === "no_youcam");
                  if (!f && !p) return null;
                  return (
                    <tr key={t.id}>
                      <td>
                        <a href={t.source_url} target="_blank" rel="noreferrer" className="bench-photo">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`${t.before_photo}?width=160`} alt={`Luxy's before photo of customer ${i + 1}`} width={72} height={90} />
                          <span>Customer {i + 1}</span>
                        </a>
                      </td>
                      <td data-label="Shade Luxy chose">
                        <span className="flex flex-col gap-1.5">
                          <Shade name={t.shade} swatch={swatchFor(t.shade)} />
                          {!t.shade_offerable && <span className="max-w-[26ch] text-[12.5px] leading-snug text-muted">Not offerable: {t.why_not_offerable}</span>}
                        </span>
                      </td>
                      <td data-label="Desk with YouCam">
                        <Pick row={f} offerable={t.shade_offerable} />
                      </td>
                      <td data-label="Same desk, YouCam off">
                        <Pick row={p} offerable={t.shade_offerable} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pending > 0 && (
            <p className="max-w-[80ch] text-[14px] leading-relaxed text-muted">
              Not run yet ({pending}):{" "}
              {truth.items
                .filter((t) => !results.some((r) => r.id === t.id))
                .map((t) => `customer ${truth.items.indexOf(t) + 1}, ${t.shade}`)
                .join("; ")}
              . They run as soon as the desk has API access again; every row appears here the same way.
            </p>
          )}
          {plain.n > 0 && (
            <p className="max-w-[70ch] text-[15px] leading-relaxed text-muted">
              The same customers ran with YouCam switched off: the same model, photo and swatches, no YouCam tools. Without YouCam, the
              right shade was on the shortlist for {plain.shortlist} of {plain.n} and the desk showed {plain.rendered} of {plain.n} customers
              wearing anything. With YouCam it was {full.shortlist} of {full.n}, and the desk showed {full.rendered} of {full.n} wearing its
              pick, which is what a customer gets to see before buying hair they cannot return. The first pick matched {full.top1} of {full.n} in both arms: naming the shade is the
              model&rsquo;s job, and YouCam is what puts it on the customer, measures the density that decides fill-ins versus length, and
              gives the desk a render to reject when it changes the face.
            </p>
          )}
        </section>

        <section aria-labelledby="method-h" className="mt-12 grid gap-6 rounded-[4px] bg-surface p-6 lg:grid-cols-2">
          <h2 id="method-h" className="text-2xl lg:col-span-2">How this was measured</h2>
          <p className="text-[15px] leading-relaxed text-muted">{truth.description}</p>
          <p className="text-[15px] leading-relaxed text-muted">{truth.exclusion_rule}</p>
          <p className="text-[15px] leading-relaxed text-muted lg:col-span-2">
            A match means the desk&rsquo;s first pick has the same shade name as the product Luxy put on that customer. Eighteen customers is a
            small sample, and the answer is one stylist team&rsquo;s choice rather than the only right shade. The truth set and every run are
            committed in <code>data/benchmark/</code>.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}

function Pick({ row, offerable }: { row?: Row; offerable: boolean }) {
  if (!row) return <span className="text-muted">not run yet</span>;
  if (row.status !== "recommended" || !row.picks.length)
    return <span className="text-muted">{row.status === "needs_photo" ? "asked for a better photo" : "no pick"}</span>;
  return (
    <span className="flex flex-col gap-1.5">
      <Shade name={row.picks[0]} swatch={swatchFor(row.picks[0])} miss={!row.top1} />
      {!offerable && <span className="text-[12.5px] text-muted">not counted</span>}
      {row.picks.length > 1 && <span className="text-[13px] text-muted">then {row.picks.slice(1).join(", ")}</span>}
    </span>
  );
}
