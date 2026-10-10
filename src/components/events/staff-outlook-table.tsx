"use client";
import { useState } from "react";
import { outlookStatusLabels, type projectFinalsOutlook } from "@/lib/finals-outlook";

export function StaffOutlookTable({ rows, today, minimumRopings, topPlaces, standingsCutoff, attendanceCutoff }: {
  rows: { id: string; name: string; progress: ReturnType<typeof projectFinalsOutlook> }[];
  today: string; minimumRopings: number; topPlaces: number | null; standingsCutoff: string; attendanceCutoff: string;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const visible = rows.filter(row => row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
    (status === "all" || status === "attendance" && ["attendance", "both"].includes(row.progress.status) || status === "standings" && ["standings", "both"].includes(row.progress.status) || row.progress.status === status));
  return <details className="space-y-4 border-y border-[#dfe4e1] py-4">
    <summary className="cursor-pointer font-semibold">Projected qualifying field · {rows.filter(row => row.progress.qualified).length} currently meet qualification requirements</summary>
    <p className="text-sm text-[#66716b]">As of {today}, using official results. Read-only preview: this does not save a qualification check, award positions, or approve entries. Classification, membership, fines, suspensions, and staff exceptions are reviewed when entering.</p>
    <p className="text-xs text-[#66716b]">{topPlaces !== null ? `Standings through ${standingsCutoff} · ` : ""}{minimumRopings > 0 ? `Attendance through ${attendanceCutoff} · ` : ""}Cutoff dates include that day.</p>
    <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-xs font-semibold">Roper<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a roper" className="h-10 w-48 max-w-full rounded-md border bg-white px-3 text-sm" /></label><label className="grid gap-1 text-xs font-semibold">Outlook<select value={status} onChange={event => setStatus(event.target.value)} className="h-10 max-w-full rounded-md border bg-white pl-3 pr-9 text-sm"><option value="all">All ropers</option><option value="qualifies">Currently meets requirements</option><option value="attendance">Attendance needed</option><option value="standings">Outside qualifying places</option><option value="review">Producer review needed</option></select></label></div>
    <ul className="divide-y divide-[#dfe4e1]">{visible.map(({ id, name, progress }) => <li key={id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"><div className="min-w-0"><p className="break-words font-semibold">{name}</p><p className={`mt-1 text-xs font-semibold ${progress.qualified ? "text-emerald-700" : "text-[#66716b]"}`}>{outlookStatusLabels[progress.status]}</p>{progress.reasons.map(reason => <p key={reason} className="mt-1 text-xs text-[#66716b]">{reason}</p>)}</div><dl className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
      {topPlaces !== null && <div><dt className="text-[#66716b]">Standings</dt><dd className="mt-1 font-semibold">{progress.rank === null ? "Not ranked" : `#${progress.rank}`} / Top {topPlaces}</dd></div>}
      {minimumRopings > 0 && <div><dt className="text-[#66716b]">Attendance</dt><dd className="mt-1 font-semibold">{progress.attendance} / {minimumRopings}</dd></div>}
      <div><dt className="text-[#66716b]">Assigned bonus</dt><dd className="mt-1 font-semibold">{progress.assigned}</dd></div>
      <div><dt className="text-[#66716b]">Allowance if eligible</dt><dd className="mt-1 font-semibold">{progress.allowance ?? "Unlimited"}</dd></div>
    </dl></li>)}</ul>
    {!visible.length && <p className="py-3 text-sm text-[#66716b]">No ropers match this view.</p>}
  </details>;
}
