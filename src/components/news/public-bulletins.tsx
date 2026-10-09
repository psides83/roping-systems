"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { RulesContent } from "@/components/rules/rules-content";
import type { RulesDocument } from "@/lib/producer-rules";

export type PublicBulletin = { id: string; document: RulesDocument; publishedAt: string };
export function PublicBulletins({ items, selected }: { items: PublicBulletin[]; selected?: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("latest");
  const [page, setPage] = useState(Math.max(0, Math.floor(items.findIndex((item) => item.id === selected) / 10)));
  const term = query.trim().toLowerCase();
  const filtered = items.filter((item) => !term || [item.document.title, item.document.introduction, ...item.document.sections.flatMap((section) => [section.title, section.content, ...section.subsections.flatMap((child) => [child.title, child.content])])].join(" ").toLowerCase().includes(term));
  const ordered = sort === "latest" ? filtered : [...filtered].reverse();
  const pages = Math.ceil(ordered.length / 10);
  const current = Math.min(page, Math.max(0, pages - 1));
  return <div className="space-y-5"><div className="flex flex-wrap items-center gap-3"><input aria-label="Search news" type="search" placeholder="Search news" className="h-10 w-60 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} /><select aria-label="Sort news" className="h-10 rounded-md border border-[#ccd4d0] bg-white pl-3 pr-9 text-sm" value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }}><option value="latest">Latest first</option><option value="oldest">Oldest first</option></select><span className="text-xs text-[#66716b]">{filtered.length} {filtered.length === 1 ? "bulletin" : "bulletins"}</span></div>
    {ordered.slice(current * 10, current * 10 + 10).map((item) => <details key={item.id} id={`bulletin-${item.id}`} open={item.id === selected || term ? true : undefined} className="rounded-md border border-[#d7ddda] bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 sm:p-5"><div className="min-w-0"><h2 className="break-words text-lg font-bold">{item.document.title}</h2><p className="mt-1 text-xs text-[#66716b]">{new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${item.document.effectiveOn}T12:00:00Z`))}</p></div><ChevronDown size={18} className="shrink-0" /></summary>
      <div className="border-t border-[#d7ddda] p-4 sm:p-5"><RulesContent document={item.document} updatedAt={item.publishedAt} kind="bulletin" anchorPrefix={`bulletin-${item.id}`} /></div>
    </details>)}
    {!filtered.length && <p className="py-8 text-sm text-[#66716b]">{items.length ? "No bulletins match your search." : "This producer has not published any news yet."}</p>}
    {pages > 1 && <nav aria-label="News pages" className="flex items-center gap-3 text-sm"><button className="h-10 rounded-md border bg-white px-3 disabled:opacity-40" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current + 1} of {pages}</span><button className="h-10 rounded-md border bg-white px-3 disabled:opacity-40" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</button></nav>}
  </div>;
}
