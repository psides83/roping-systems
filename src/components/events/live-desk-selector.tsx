"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Radio } from "lucide-react";
import { confirmDeskNavigation } from "./use-desk-leave-guard";

export function LiveDeskSelector({ eventId, ropings, selectedId, round, onPendingChange }: {
  eventId: string;
  ropings: { id: string; name: string; arenaName: string | null; numberOfRuns: number; shortRoundEnabled: boolean }[];
  selectedId: string;
  round: number;
  onPendingChange: (pending: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => { onPendingChange(pending); }, [pending, onPendingChange]);
  const selected = ropings.find((roping) => roping.id === selectedId);
  function navigate(id: string, nextRound: number) {
    if (!confirmDeskNavigation()) return;
    startTransition(() => router.push(`/events/${eventId}/live?division=${encodeURIComponent(id)}&round=${nextRound}`, { scroll: false }));
  }
  return <section aria-label="Active timing desk" aria-busy={pending} className="flex flex-wrap items-end gap-3 border-y border-[#dfe4e1] py-4">
    <label className="grid min-w-0 max-w-full gap-1 text-xs font-semibold text-[#66716b]">Roping
      <select aria-label="Roping" value={selectedId} disabled={pending} onChange={(event) => navigate(event.target.value, 1)} className="h-11 w-80 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold text-[#17201c]">
        {ropings.map((roping) => <option key={roping.id} value={roping.id}>{roping.name} · {roping.arenaName ?? "First Available"}</option>)}
      </select>
    </label>
    <label className="grid gap-1 text-xs font-semibold text-[#66716b]">Round
      <select aria-label="Round" value={round} disabled={pending} onChange={(event) => navigate(selectedId, Number(event.target.value))} className="h-11 w-36 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold text-[#17201c]">
        {Array.from({ length: (selected?.numberOfRuns ?? 0) + (selected?.shortRoundEnabled ? 1 : 0) }, (_, index) => <option key={index + 1} value={index + 1}>{index >= (selected?.numberOfRuns ?? 0) ? "Short round" : `Round ${index + 1}`}</option>)}
      </select>
    </label>
    <p role="status" className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[#526059]">{pending ? <><LoaderCircle size={17} className="animate-spin" />Loading desk...</> : <><Radio size={17} />{selected?.arenaName ?? "First Available"}</>}</p>
  </section>;
}
