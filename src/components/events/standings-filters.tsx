"use client";

export function StandingsFilters({ seasons, classes, seasonId, classId, search }: {
  seasons: { id: string; name: string }[];
  classes: { id: string; name: string; divisionName: string }[];
  seasonId: string;
  classId: string;
  search: string;
}) {
  const divisions = Array.from(new Set(classes.map((item) => item.divisionName)));
  return <form className="my-5 flex flex-wrap items-end gap-3">
    <label className="text-xs font-semibold">Season
      <select name="season" defaultValue={seasonId} onChange={(event) => {
        const form = event.currentTarget.form;
        const classSelect = form?.elements.namedItem("class") as HTMLSelectElement | null;
        if (classSelect) classSelect.disabled = true;
        form?.requestSubmit();
      }} className="mt-1 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">
        {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
      </select>
    </label>
    <label className="max-w-[230px] text-xs font-semibold">Class
      <select name="class" defaultValue={classId} onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="mt-1 block h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm">
        {divisions.map((division) => <optgroup key={division} label={division}>
          {classes.filter((item) => item.divisionName === division).map((item) =>
            <option key={item.id} value={item.id}>{item.name} {division}</option>)}
        </optgroup>)}
      </select>
    </label>
    <label className="text-xs font-semibold">Contestant
      <input name="search" type="search" defaultValue={search} placeholder="Find a roper" maxLength={100}
        className="mt-1 block h-10 w-48 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3 text-sm" />
    </label>
    <button className="h-10 rounded-md brand-accent-fill px-3 text-sm font-semibold text-white">Search</button>
  </form>;
}
