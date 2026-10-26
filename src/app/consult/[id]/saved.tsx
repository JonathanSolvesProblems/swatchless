"use client";

import { ConsultView, replay, type StreamEvent } from "../../desk";

export function SavedConsult({ events }: { events: StreamEvent[] }) {
  return <ConsultView state={replay(events)} />;
}
