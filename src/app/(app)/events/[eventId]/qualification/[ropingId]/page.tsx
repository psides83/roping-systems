import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { loadSeasonStandings } from "@/lib/events/season-standings-data";
import { calculateSeasonStandings, qualifiesForStandings } from "@/lib/season-standings";
import { qualificationNoticeText } from "@/lib/events/qualification-notice";
import { formatCurrency } from "@/lib/utils";

export default async function QualificationPage({ params, searchParams }: PageProps<"/events/[eventId]/qualification/[ropingId]">) {
  const { eventId, ropingId } = await params;
  const query = await searchParams;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const db = await createClient();
  const roping = await db.from("event_ropings").select("name,classification_id,division_id,competition_format")
    .eq("id", ropingId).eq("event_id", eventId).eq("producer_id", producer.id).maybeSingle();
  if (roping.error) throw new Error("Unable to load roping.");
  if (!roping.data) notFound();
  const check = await db.from("roping_qualification_checks").select("season_id,class_key")
    .eq("event_roping_id", ropingId).eq("producer_id", producer.id).maybeSingle();
  if (check.error) throw new Error("Unable to load qualification setup.");
  const back = `/events/${eventId}`;
  if (!check.data) return <section className="space-y-4"><Link href={back}>Back to event</Link>
    <h1 className="text-2xl font-bold">Qualification</h1><p>This roping has no standings requirement.</p></section>;
  const { season_id: seasonId, class_key: classKey } = check.data;
  const season = await db.from("producer_seasons").select("name,starts_on,ends_on").eq("id", seasonId).eq("producer_id", producer.id).single();
  const rule = await db.from("standings_qualification_rules").select("top_places,minimum_ropings,cutoff_on")
    .eq("season_id", seasonId).eq("class_key", classKey).eq("producer_id", producer.id).maybeSingle();
  if (season.error || rule.error) throw new Error("Unable to load qualification requirements.");
  const entries = await readAllRows((first, last) => db.from("roping_entries")
    .select("id,roper_id,eligibility_overridden,eligibility_override_reason,eligibility_overridden_at,ropers(first_name,last_name)")
    .eq("event_roping_id", ropingId).eq("producer_id", producer.id).eq("competition_status", "active")
    .order("id").range(first, last), "Unable to load accepted entries");
  const source = await loadSeasonStandings(producer.slug, seasonId);
  const rows = calculateSeasonStandings(source.contributions, source.moves, {
    startsOn: season.data.starts_on, endsOn: season.data.ends_on,
  }, rule.data?.cutoff_on ?? season.data.ends_on).rows.filter((row) => row.classId === classKey);
  const currentKey = ["handicap", "four_d"].includes(roping.data.competition_format)
    ? `${roping.data.division_id}:${roping.data.competition_format}` : roping.data.classification_id;
  const available = Boolean(rule.data && currentKey === classKey);
  const profiles = new Map(source.ropers.map((roper) => [`${roper.roperId}:${roper.classId}`, roper]));
  const names = new Map(source.ropers.map((roper) => [roper.roperId, roper.name]));
  const roperIds = new Set([...rows.map((row) => row.roperId), ...entries.map((entry) => entry.roper_id)]);
  const review = [...roperIds].map((id) => {
    const row = rows.find((item) => item.roperId === id);
    const accepted = entries.filter((entry) => entry.roper_id === id);
    const exceptions = accepted.filter((entry) => entry.eligibility_overridden);
    const person = accepted[0]?.ropers as unknown as { first_name: string; last_name: string } | null;
    const profile = profiles.get(`${id}:${classKey}`);
    return { id, row, accepted, exceptions, profile,
      name: profile?.name ?? names.get(id) ?? (person ? `${person.first_name} ${person.last_name}` : "Roper"),
      qualified: available && Boolean(row && qualifiesForStandings(row, {
        topPlaces: rule.data!.top_places, minimumRopings: rule.data!.minimum_ropings,
      })),
    };
  }).sort((a, b) => (a.row?.rank ?? Infinity) - (b.row?.rank ?? Infinity) || a.name.localeCompare(b.name));
  const search = typeof query.search === "string" ? query.search.slice(0, 100) : "";
  const status = typeof query.status === "string" ? query.status : "all";
  const visible = review.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) &&
    (status === "qualified" ? item.qualified : status === "unqualified" ? !item.qualified : status === "exceptions" ? item.exceptions.length > 0 : true));
  const qualificationStatus = (item: typeof review[number]) => <>
    <span className={`text-xs font-semibold ${item.qualified ? "text-emerald-700" : "text-[#66716b]"}`}>{!available ? "Setup needs review" : item.qualified ? "Meets requirements" : "Not qualified"}</span>
    {available && !item.qualified ? <p className="mt-1 text-xs text-[#66716b]">{!item.row ? "No qualifying standings" : [
      rule.data!.top_places && item.row.rank > rule.data!.top_places ? `Outside top ${rule.data!.top_places}` : null,
      item.row.ropingsEntered < rule.data!.minimum_ropings ? `${rule.data!.minimum_ropings - item.row.ropingsEntered} more ropings needed` : null,
    ].filter(Boolean).join(" · ")}</p> : null}
    <p className="mt-1 text-xs text-[#66716b]">{item.accepted.length} accepted entries</p>
  </>;
  return <section className="space-y-5">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-[#66716b]"><Link href="/events">Events</Link><span>/</span><Link href={back}>Manage event</Link><span>/</span><span>Qualifiers</span></nav>
    <div><h1 className="text-2xl font-bold">{roping.data.name} · Qualifiers</h1>
      <p className="mt-2 text-sm text-[#66716b]">{qualificationNoticeText({ event_roping_id: ropingId, season_name: season.data.name,
        top_places: rule.data?.top_places ?? null, minimum_ropings: rule.data?.minimum_ropings ?? null,
        cutoff_on: rule.data?.cutoff_on ?? null, requirements_available: available })}</p></div>
    {!available ? <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Qualification setup needs review. Entries without an approved exception are blocked.</p> : null}
    <div className="flex flex-wrap gap-5 text-sm"><span><strong>{review.filter((item) => item.qualified).length}</strong> meet requirements</span>
      <span><strong>{review.filter((item) => item.exceptions.length).length}</strong> with approved eligibility exceptions</span>
      <Link className="font-semibold underline" href={`/public/${producer.slug}/standings?season=${seasonId}&class=${encodeURIComponent(classKey)}`}>View standings</Link></div>
    <form className="flex flex-wrap items-center gap-3">
      <input name="search" defaultValue={search} placeholder="Find a roper" aria-label="Find a roper" className="h-10 w-56 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3" />
      <select name="status" defaultValue={status} aria-label="Qualification status" className="h-10 rounded-md border border-[#ccd4d0] bg-white px-3"><option value="all">All ropers</option><option value="qualified">Meets requirements</option><option value="unqualified">Not qualified</option><option value="exceptions">Approved exceptions</option></select>
      <button className="h-10 rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold">Filter</button>
    </form>
    <div className="overflow-x-auto rounded-md border border-[#dfe4e1] bg-white"><table className="w-full text-sm">
      <thead className="bg-[#eef1ef] text-left text-xs uppercase text-[#66716b]"><tr><th className="p-2 sm:p-3">Rank</th><th className="p-2 sm:p-3">Roper</th><th className="p-2 text-right sm:p-3">Ropings</th><th className="p-2 text-right sm:p-3">Won</th><th className="hidden p-3 lg:table-cell">Status</th></tr></thead>
      <tbody>{visible.map((item) => <tr key={item.id} className="border-t border-[#e7ebe8] align-top">
        <td className="p-2 tabular-nums sm:p-3">{item.row?.rank ?? "-"}</td>
        <td className="min-w-0 p-2 sm:p-3"><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-[#66716b]">{[item.profile?.city, item.profile?.state].filter(Boolean).join(", ")}</p>
          <div className="mt-2 lg:hidden">{qualificationStatus(item)}</div>
          {item.profile?.handicap ? <p className="mt-1 text-xs">{item.profile.handicap} · {Number(item.profile.handicapSeconds).toFixed(2)} sec</p> : null}
          {item.exceptions.map((entry) => <details key={entry.id} className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-amber-800">Approved eligibility exception</summary><p className="mt-1 max-w-sm leading-5">{entry.eligibility_override_reason}</p><p className="text-[#66716b]">{entry.eligibility_overridden_at ? new Date(entry.eligibility_overridden_at).toLocaleDateString("en-US") : ""}</p></details>)}</td>
        <td className="p-2 text-right tabular-nums sm:p-3">{item.row?.ropingsEntered ?? 0}</td><td className="whitespace-nowrap p-2 text-right tabular-nums sm:p-3">{formatCurrency(item.row?.winningsCents ?? 0)}</td>
        <td className="hidden min-w-40 p-3 lg:table-cell">{qualificationStatus(item)}</td>
      </tr>)}</tbody></table>{!visible.length ? <p className="p-8 text-center text-sm text-[#66716b]">No ropers match this view.</p> : null}</div>
  </section>;
}
