"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LoaderCircle, Search } from "lucide-react";

export function StandingsFilters({ seasons, classes, seasonId, classId, search, includeSearch = true }: {
  seasons: { id: string; name: string }[];
  classes: { id: string; name: string; divisionName: string }[];
  seasonId: string;
  classId: string;
  search: string;
  includeSearch?: boolean;
}) {
  const divisions = Array.from(new Set(classes.map((item) => item.divisionName)));
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  function navigate(form: HTMLFormElement | null, changedSeason = false) {
    if (!form) return;
    const values = new FormData(form);
    const params = new URLSearchParams();
    params.set("season", String(values.get("season") ?? seasonId));
    if (!changedSeason && values.get("class")) params.set("class", String(values.get("class")));
    const query = String(values.get("search") ?? "").trim();
    if (query) params.set("search", query);
    startTransition(() => router.push(`${pathname}?${params}`, { scroll: false }));
  }
  return <form aria-busy={pending} onSubmit={(event) => { event.preventDefault(); navigate(event.currentTarget); }} className="my-5 flex flex-wrap items-end gap-3">
    <label className="max-w-full text-xs font-semibold">Season
      <select name="season" disabled={pending} defaultValue={seasonId} onChange={(event) => navigate(event.currentTarget.form, true)} className="mt-1 block h-11 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm disabled:opacity-50">
        {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
      </select>
    </label>
    <label className="max-w-[230px] text-xs font-semibold">Classification
      <select name="class" disabled={pending} defaultValue={classId} onChange={(event) => navigate(event.currentTarget.form)}
        className="mt-1 block h-11 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm disabled:opacity-50">
        {divisions.map((division) => <optgroup key={division} label={division}>
          {classes.filter((item) => item.divisionName === division).map((item) =>
            <option key={item.id} value={item.id}>{item.name} {division}</option>)}
        </optgroup>)}
      </select>
    </label>
    {includeSearch ? <><label className="text-xs font-semibold">Contestant
      <input name="search" type="search" disabled={pending} defaultValue={search} placeholder="Find a roper" maxLength={100}
        className="mt-1 block h-11 w-48 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm" />
    </label>
    <button disabled={pending} aria-label="Search standings" title="Search standings" className="grid h-11 w-11 place-items-center rounded-md brand-accent-fill text-white disabled:opacity-50"><Search size={18} /></button></> : null}
    {pending ? <p role="status" className="flex min-h-11 items-center gap-2 text-sm font-semibold"><LoaderCircle size={20} className="animate-spin" />Loading standings...</p> : null}
  </form>;
}
