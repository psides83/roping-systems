"use client";

import { createContext, useContext, type ReactNode } from "react";
import { formatEntryLabel, type EntryLabelStyle } from "@/lib/entry-labels";

const EntryLabelContext = createContext<EntryLabelStyle>("number");

export function EntryLabelProvider({ style, children }: { style: EntryLabelStyle; children: ReactNode }) {
  return <EntryLabelContext value={style}>{children}</EntryLabelContext>;
}

export function useEntryLabelStyle() {
  return useContext(EntryLabelContext);
}

export function EntryLabel({ number }: { number: number }) {
  const style = useEntryLabelStyle();
  return <>{style === "number" ? "#" : ""}{formatEntryLabel(number, style)}</>;
}
