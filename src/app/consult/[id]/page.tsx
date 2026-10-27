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
  // The desk's own clock, 24-hour, so the heading carries no "a.m." full stop (charter 7) and no server time zone.
  const when = new Date(consult.created).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short", hourCycle: "h23", timeZone: "America/Toronto" });

  return (
    <>
      <h1 className="pt-2 text-[34px]">
        Consult of <span className="whitespace-nowrap">{when}</span>
      </h1>
      <p className="pb-6 pt-2 text-[14px] text-muted">
        {consult.note ? `The customer wrote: "${consult.note}"` : "Saved on the desk, with every render and the agent's log."}
      </p>
      <SavedConsult events={events} />
    </>
  );
}

export const metadata = { title: "A saved consult" };

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
