"use client";

import { useState, useTransition } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { searchOnlineRopers, type OnlineRoperSearchResult } from "@/app/public/[producerSlug]/[eventSlug]/enter/actions";

export function OnlineRoperSearch({ producerSlug, eventSlug, selected, onSelect }: {
  producerSlug: string; eventSlug: string; selected: OnlineRoperSearchResult | null;
  onSelect: (record: OnlineRoperSearchResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<OnlineRoperSearchResult[]>([]);
  const [message, setMessage] = useState("");
  const [pending, startSearch] = useTransition();
  return <section className="border-b border-[#dfe4e1] pb-5 sm:col-span-2">
    <h2 className="text-sm font-bold">Find your roper record</h2>
    {selected ? <div className="mt-3 flex flex-wrap items-center gap-3 text-sm"><span className="font-semibold">{selected.first_name} {selected.last_name} · {selected.member_number}</span><button type="button" onClick={() => onSelect(null)} className="flex min-h-10 items-center gap-2 rounded-md border border-[#ccd4d0] px-3"><X size={16} />Change roper</button></div> : <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input aria-label="Search roper name or member number" placeholder="Name or member number" value={query} disabled={pending} maxLength={80} onChange={event => {setQuery(event.target.value); setRecords([]); setMessage("");}} onKeyDown={event => {if(event.key === "Enter") event.preventDefault();}} className="h-11 w-64 max-w-full rounded-md border border-[#ccd4d0] px-3" />
        <button type="button" disabled={pending || query.trim().length < 3} onClick={() => startSearch(async () => { const result = await searchOnlineRopers(producerSlug,eventSlug,query); setRecords(result.records ?? []); setMessage(result.error ?? (result.records?.length ? "" : "No matching record. Enter your details below.")); })} className="flex h-11 items-center gap-2 rounded-md border border-[#ccd4d0] px-3 text-sm font-semibold disabled:opacity-50">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Search size={16} />}Search</button>
      </div>
      {records.length > 0 && <ul className="mt-3 divide-y divide-[#e1e6e3]">{records.map(record => <li key={record.record_id}><button type="button" onClick={() => {onSelect(record); setRecords([]);}} className="flex min-h-12 w-full flex-wrap items-center justify-between gap-2 py-2 text-left text-sm hover:bg-[#f7f8f7]"><span className="font-semibold">{record.first_name} {record.last_name}</span><span className="text-[#66716b]">{[record.member_number,record.city,record.state].filter(Boolean).join(" · ")}</span></button></li>)}</ul>}
      <p className="mt-3 text-sm text-[#66716b]">First time here? Enter your details below.</p>
    </>}
    {message && <p role="status" className="mt-2 text-sm text-[#66716b]">{message}</p>}
  </section>;
}
