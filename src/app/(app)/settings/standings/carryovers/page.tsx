import Link from "next/link";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { loadSeasonStandings } from "@/lib/events/season-standings-data";
import { calculateSeasonStandings } from "@/lib/season-standings";
import { formatCurrency } from "@/lib/utils";
import { readAllRows } from "@/lib/supabase/read-all-rows";

export default async function CarryoversPage({ searchParams }: PageProps<"/settings/standings/carryovers">) {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer.</p>;
  const query = await searchParams;
  const db = await createClient();
  const seasons = await db.from("producer_seasons").select("id,name,starts_on,ends_on")
    .eq("producer_id", producer.id).order("starts_on", { ascending: false });
  if (seasons.error) throw new Error("Unable to load seasons.");
  const season = seasons.data.find((item) => item.id === query.season) ?? seasons.data[0];
  const source = season ? await loadSeasonStandings(producer.slug, season.id) : null;
  const calculation = source && season ? calculateSeasonStandings(source.contributions, source.moves, {
    startsOn: season.starts_on, endsOn: season.ends_on,
  }) : { rows: [], carryovers: [] };
  const profiles = new Map(source?.ropers.map((item) => [item.roperId, item]) ?? []);
  const classes = new Map(source?.classes.map((item) => [item.id, `${item.name} ${item.divisionName}`]) ?? []);
  const moves = new Map(source?.moves.map((item) => [item.id, item]) ?? []);
  const history = source?.moves.length ? await readAllRows((first, last) => db
    .from("membership_classification_history").select("id,membership_id")
    .eq("producer_id", producer.id).order("id").range(first, last), "Unable to load carryover history links") : [];
  const memberships = new Map(history.map((item) => [item.id, item.membership_id]));
  const search = typeof query.search === "string" ? query.search.slice(0, 100) : "";
  const status = typeof query.status === "string" ? query.status : "all";
  const records = calculation.carryovers.map((record) => {
    const move = moves.get(record.moveId)!;
    return { ...record, move, profile: profiles.get(move.roperId),
      cappedCents: record.earnedCents - record.carriedCents };
  });
  const visible = records.filter((record) => (record.profile?.name ?? "Roper").toLowerCase().includes(search.toLowerCase()) &&
    (status === "capped" ? record.cappedCents > 0 : status === "review" ? record.status === "retained_at_end" : true))
    .sort((a, b) => b.move.date.localeCompare(a.move.date) || a.move.id.localeCompare(b.move.id) || a.fromClassId.localeCompare(b.fromClassId));
  return <section className="space-y-5">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-[#66716b]"><Link href="/settings/standings">Standings qualification</Link><span>/</span><span>Carryover review</span></nav>
    <div><h1 className="text-2xl font-bold">Carryover review</h1><p className="mt-2 text-sm text-[#66716b]">Official winnings · Classification moves · Attendance stays with the class entered</p></div>
    <form className="flex flex-wrap items-center gap-3">
      <select name="season" defaultValue={season?.id ?? ""} aria-label="Season" className="h-10 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3">{seasons.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <input name="search" defaultValue={search} placeholder="Find a roper" aria-label="Find a roper" className="h-10 w-52 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3" />
      <select name="status" defaultValue={status} aria-label="Carryover status" className="h-10 rounded-md border border-[#ccd4d0] bg-white px-3"><option value="all">All carryovers</option><option value="capped">Capped amounts</option><option value="review">Needs review</option></select>
      <button className="h-10 rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold">Filter</button>
    </form>
    <div className="flex flex-wrap gap-5 text-sm"><span><strong>{formatCurrency(records.filter((item) => item.status !== "retained_at_end").reduce((sum, item) => sum + item.carriedCents, 0))}</strong> transferred across moves</span>
      <span><strong>{formatCurrency(records.reduce((sum, item) => sum + item.cappedCents, 0))}</strong> excluded by caps</span>
      <span><strong>{records.filter((item) => item.status === "retained_at_end").length}</strong> end-of-ladder reviews</span></div>
    <div className="overflow-x-auto rounded-md border border-[#dfe4e1] bg-white"><table className="w-full text-sm">
      <thead className="bg-[#eef1ef] text-left text-xs uppercase text-[#66716b]"><tr><th className="hidden p-3 lg:table-cell">Effective date</th><th className="p-2 sm:p-3">Roper / Move</th><th className="hidden p-3 lg:table-cell">From / To</th><th className="hidden p-3 text-right sm:table-cell">Before move</th><th className="p-2 text-right sm:p-3">Carried</th><th className="p-2 text-right sm:p-3">Capped</th></tr></thead>
      <tbody>{visible.map((record) => <tr key={`${record.moveId}:${record.fromClassId}:${record.toClassId}`} className="border-t border-[#e7ebe8] align-top">
        <td className="hidden whitespace-nowrap p-3 lg:table-cell">{record.move.date}</td><td className="min-w-0 p-2 sm:p-3"><p className="font-semibold">{record.profile?.name ?? "Roper"}</p><p className="mt-1 text-xs text-[#66716b]">{[record.profile?.city, record.profile?.state].filter(Boolean).join(", ")}</p>
          <div className="mt-1 space-y-1 text-xs text-[#66716b] lg:hidden"><p>{record.move.date}</p><p>{classes.get(record.fromClassId) ?? "Previous class"} → {classes.get(record.toClassId) ?? "New class"}</p>
            {record.status === "retained_at_end" ? <p className="font-semibold text-amber-800">No next class · Earnings retained</p> : null}</div>
          {memberships.has(record.moveId) ? <Link href={`/members/${memberships.get(record.moveId)}#classification-history-${record.moveId}`} className="mt-2 inline-block text-xs font-semibold text-[var(--brand-accent-strong)] underline underline-offset-2">View classification move</Link> : null}
          <p className="mt-1 text-xs text-[#66716b] sm:hidden">Before: {formatCurrency(record.earnedCents)}</p></td>
        <td className="hidden min-w-48 p-3 lg:table-cell"><p>{classes.get(record.fromClassId) ?? "Previous class"}</p><p className="mt-1 text-xs text-[#66716b]">To {classes.get(record.toClassId) ?? "New class"}</p>
          {record.status === "retained_at_end" ? <p className="mt-2 max-w-xs text-xs font-semibold leading-5 text-amber-800">Needs review: no next numbered class. Earnings retained in this class.</p> : null}</td>
        <td className="hidden whitespace-nowrap p-3 text-right tabular-nums sm:table-cell">{formatCurrency(record.earnedCents)}</td><td className="whitespace-nowrap p-2 text-right font-semibold tabular-nums sm:p-3">{formatCurrency(record.carriedCents)}</td><td className="whitespace-nowrap p-2 text-right tabular-nums sm:p-3">{formatCurrency(record.cappedCents)}</td>
      </tr>)}</tbody></table>{!visible.length ? <p className="p-8 text-center text-sm text-[#66716b]">{records.length ? "No carryovers match this view." : "No winnings carried over in this season."}</p> : null}</div>
  </section>;
}
