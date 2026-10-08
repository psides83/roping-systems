"use client";

import { useState, type ReactNode } from "react";
import { Download, Filter, Search } from "lucide-react";
import Papa from "papaparse";
import type { MemberSummary } from "@/types/domain";
import { matchesSearch } from "@/lib/list-controls";

export function MemberList({ members, rows, head }: { members: MemberSummary[]; rows: ReactNode[]; head: ReactNode }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [classification, setClassification] = useState("");
  const [sort, setSort] = useState("name");
  const [filters, setFilters] = useState(false);
  const [page, setPage] = useState(0);
  const options = [...new Set(members.flatMap((member) => member.classifications?.map((item) => `${item.discipline}: ${item.name}`) ?? []))].sort();
  const filtered = members.map((member, index) => ({ member, index })).filter(({ member }) =>
    matchesSearch([member.name, member.memberNumber, member.phone, member.email], search) &&
    (!status || member.status === status) &&
    (!classification || (classification === "unclassified" ? !member.classifications?.length : member.classifications?.some((item) => `${item.discipline}: ${item.name}` === classification))),
  ).sort((a, b) => sort === "joined" ? (Date.parse(b.member.joinedAt) || 0) - (Date.parse(a.member.joinedAt) || 0) : (sort === "number" ? a.member.memberNumber : a.member.name).localeCompare(sort === "number" ? b.member.memberNumber : b.member.name, undefined, { numeric: true }));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 25));
  const current = Math.min(page, pageCount - 1);
  function exportMembers() {
    const csv = Papa.unparse(filtered.map(({ member }) => ({ Name: member.name, "Member number": member.memberNumber, Phone: member.phone, Email: member.email, Classifications: member.classifications?.map((item) => `${item.discipline}: ${item.name}`).join("; ") || "Unclassified", Status: member.status, Joined: member.joinedAt })), { escapeFormulae: true });
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "members.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const control = "h-10 max-w-full rounded-md border border-[#d7ddda] bg-white px-3 text-sm";
  return <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
    <div className="flex flex-wrap items-center gap-3 border-b border-[#e7ebe8] p-4">
      <label className="flex h-10 w-80 max-w-full items-center gap-2 rounded-md border border-[#d7ddda] px-3"><Search size={17}/><input aria-label="Search members" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} className="min-w-0 flex-1 text-sm outline-none" placeholder="Name, member number, phone or email"/></label>
      <button type="button" aria-expanded={filters} onClick={() => setFilters(!filters)} className={`${control} flex items-center gap-2`}><Filter size={16}/> Filter{status || classification ? " (active)" : ""}</button>
      <select aria-label="Sort members" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }} className={control}><option value="name">Name A-Z</option><option value="number">Member number</option><option value="joined">Latest joined</option></select>
      <button type="button" disabled={!filtered.length} onClick={exportMembers} title="Export all matching members" aria-label="Export members" className={`${control} disabled:opacity-40`}><Download size={17}/></button>
    </div>
    {filters && <div className="flex flex-wrap gap-3 border-b border-[#e7ebe8] p-4">
      <select aria-label="Membership status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} className={control}><option value="">All statuses</option>{[...new Set(members.map((member) => member.status))].sort().map((value) => <option key={value} value={value}>{value.charAt(0).toUpperCase() + value.slice(1)}</option>)}</select>
      <select aria-label="Member classification" value={classification} onChange={(event) => { setClassification(event.target.value); setPage(0); }} className={control}><option value="">All classifications</option><option value="unclassified">Unclassified</option>{options.map((value) => <option key={value}>{value}</option>)}</select>
      {(search || status || classification) && <button type="button" className={control} onClick={() => { setSearch(""); setStatus(""); setClassification(""); setPage(0); }}>Clear filters</button>}
    </div>}
    <div className="overflow-x-auto scrollbar-subtle"><table className="w-full min-w-[860px] text-left">{head}<tbody className="divide-y divide-[#e7ebe8]">{filtered.slice(current * 25, current * 25 + 25).map(({ index }) => rows[index])}{!filtered.length && <tr><td colSpan={7} className="p-8 text-center text-sm text-[#66716b]">No members match these filters.</td></tr>}</tbody></table></div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e7ebe8] px-5 py-4 text-xs text-[#758078]" aria-live="polite"><span>{filtered.length ? `${current * 25 + 1}-${Math.min(current * 25 + 25, filtered.length)} of ${filtered.length}` : "0"} members</span><div className="flex items-center gap-2"><button type="button" disabled={!current} onClick={() => setPage(current - 1)} className={`${control} disabled:opacity-40`}>Previous</button><span>{current + 1} / {pageCount}</span><button type="button" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)} className={`${control} disabled:opacity-40`}>Next</button></div></div>
  </section>;
}
