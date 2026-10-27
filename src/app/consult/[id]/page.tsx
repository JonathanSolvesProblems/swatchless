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
  // The desk's own clock, 24-hour, so nothing here carries an "a.m." full stop (charter 7) or the server's time zone.
  const created = new Date(consult.created);
  const day = created.toLocaleDateString("en-CA", { dateStyle: "medium", timeZone: "America/Toronto" });
  const time = created.toLocaleTimeString("en-CA", { timeStyle: "short", hourCycle: "h23", timeZone: "America/Toronto" });

  return (
    <>
      <h1 className="pt-2 text-[28px] sm:text-[34px]">
        Consult of <span className="whitespace-nowrap">{day}</span>
      </h1>
      <p className="pb-6 pt-2 text-[14px] text-muted">
        At {time}. {consult.note ? `The customer wrote: "${consult.note}"` : "Saved on the desk, with every render and the agent's log."}
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
