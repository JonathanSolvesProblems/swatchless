import { Suspense } from "react";
import { consultEvents, consultLabel } from "@/lib/replay";
import { listConsults } from "@/lib/store";
import { Footer, Masthead } from "./chrome";
import { Desk } from "./desk";
import { Hero } from "./hero";

async function DeskWithLatest() {
  // Only the labelled demo customer opens on the public desk. A visitor's own consult stays in their session and
  // at its own unguessable link, so their face never becomes the page everyone else sees.
  const latest = (await listConsults()).find((c) => c.result.status === "recommended" && c.disclosure);
  return (
    <Desk
      hero={<Hero match={latest?.result.recommendations[0]?.shade} />}
      latest={latest ? { id: latest.id, label: consultLabel(latest), events: consultEvents(latest) } : undefined}
    />
  );
}

export default function Home() {
  return (
    <>
      <Masthead current="desk" />
      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 pb-16 pt-4 sm:px-8">
        <Suspense fallback={<Desk hero={<Hero />} />}>
          <DeskWithLatest />
        </Suspense>
      </main>
      <Footer />
    </>
  );
}
