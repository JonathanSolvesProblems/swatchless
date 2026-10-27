import { Suspense } from "react";
import Link from "next/link";
import { swatchFor } from "@/lib/catalog";
import { listConsults } from "@/lib/store";
import { watchList } from "@/lib/watch";
import { Footer, Masthead } from "../chrome";
import { Ring, RingMark, Shade, Tag, shadeName } from "../ring";

export const metadata = { title: "Watch list" };

async function Rows() {
  const rows = await watchList(true);
  if (!rows.length) {
    // Nothing waiting: show what the desk has actually recommended, every one in stock when it checked.
    const recommended = new Map<string, { shade: string; swatch: string | null; store: string }>();
    for (const c of await listConsults()) {
      for (const r of c.result.recommendations)
        recommended.set(`${r.store}:${r.shade}`, { shade: r.shade, swatch: r.swatch_url ?? swatchFor(r.shade), store: r.store });
    }
    // An empty ring on the right is the state itself: nothing hangs on it until a store runs out.
    return (
      <div className="watch-empty">
        <div className="flex flex-col gap-5">
          <p className="max-w-[56ch] text-[17px] leading-relaxed text-muted">
            Nobody is waiting on a shade right now. For the record, these are the shades the desk has recommended so far, every one in
            stock when it checked the store:
          </p>
          <ul className="recommended" aria-label="Shades recommended so far">
            {[...recommended.values()].map((r) => (
              <li key={`${r.store}:${r.shade}`}>
                <Shade name={`${shadeName(r.shade)}, ${r.store}`} swatch={r.swatch} />
              </li>
            ))}
          </ul>
        </div>
        <RingMark size={260} className="watch-ring" />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Tag code="Checked">every product below, against the store&rsquo;s own site, when this page loaded</Tag>
      </div>
      <Ring>
        {rows.map((r) => (
          <li key={`${r.consult_id}-${r.variant_id}`} className="weft">
            <span className="weft-line" aria-hidden />
            <div className="weft-tag">
              <span className="tag-code">{r.in_stock ? "Back in stock" : r.in_stock === false ? "Still out of stock" : "Not checked"}</span>
              <span className="weft-title">{r.title}</span>
              <span className="weft-meta">
                {r.store} · checked {r.source === "store" ? "on the store's site just now" : "against the last catalogue"}
              </span>
            </div>
            <p className="weft-why">
              Wanted for the customer in consult{" "}
              <Link className="text-link" href={`/consult/${r.consult_id}`}>
                {r.consult_id}
              </Link>
              .{" "}
              {r.follow_up
                ? `Followed up ${r.follow_up.at.slice(0, 10)}: ${r.follow_up.result.recommendations.length ? "re-rendered and sent." : "no longer suits them, so nothing was sent."}`
                : "The desk follows up with a fresh render when it comes back."}
            </p>
          </li>
        ))}
      </Ring>
    </div>
  );
}

export default function WatchPage() {
  return (
    <>
      <Masthead current="watch" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 sm:px-8">
        <section className="flex flex-col gap-3 pb-8 pt-6">
          <h1 className="max-w-[26ch] text-[clamp(2.2rem,4.5vw,3.6rem)] leading-[1.04]">The shades a customer is waiting on</h1>
          <p className="max-w-[62ch] text-[17px] leading-relaxed text-muted">
            When the desk finds the right shade but the store is out of it, it refuses to recommend it and puts it here instead. Every day it
            re-reads the store&rsquo;s live stock, and when a shade comes back it renders it on the customer again and writes to them.
          </p>
        </section>
        <Suspense fallback={<p className="text-muted">Checking each store&rsquo;s live stock</p>}>
          <Rows />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
