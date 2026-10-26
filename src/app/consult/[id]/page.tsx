import { Suspense } from "react";
import { notFound } from "next/navigation";
import { consultEvents } from "@/lib/replay";
import { loadConsult } from "@/lib/store";
import { Footer, Masthead } from "../../chrome";
import { SavedConsult } from "./saved";

async function Consult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const consult = await loadConsult(id);
  if (!consult) notFound();

  const events = consultEvents(consult);
  const when = new Date(consult.created).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" }).replace(/\.$/, "");

  return (
    <>
      <p className="pb-6 pt-2 text-[14px] text-muted">
        Saved consult {consult.id}, {when}
        {consult.note ? `. The customer wrote: "${consult.note}"` : ""}
      </p>
      <SavedConsult events={events} />
    </>
  );
}

export default function ConsultPage(props: PageProps<"/consult/[id]">) {
  return (
    <>
      <Masthead current="desk" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 sm:px-8">
        <Suspense fallback={<p className="pt-2 text-muted">Opening the saved consult</p>}>
          <Consult params={props.params} />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
