import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicData } from "@/lib/events/public-event-data";
import { getBrandStyle } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { calculateSeasonStandings, qualifiesForStandings } from "@/lib/season-standings";
import { loadSeasonStandings, type SeasonStandingsSource } from "@/lib/events/season-standings-data";
import { StandingsFilters } from "@/components/events/standings-filters";
import { seasonCalendarDate } from "@/lib/seasons";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";

export default async function StandingsPage({ params, searchParams }: PageProps<"/public/[producerSlug]/standings">) {
  const { producerSlug } = await params;
  const query = await searchParams;
  const data = await getPublicData(producerSlug, undefined, false);
  if (!data) notFound();
  const { producer } = data;
  const today = seasonCalendarDate(new Date().toISOString(), producer.timezone)!;
  const seasons = [...data.seasons].sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const season = seasons.find((item) => item.id === query.season)
    ?? seasons.find((item) => today >= item.startsOn && today <= item.endsOn) ?? seasons[0];
  let source: SeasonStandingsSource = { contributions: [], moves: [], classes: [], ropers: [] };
  if (season && isSupabaseConfigured()) {
    source = await loadSeasonStandings(producerSlug, season.id);
  }
  source.classes = source.classes.filter((item) => !source.classes.some((group) =>
    group.id.includes(":") && group.id !== item.id && group.name === item.name && group.divisionName === item.divisionName));
  const populatedClasses = new Set(source.contributions.map((item) => item.classId));
  const selectedClass = source.classes.find((item) => item.id === query.class)
    ?? source.classes.find((item) => populatedClasses.has(item.id)) ?? source.classes[0];
  const search = typeof query.search === "string" ? query.search.slice(0, 100) : "";
  const profiles = new Map(source.ropers.map((roper) => [`${roper.roperId}:${roper.classId}`, roper]));
  const names = new Map(source.ropers.map((roper) => [roper.roperId, roper]));
  const standings = season ? calculateSeasonStandings(source.contributions, source.moves, season).rows : [];
  const finals = season && isSupabaseConfigured() ? await loadFinalsQualifications(producerSlug, season.id) : null;
  const finalsProfiles = new Map(finals?.profiles.map((profile) => [profile.memberId, profile]) ?? []);
  const finalsPositions = new Map(finals?.totals.map((row) => [`${finalsProfiles.get(row.memberId)?.roperId}:${row.classId}`, row.positions]) ?? []);
  let requirement: { top_places: number | null; minimum_ropings: number; cutoff_on: string | null } | undefined;
  if (season && selectedClass && isSupabaseConfigured()) {
    const db = await createClient();
    const result = await db.rpc("public_standings_qualification_rules", {
      target_producer_slug: producerSlug, target_season_id: season.id,
    });
    if (result.error) throw new Error("Unable to load qualification requirements.");
    requirement = result.data?.find((item: { class_key: string }) => item.class_key === selectedClass.id);
  }
  const qualificationRows = season && requirement ? calculateSeasonStandings(source.contributions, source.moves, season,
    requirement.cutoff_on ?? season.endsOn).rows : [];
  const qualified = new Set(qualificationRows.filter((row) => row.classId === selectedClass?.id && qualifiesForStandings(row, {
    topPlaces: requirement!.top_places, minimumRopings: requirement!.minimum_ropings,
  })).map((row) => row.roperId));
  const rows = standings.filter((row) => row.classId === selectedClass?.id).map((row) => ({
    ...row, profile: profiles.get(`${row.roperId}:${row.classId}`) ?? names.get(row.roperId),
  })).filter((row) => row.profile?.name.toLowerCase().includes(search.toLowerCase()));
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return <main style={getBrandStyle(producer.brandPrimary, producer.brandAccent)} className="min-h-screen bg-[#f5f6f7]">
    <header className="brand-primary-fill text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <Link href={`/public/${producerSlug}`} className="text-lg font-bold">{producer.name}</Link>
        <nav aria-label="Producer public pages" className="flex flex-wrap gap-5 text-sm font-semibold">
          <Link href={`/public/${producerSlug}`}>Results</Link>
          <Link href={`/public/${producerSlug}/schedule`}>Schedule</Link>
          <Link href={`/public/${producerSlug}/standings`} aria-current="page" className="underline underline-offset-8">Standings</Link>
          <Link href="/roper">Roper portal</Link>
        </nav>
      </div>
    </header>
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Season standings</h1>
      {season ? <StandingsFilters key={`${season.id}:${selectedClass?.id}`} seasons={seasons} classes={source.classes}
        seasonId={season.id} classId={selectedClass?.id ?? ""} search={search} /> : null}
      <section className="mt-5">
        {requirement ? <div className="mb-4 flex flex-wrap gap-3 text-xs text-[#66716b]">
          {requirement.top_places ? <span>Top {requirement.top_places} · ties included</span> : null}
          <span>{requirement.minimum_ropings} ropings required</span>
          {requirement.cutoff_on ? <span>Cutoff: {requirement.cutoff_on}</span> : null}
        </div> : null}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{selectedClass ? `${selectedClass.name} ${selectedClass.divisionName}` : "Standings"}</h2>
          <span className="text-xs text-[#66716b]">Official results · {rows.length} ropers</span>
        </div>
        <div className="overflow-x-auto rounded-md border border-[#dfe4e1] bg-white">
          <table className="w-full text-sm">
            <thead className="bg-[#eef1ef] text-left text-xs uppercase text-[#66716b]">
              <tr><th className="px-2 py-3 sm:px-4">Rank</th><th className="px-2 py-3 sm:px-4">Contestant</th>
                <th className="px-2 py-3 text-right sm:px-4">Ropings</th><th className="px-2 py-3 text-right sm:px-4">Won</th><th className="px-2 py-3 text-right sm:px-4">Finals positions</th></tr>
            </thead>
            <tbody>{rows.map((row) => <tr key={row.roperId} className="border-t border-[#e7ebe8]">
              <td className="px-2 py-4 font-semibold tabular-nums sm:px-4">{row.rank}</td>
              <td className="min-w-24 px-2 py-4 sm:min-w-44 sm:px-4"><span className="font-semibold">{row.profile?.name ?? "Roper"}</span>
                <div className="mt-1 text-xs text-[#66716b]">{[row.profile?.city, row.profile?.state].filter(Boolean).join(", ")}</div>
                {requirement ? <div className={`mt-1 text-xs font-semibold ${qualified.has(row.roperId) ? "text-emerald-700" : "text-[#66716b]"}`}>
                  {qualified.has(row.roperId) ? "Meets requirements" : "Not qualified"}
                </div> : null}
                {selectedClass?.id.endsWith(":handicap") && row.profile?.handicap ?
                  <div className="mt-1 text-xs text-[#66716b]">{row.profile.handicap} · {Number(row.profile.handicapSeconds) > 0 ? "+" : ""}{Number(row.profile.handicapSeconds).toFixed(2)} sec</div> : null}
              </td>
              <td className="px-2 py-4 text-right tabular-nums sm:px-4">{row.ropingsEntered}</td>
              <td className="whitespace-nowrap px-2 py-4 text-right font-semibold tabular-nums sm:px-4">{money(row.winningsCents)}</td>
              <td className="px-2 py-4 text-right tabular-nums sm:px-4">{finalsPositions.get(`${row.roperId}:${row.classId}`) ?? 0}</td>
            </tr>)}</tbody>
          </table>
          {!rows.length ? <p className="p-8 text-center text-sm text-[#66716b]">
            {search ? "No contestants match your search." : "No official results for this class and season yet."}
          </p> : null}
        </div>
      </section>
    </div>
  </main>;
}
