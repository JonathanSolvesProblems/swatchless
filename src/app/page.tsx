import { Suspense } from "react";
import { consultEvents, consultLabel } from "@/lib/replay";
import { listConsults } from "@/lib/store";
import { Footer, Masthead } from "./chrome";
import { Desk } from "./desk";
import { Hero } from "./hero";

async function DeskWithLatest() {
  const latest = (await listConsults()).find((c) => c.result.status === "recommended");
  return <Desk hero={<Hero />} latest={latest ? { id: latest.id, label: consultLabel(latest), events: consultEvents(latest) } : undefined} />;
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
