"use client";

import { useRef, useState } from "react";
import { Search, Printer, FileText, ChevronDown } from "lucide-react";
import { isRulesPdfUrl, type RulesDocument } from "@/lib/producer-rules";
import { RuleText } from "./rule-text";

export function RulesContent({ document, updatedAt, preview = false, kind = "rules", anchorPrefix = "rule" }: { document: RulesDocument; updatedAt?: string | null; preview?: boolean; kind?: "rules" | "bulletin"; anchorPrefix?: string }) {
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const term = query.trim().toLowerCase();
  const matches = (title: string, text: string) => `${title} ${text}`.toLowerCase().includes(term);
  const sections = document.sections.flatMap((section) => {
    if (!term || matches(section.title, section.content)) return [section];
    const subsections = section.subsections.filter((child) => matches(child.title, child.content));
    return subsections.length ? [{ ...section, subsections }] : [];
  });
  function print() {
    const details = [...(root.current?.querySelectorAll("details") ?? [])];
    const states = details.map((item) => item.open);
    details.forEach((item) => { item.open = true; });
    const article = root.current?.querySelector("article");
    article?.classList.add("print-active-document");
    window.print();
    article?.classList.remove("print-active-document");
    details.forEach((item, index) => { item.open = states[index]; });
  }
  return <div ref={root} className="space-y-6">
    {!preview && <div className="flex flex-wrap items-center gap-3 print:hidden">
      <label className="relative"><Search size={16} className="pointer-events-none absolute left-3 top-3 text-[#758078]" /><span className="sr-only">Search {kind}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${kind}`} className="h-10 w-60 max-w-full rounded-md border border-[#ccd4d0] bg-white pl-9 pr-3 text-sm" /></label>
      <button type="button" onClick={print} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold"><Printer size={16} />Print</button>
    </div>}
    <article className="print-rules min-w-0">
      <header className="mb-7 border-b border-[#dfe4e1] pb-5">
        {kind === "bulletin" ? <h2 className="break-words text-xl font-bold">{document.title || "Bulletin"}</h2> : <h1 className="break-words text-3xl font-bold">{document.title || "Rules"}</h1>}
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#66716b]">
          {document.effectiveOn && <span>{kind === "bulletin" ? "Dated" : "Effective"} {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${document.effectiveOn}T12:00:00Z`))}</span>}
          {updatedAt && <span>Updated {new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(updatedAt))}</span>}
        </div>
        {document.introduction && <div className="mt-4"><RuleText text={document.introduction} /></div>}
      </header>
      <div className="grid min-w-0 gap-7 lg:grid-cols-[210px_minmax(0,1fr)] print:block">
        <nav aria-label={kind === "bulletin" ? "Bulletin sections" : "Rules sections"} className="print:hidden"><p className="mb-2 text-xs font-bold uppercase text-[#758078]">Sections</p><div className="flex flex-wrap gap-x-4 gap-y-2 lg:flex-col">{sections.map((section) => <a key={section.id} href={`#${anchorPrefix}-${section.id}`} className="break-words text-sm font-semibold text-[var(--brand-accent-strong)] hover:underline">{section.title || "Untitled section"}</a>)}</div></nav>
        <div className="min-w-0 space-y-7">
          {sections.map((section) => <section key={section.id} id={`${anchorPrefix}-${section.id}`} className="scroll-mt-5 border-b border-[#dfe4e1] pb-6">
            <h2 className="mb-3 break-words text-xl font-bold">{section.title || "Untitled section"}</h2>
            <RuleText text={section.content} />
            {section.subsections.map((child) => <details key={`${child.id}-${term}`} open={term ? true : undefined} className="border-t border-[#edf0ee] py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold"><span className="min-w-0 break-words">{child.title || "Untitled subsection"}</span><ChevronDown size={17} className="shrink-0" /></summary>
              <div className="pt-3"><RuleText text={child.content} /></div>
            </details>)}
          </section>)}
          {!sections.length && <p className="text-sm text-[#66716b]">{term ? "No sections match your search." : "No sections added yet."}</p>}
          {document.attachments.length > 0 && <section><h2 className="mb-3 text-lg font-bold">Documents</h2><div className="space-y-3">{document.attachments.map((item) => <a key={item.id} href={isRulesPdfUrl(item.url) ? item.url : undefined} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 break-words text-sm font-semibold text-[var(--brand-accent-strong)]"><FileText size={17} className="shrink-0" />{item.name} (PDF)</a>)}</div></section>}
        </div>
      </div>
    </article>
  </div>;
}
