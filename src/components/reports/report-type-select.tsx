"use client";
import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle } from "lucide-react";

export function ReportTypeSelect({ type, choices, defaultSeason }: { type: string; choices: { id: string; name: string }[]; defaultSeason?: string }) {
  const router = useRouter(); const params = useSearchParams(); const [pending, startTransition] = useTransition();
  return <div className="flex items-end gap-2"><label className="grid gap-1 text-sm font-semibold">Report<select value={type} disabled={pending} onChange={event => {
    const next = new URLSearchParams({ report: event.target.value });
    if (params.get("producer")) next.set("producer", params.get("producer")!);
    const season = params.get("season");
    if (season && season !== "all") next.set("season", season);
    else if (["standings", "attendance"].includes(event.target.value) && defaultSeason) next.set("season", defaultSeason);
    else next.set("season", "all");
    startTransition(() => router.push(`/reports?${next}`));
  }} className="h-10 w-48 max-w-full rounded-md border bg-white pl-3 pr-9 text-sm font-normal">{choices.map(choice => <option key={choice.id} value={choice.id}>{choice.name}</option>)}</select></label>{pending && <LoaderCircle aria-label="Loading report" size={18} className="mb-3 animate-spin" />}</div>;
}
