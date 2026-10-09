"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { saveBulletin } from "@/app/(app)/settings/news/actions";

type Item = { id: string; title: string; date: string; published: boolean; revision: number; changed: boolean };
export function BulletinManager({ items }: { items: Item[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const visible = items.filter((item) => item.title.toLowerCase().includes(query.toLowerCase()) && (filter === "all" || item.published === (filter === "published")));
  function remove(item: Item) {
    if (!window.confirm(`Delete ${item.title}? Its draft and public bulletin will be removed. The changelog is retained.`)) return;
    startTransition(async () => {
      try { const result = await saveBulletin(item.id, null, item.revision, "delete"); setError(result.error ?? ""); }
      catch { setError("Unable to delete. Please try again."); }
    });
  }
  return <div className="space-y-4"><div className="flex flex-wrap gap-3"><input aria-label="Search bulletins" type="search" placeholder="Search bulletins" className="h-10 w-60 max-w-full rounded-md border bg-white px-3 text-sm" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="Publication status" className="h-10 rounded-md border bg-white pl-3 pr-9 text-sm" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="all">All bulletins</option><option value="published">Published</option><option value="draft">Not published</option></select></div>{error && <p role="alert" className="text-sm text-rose-800">{error}</p>}<ul className="divide-y divide-[#d7ddda]">{visible.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-4"><div className="min-w-0"><Link className="break-words font-semibold hover:underline" href={`/settings/news/${item.id}`}>{item.title}</Link><p className="mt-1 text-xs text-[#66716b]">{item.date || "No date"} · {item.published ? "Published" : "Draft"}{item.changed ? " · Unpublished changes" : ""}</p></div><div className="flex shrink-0 gap-2"><Link href={`/settings/news/${item.id}`} title="Edit bulletin" aria-label={`Edit ${item.title}`} className="grid h-10 w-10 place-items-center rounded-md border bg-white"><Pencil size={16} /></Link><button disabled={pending} onClick={() => remove(item)} title="Delete bulletin" aria-label={`Delete ${item.title}`} className="grid h-10 w-10 place-items-center rounded-md border bg-white text-rose-700 disabled:opacity-40"><Trash2 size={16} /></button></div></li>)}</ul>{!visible.length && <p className="py-6 text-sm text-[#66716b]">{items.length ? "No matching bulletins." : "No bulletins yet."}</p>}</div>;
}
