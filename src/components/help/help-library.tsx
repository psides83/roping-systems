"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { filterProducerGuides, helpCategories, producerGlossary } from "@/lib/producer-help";

export function HelpLibrary() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const guides = filterProducerGuides(query, category);
  return <div className="space-y-7">
    <section aria-label="Find a guide" className="space-y-4 rounded-lg border border-[#dfe4e1] bg-white p-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="grid w-full min-w-0 gap-2 text-sm font-semibold sm:flex-1">Find a guide
          <span className="flex min-h-11 items-center gap-2 rounded-md border border-[#ccd4d0] px-3"><Search size={18} className="shrink-0 text-[#66716b]" aria-hidden="true" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try enter twice, payouts, or timing" className="h-11 min-w-0 flex-1 bg-transparent font-normal outline-none" /></span>
        </label>
        <label className="grid gap-2 text-sm font-semibold">When you need it
          <select value={category} onChange={event => setCategory(event.target.value)} className="h-11 rounded-md border border-[#ccd4d0] bg-white px-3 font-normal"><option value="all">All guides</option>{helpCategories.map(item => <option key={item}>{item}</option>)}</select>
        </label>
      </div>
      <p role="status" className="text-sm text-[#66716b]">{guides.length} {guides.length === 1 ? "guide" : "guides"}{query.trim() ? ` matching “${query.trim()}”` : " available"}</p>
    </section>
    {guides.length ? <section aria-label="Guides" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{guides.map(guide => <Link key={guide.id} href={`/help/${guide.id}`} className="group flex flex-col rounded-lg border border-[#dfe4e1] bg-white p-5 transition hover:border-[var(--brand-accent)] focus-visible:outline-2 focus-visible:outline-offset-2">
      <p className="text-xs font-semibold text-[var(--brand-accent-strong)]">{guide.category}</p><h2 className="mt-2 text-base font-bold leading-6">{guide.title}</h2><p className="mt-2 flex-1 text-sm leading-6 text-[#66716b]">{guide.summary}</p><span className="mt-4 inline-flex min-h-9 items-center gap-2 text-sm font-semibold text-[var(--brand-accent-strong)]">Read guide<ArrowRight size={16} aria-hidden="true" /></span>
    </Link>)}</section> : <section className="rounded-lg border border-dashed border-[#ccd4d0] p-8 text-center"><h2 className="font-bold">No guides match those filters</h2><p className="mt-2 text-sm text-[#66716b]">Try a shorter phrase or browse all guides.</p><button type="button" onClick={() => { setQuery(""); setCategory("all"); }} className="mt-4 min-h-11 rounded-md border bg-white px-4 text-sm font-semibold">Show all guides</button></section>}
    <section id="glossary" aria-labelledby="glossary-title" className="scroll-mt-24 rounded-lg border border-[#dfe4e1] bg-white p-5 sm:p-6">
      <h2 id="glossary-title" className="flex items-center gap-2 text-lg font-bold"><BookOpen size={20} aria-hidden="true" />A few useful terms</h2><p className="mt-2 text-sm leading-6 text-[#66716b]">These are the names used in the app. Your organization may use different terms on its flyers.</p>
      <dl className="mt-5 grid gap-x-8 gap-y-5 md:grid-cols-2">{producerGlossary.map(item => <div key={item.term}><dt className="text-sm font-bold">{item.term}</dt><dd className="mt-1 text-sm leading-6 text-[#66716b]">{item.definition}</dd></div>)}</dl>
    </section>
  </div>;
}
