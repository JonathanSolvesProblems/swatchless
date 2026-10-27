/**
 * The desk keeps working after the reply: every product it wanted but refused because the store was out of
 * stock goes on a watch list. A scheduled run re-reads each store's live product data; when a watched variant
 * is back, the agent renders it on the customer again, checks it still suits them, and drafts the follow-up.
 */
import { findVariant, liveStock, storeName } from "./catalog";
import { runConsult } from "./agent";
import { listConsults, readConsultFile, saveFollowUp, type FollowUp } from "./store";
import { uploadImage } from "./youcam";

export interface WatchRow {
  consult_id: string;
  created: string;
  variant_id: number;
  title: string;
  store: string;
  in_stock: boolean | null;
  source: "store" | "snapshot" | "not checked";
  follow_up: FollowUp | null;
}

export async function watchList(check = false): Promise<WatchRow[]> {
  const rows: WatchRow[] = [];
  for (const c of await listConsults()) {
    for (const w of c.result.watch ?? []) {
      const product = findVariant(w.variant_id);
      const stock = check && product ? await liveStock(product) : null;
      rows.push({
        consult_id: c.id,
        created: c.created,
        variant_id: w.variant_id,
        title: w.title,
        store: storeName(w.store),
        in_stock: stock ? stock.available : null,
        source: stock ? stock.source : "not checked",
        follow_up: c.follow_ups?.find((f) => f.variant_id === w.variant_id) ?? null,
      });
    }
  }
  return rows;
}

/** One scheduled pass: check every watched variant and follow up on the ones that came back. */
export async function runWatch() {
  const rows = await watchList(true);
  const followed: FollowUp[] = [];
  // A row that fails or stops is reported and retried on the next pass; it never blocks the rows after it, and an
  // unfinished run is never saved as a judgement that the piece no longer suits the customer.
  const failed: { consult_id: string; variant_id: number; reason: string }[] = [];
  for (const row of rows) {
    if (!row.in_stock || row.source !== "store" || row.follow_up) continue;
    try {
      const selfie = await readConsultFile(row.consult_id, "selfie.jpg");
      if (!selfie) throw new Error("the consult's selfie is missing");
      const fileId = await uploadImage(selfie);
      const result = await runConsult(
        {
          selfieFileId: fileId,
          selfieDataUrl: `data:image/jpeg;base64,${selfie.toString("base64")}`,
          customerNote: `Follow-up from the desk, not from the customer: "${row.title}" (variant ${row.variant_id}) was shortlisted for this customer on ${row.created.slice(0, 10)} but was out of stock. It is back in stock now. Render it on the customer, check it still suits them, and finalize with just that item and a short note telling them it is back. If it no longer suits them, finalize with no items and say why.`,
        },
        () => {},
      );
      if (result.status !== "recommended") throw new Error(`the follow-up consult ended "${result.status}"`);
      const fu: FollowUp = { variant_id: row.variant_id, at: new Date().toISOString(), result };
      await saveFollowUp(row.consult_id, fu);
      followed.push(fu);
    } catch (err) {
      failed.push({ consult_id: row.consult_id, variant_id: row.variant_id, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { checked: rows.length, back_in_stock: rows.filter((r) => r.in_stock).length, followed_up: followed.length, failed };
}
