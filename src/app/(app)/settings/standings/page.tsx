import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { StandingsFilters } from "@/components/events/standings-filters";
import { StandingsQualificationForm } from "@/components/settings/standings-qualification-form";
import Link from "next/link";

export default async function StandingsSettings({ searchParams }: PageProps<"/settings/standings">) {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer.</p>;
  const db = await createClient();
  const query = await searchParams;
  const seasons = await db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  const divisions = await db.from("divisions").select("id,name").eq("producer_id", producer.id);
  const classifications = await db.from("classifications").select("id,name,division_id").eq("producer_id", producer.id).eq("standalone_enabled", true).order("rank", { ascending: false });
  if (seasons.error || divisions.error || classifications.error) throw new Error("Unable to load standings settings.");
  const names = new Map(divisions.data.map((item) => [item.id, item.name]));
  const classes = classifications.data.map((item) => ({ id: item.id, name: item.name, divisionName: names.get(item.division_id) ?? "" }));
  for (const division of divisions.data) {
    for (const [format, name] of [["handicap", "Handicap"], ["four_d", "4-D"]]) {
      classes.push({ id: `${division.id}:${format}`, name, divisionName: division.name });
    }
  }
  const uniqueClasses = classes.filter((item) => !classes.some((other) => other.id.includes(":") && item.id !== other.id && item.name === other.name && item.divisionName === other.divisionName));
  const season = seasons.data.find((item) => item.id === query.season) ?? seasons.data[0];
  const selected = uniqueClasses.find((item) => item.id === query.class) ?? uniqueClasses[0];
  const rule = season && selected ? await db.from("standings_qualification_rules").select("top_places,minimum_ropings,cutoff_on")
    .eq("producer_id", producer.id).eq("season_id", season.id).eq("class_key", selected.id).maybeSingle() : null;
  if (rule?.error) throw new Error("Unable to load qualification requirements.");
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Standings qualification</h1><Link href="/settings/standings/carryovers" className="inline-flex h-10 items-center rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold">Carryover review</Link></div>
    <RopingSetupTabs active="standings" />
    {season && selected ? <>
      <StandingsFilters key={`${season.id}:${selected.id}`} seasons={seasons.data} classes={uniqueClasses} seasonId={season.id} classId={selected.id} search="" includeSearch={false} />
      <StandingsQualificationForm key={`${season.id}:${selected.id}`} season={{ id: season.id, startsOn: season.starts_on, endsOn: season.ends_on }}
        classId={selected.id} rule={rule?.data ?? undefined} canEdit={["owner", "admin"].includes(producer.role)} />
    </> : <p>Create a season and classifications first.</p>}
  </div>;
}
