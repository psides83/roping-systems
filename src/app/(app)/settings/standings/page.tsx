import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { StandingsFilters } from "@/components/events/standings-filters";
import { StandingsQualificationForm } from "@/components/settings/standings-qualification-form";
import Link from "next/link";
import { ContextHelp } from "@/components/help/context-help";

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
  const rule = season && selected ? await db.from("standings_qualification_rules").select("top_places,minimum_ropings,cutoff_on,attendance_cutoff_on,earned_position_policy")
    .eq("producer_id", producer.id).eq("season_id", season.id).eq("class_key", selected.id).maybeSingle() : null;
  if (rule?.error) throw new Error("Unable to load qualification requirements.");
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Finals Qualifications</h1><Link href="/settings/standings/carryovers" className="inline-flex h-10 items-center rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold">Carryover review</Link></div>
    <p className="text-sm leading-6 text-[#526059]">Set finals entry requirements for each season and classification. These also determine finals qualification labels on public standings; they do not change winnings or rank calculations.</p>
    <RopingSetupTabs active="standings" />
    <ContextHelp title="What do Finals Qualifications control?" guide="qualification-rules"><p>Set the rank, attendance, cutoff dates, and earned-position policy for your season finals. On the event schedule, use each finals roping’s Finals qualification control to choose its season and enable earned bonus entries.</p><p>Non-finals qualification rules are separate named rule sets for other ropings with entry requirements. A finals roping uses its selected finals requirements independently of those event rules.</p></ContextHelp>
    <Link href="/settings/qualifications" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Set up non-finals qualification rules</Link>
    {season && selected ? <>
      <StandingsFilters key={`${season.id}:${selected.id}`} seasons={seasons.data} classes={uniqueClasses} seasonId={season.id} classId={selected.id} search="" includeSearch={false} />
      <StandingsQualificationForm key={`${season.id}:${selected.id}`} season={{ id: season.id, startsOn: season.starts_on, endsOn: season.ends_on }}
        classId={selected.id} rule={rule?.data ?? undefined} canEdit={["owner", "admin"].includes(producer.role)} />
    </> : <section className="space-y-3 rounded-md border border-[#dfe4e1] bg-white p-5"><h2 className="font-bold">Set up a season and classifications first</h2><p className="text-sm leading-6 text-[#526059]">Requirements are saved for a season and class. Add the missing setup, then return here to choose both.</p><div className="flex flex-wrap gap-3"><Link href="/settings?tab=seasons" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold">Manage seasons</Link><Link href="/settings/classifications" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold">Manage divisions & classifications</Link></div></section>}
  </div>;
}
