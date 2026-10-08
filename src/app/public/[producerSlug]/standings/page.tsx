import { PublicProducerHeader } from "@/components/events/public-producer-header";
import { notFound } from "next/navigation";
import { getPublicData } from "@/lib/events/public-event-data";
import { getBrandStyle } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { calculateSeasonStandings, calculateQualificationStandings } from "@/lib/season-standings";
import { includeFinalsPositions, meetsFinalsEntryRequirements, type EarnedPositionPolicy } from "@/lib/finals-entry-eligibility";
import { loadSeasonStandings, type SeasonStandingsSource } from "@/lib/events/season-standings-data";
import { StandingsFilters } from "@/components/events/standings-filters";
import { seasonCalendarDate } from "@/lib/seasons";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { publicEventDate } from "@/lib/events/public-event-navigation";

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
    source = await loadSeasonStandings(producerSlug, season.id, true);
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
  let requirement: { top_places: number | null; minimum_ropings: number; cutoff_on: string | null; attendance_cutoff_on: string | null; earned_position_policy: EarnedPositionPolicy } | undefined;
  if (season && selectedClass && isSupabaseConfigured()) {
    const db = await createClient();
    const result = await db.rpc("public_standings_qualification_rules", {
      target_producer_slug: producerSlug, target_season_id: season.id,
    });
    if (result.error) throw new Error("Unable to load qualification requirements.");
    requirement = result.data?.find((item: { class_key: string }) => item.class_key === selectedClass.id);
  }
  const qualificationStandings = season && requirement ? calculateQualificationStandings(source.contributions, source.moves, season,
    requirement.cutoff_on ?? season.endsOn, requirement.attendance_cutoff_on ?? season.endsOn).rows : [];
  const qualificationRows = qualificationStandings.filter((row) => row.classId === selectedClass?.id);
  const qualified = new Set((requirement ? qualificationRows : []).filter((row) => meetsFinalsEntryRequirements(row, {
    topPlaces: requirement!.top_places, minimumRopings: requirement!.minimum_ropings,
    earnedPositionPolicy: "none",
  })).map((row) => row.roperId));
  const displayRows = includeFinalsPositions(standings.filter((row) => row.classId === selectedClass?.id), finals?.totals ?? [], finals?.profiles ?? [], selectedClass?.id ?? "");
  const rows = displayRows.map((row) => ({
    ...row, profile: profiles.get(`${row.roperId}:${row.classId}`) ?? names.get(row.roperId),
    finalsName: finals?.profiles.find((profile) => profile.roperId === row.roperId)?.name,
  })).filter((row) => (row.profile?.name ?? row.finalsName ?? "").toLowerCase().includes(search.toLowerCase()));
  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
  return <main style={getBrandStyle(producer.brandPrimary, producer.brandAccent)} className="min-h-screen bg-[#f5f6f7]">
    <PublicProducerHeader slug={producerSlug} name={producer.name} logoUrl={producer.logoUrl} active="standings" membershipPublished={data.membershipFormPublished} />
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <h1 className="text-2xl font-bold">Season standings</h1>
      {season ? <StandingsFilters key={`${season.id}:${selectedClass?.id}:${search}`} seasons={seasons} classes={source.classes}
        seasonId={season.id} classId={selectedClass?.id ?? ""} search={search} /> : null}
      <section className="mt-5">
        {requirement ? <div className="mb-4 flex flex-wrap gap-3 text-xs text-[#66716b]">
          {requirement.top_places ? <span>Top {requirement.top_places} · ties included</span> : null}
          <span>{requirement.minimum_ropings} ropings required</span>
          <span>Standings through {publicEventDate(requirement.cutoff_on ?? season!.endsOn)}</span>
          <span>Attendance through {publicEventDate(requirement.attendance_cutoff_on ?? season!.endsOn)}</span>
          {requirement.earned_position_policy !== "none" && <span>{requirement.earned_position_policy === "rank" ? "Assigned bonus positions bypass rank; attendance required" : "Assigned bonus positions bypass rank and attendance"}</span>}
        </div> : null}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{selectedClass ? `${selectedClass.name} ${selectedClass.divisionName}` : "Standings"}</h2>
          <span className="text-xs text-[#66716b]">Official results · {rows.length} ropers</span>
        </div>
        <div className="overflow-x-auto rounded-md border border-[#dfe4e1] bg-white">
          <table className="w-full table-fixed text-sm sm:table-auto">
            <thead className="bg-[#eef1ef] text-left text-xs uppercase text-[#66716b]">
              <tr><th scope="col" className="w-12 px-2 py-3 sm:w-auto sm:px-4">Rank</th><th scope="col" className="px-2 py-3 sm:px-4">Contestant</th>
                <th scope="col" className="hidden px-2 py-3 text-right sm:table-cell sm:px-4">Ropings</th><th scope="col" className="w-28 px-2 py-3 text-right sm:w-auto sm:px-4">Won</th><th scope="col" className="hidden px-2 py-3 text-right sm:table-cell sm:px-4">Earned positions</th></tr>
            </thead>
            <tbody>{rows.map((row) => <tr key={row.roperId} className="border-t border-[#e7ebe8]">
              <td className="px-2 py-4 font-semibold tabular-nums sm:px-4">{row.rank === Number.MAX_SAFE_INTEGER ? "-" : row.rank}</td>
              <td className="break-words px-2 py-4 sm:min-w-44 sm:px-4"><span className="font-semibold">{row.profile?.name ?? row.finalsName ?? "Roper"}</span>
                <div className="mt-1 text-xs text-[#66716b]">{[row.profile?.city, row.profile?.state].filter(Boolean).join(", ")}</div>
                <div className="mt-1 text-xs text-[#66716b] sm:hidden">{row.ropingsEntered} {row.ropingsEntered === 1 ? "roping" : "ropings"} · {finalsPositions.get(`${row.roperId}:${row.classId}`) ?? 0} earned positions</div>
                {requirement ? <div className={`mt-1 text-xs font-semibold ${qualified.has(row.roperId) ? "text-emerald-700" : "text-[#66716b]"}`}>
                  {qualified.has(row.roperId) ? "Meets standings requirements" : "Below standings requirements"}
                </div> : null}
                {selectedClass?.id.endsWith(":handicap") && row.profile?.handicap ?
                  <div className="mt-1 text-xs text-[#66716b]">{row.profile.handicap} · {Number(row.profile.handicapSeconds) > 0 ? "+" : ""}{Number(row.profile.handicapSeconds).toFixed(2)} sec</div> : null}
              </td>
              <td className="hidden px-2 py-4 text-right tabular-nums sm:table-cell sm:px-4">{row.ropingsEntered}</td>
              <td className="whitespace-nowrap px-2 py-4 text-right font-semibold tabular-nums sm:px-4">{money(row.winningsCents)}</td>
              <td className="hidden px-2 py-4 text-right tabular-nums sm:table-cell sm:px-4">{finalsPositions.get(`${row.roperId}:${row.classId}`) ?? 0}</td>
            </tr>)}</tbody>
          </table>
          {!rows.length ? <p className="p-8 text-center text-sm text-[#66716b]">
            {!season ? "No seasons have been published yet." : search ? "No contestants match your search." : "No official results for this class and season yet."}
          </p> : null}
        </div>
      </section>
    </div>
  </main>;
}
