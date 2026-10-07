import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";

export async function MemberFinalsPositions({ producerId, producerSlug, memberId }: { producerId: string; producerSlug: string; memberId: string }) {
  const db = await createClient();
  const seasons = await db.from("producer_seasons").select("id,name").eq("producer_id", producerId).order("starts_on", { ascending: false }).limit(5);
  const classifications = await db.from("classifications").select("id,name,division_id").eq("producer_id", producerId);
  const divisions = await db.from("divisions").select("id,name").eq("producer_id", producerId);
  if (seasons.error || classifications.error || divisions.error) throw new Error("Unable to load member finals positions.");
  const divisionNames = new Map(divisions.data.map((division) => [division.id, division.name]));
  const names = new Map(classifications.data.map((item) => [item.id, `${item.name} ${divisionNames.get(item.division_id) ?? ""}`]));
  for (const division of divisions.data) { names.set(`${division.id}:handicap`, `Handicap ${division.name}`); names.set(`${division.id}:four_d`, `4-D ${division.name}`); }
  const rows: { seasonId: string; seasonName: string; classId: string; positions: number }[] = [];
  for (const season of seasons.data) {
    const result = await loadFinalsQualifications(producerSlug, season.id);
    rows.push(...result.totals.filter((row) => row.memberId === memberId).map((row) => ({ seasonId: season.id, seasonName: season.name, classId: row.classId, positions: row.positions })));
  }
  return <section className="space-y-3 border-t pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Earned finals positions</h2><Link href="/settings/finals" className="text-sm font-semibold underline">Finals positions</Link></div>{rows.length ? <ul className="space-y-2 text-sm">{rows.map((row) => <li key={`${row.seasonId}:${row.classId}`} className="flex flex-wrap justify-between gap-3"><span>{row.seasonName} · {names.get(row.classId) ?? "Class"}</span><strong>{row.positions} positions · Eligible</strong></li>)}</ul> : <p className="text-sm text-[#66716b]">No earned finals positions in the five most recent seasons.</p>}</section>;
}
