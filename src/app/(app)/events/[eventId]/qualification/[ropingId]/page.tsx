import Link from "next/link";
import { notFound } from "next/navigation";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { loadSeasonStandings } from "@/lib/events/season-standings-data";
import { calculateSeasonStandings } from "@/lib/season-standings";
import { includeFinalsPositions, type EarnedPositionPolicy } from "@/lib/finals-entry-eligibility";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { loadAssignedFinalsTotals } from "@/lib/events/finals-assignment-data";
import { qualificationNoticeText } from "@/lib/events/qualification-notice";
import { formatCurrency } from "@/lib/utils";
import { reviewFinalsEntry, qualificationCheckIsCurrent } from "@/lib/finals-entry-review";
import { QualificationAssignmentDialog } from "@/components/events/qualification-assignment-dialog";
import { loadEffectiveRuleSet } from "@/lib/events/rule-set-qualification";
import { QualificationRefreshButton } from "@/components/events/qualification-refresh-button";

export default async function QualificationPage({ params, searchParams }: PageProps<"/events/[eventId]/qualification/[ropingId]">) {
  const { eventId, ropingId } = await params;
  const query = await searchParams;
  const producer = await getActiveProducer();
  if (!producer) notFound();
  const db = await createClient();
  const roping = await db.from("event_ropings").select("name,classification_id,division_id,competition_format,max_entries_per_roper,event_day_status,events!inner(status),divisions!roping_division_discipline_same_organization(name)")
    .eq("id", ropingId).eq("event_id", eventId).eq("producer_id", producer.id).maybeSingle();
  if (roping.error) throw new Error("Unable to load roping.");
  if (!roping.data) notFound();
  const scope = await db.rpc("can_manage_event_roping", { target_roping: ropingId });
  if (scope.error) throw new Error("Unable to check management access.");
  const canManage = !!scope.data;
  const eventStatus = (roping.data.events as unknown as { status: string }).status;
  const editable = canManage && !["in_progress", "completed"].includes(roping.data.event_day_status) && !["completed", "cancelled"].includes(eventStatus);
  const divisionName = (roping.data.divisions as unknown as { name: string } | null)?.name ?? "";
  const title = `${roping.data.name} ${divisionName}`.trim();
  const check = await db.from("roping_qualification_checks").select("season_id,class_key,bonus_entries_enabled,source_revision,rule_updated_at,checked_at,rule_set_id")
    .eq("event_roping_id", ropingId).eq("producer_id", producer.id).maybeSingle();
  if (check.error) throw new Error("Unable to load qualification setup.");
  const ruleSet = await loadEffectiveRuleSet(ropingId, producer.id);
  const back = `/events/${eventId}`;
  if (!check.data) return <section className="space-y-4"><Link href={back}>Back to event</Link>
    <h1 className="text-2xl font-bold">{title} · Entry review</h1><p>{ruleSet ? `Qualification required: ${ruleSet.name}. Refresh qualification information before accepting entries.` : "This roping has no qualification requirements."}</p>
    {ruleSet && canManage && <QualificationRefreshButton ropingId={ropingId} />}
    {editable && <QualificationAssignmentDialog eventId={eventId} ropingId={ropingId} name={title} editable />}
    <Link href="/settings/standings" className="inline-block text-sm font-semibold underline">Class qualification settings</Link></section>;
  const { season_id: seasonId, class_key: classKey } = check.data;
  const season = await db.from("producer_seasons").select("name,starts_on,ends_on").eq("id", seasonId).eq("producer_id", producer.id).single();
  const rule = ruleSet ? { data: ruleSet, error: null } : await db.from("standings_qualification_rules").select("top_places,minimum_ropings,cutoff_on,earned_position_policy,updated_at")
    .eq("season_id", seasonId).eq("class_key", classKey).eq("producer_id", producer.id).maybeSingle();
  if (season.error || rule.error) throw new Error("Unable to load qualification requirements.");
  const revision = await db.from("producers").select("standings_revision").eq("id", producer.id).single();
  if (revision.error) throw new Error("Unable to load qualification check status.");
  const entries = await readAllRows((first, last) => db.from("roping_entries")
    .select("id,roper_id,eligibility_overridden,eligibility_override_reason,eligibility_overridden_at,ropers(first_name,last_name)")
    .eq("event_roping_id", ropingId).eq("producer_id", producer.id).eq("competition_status", "active")
    .order("id").range(first, last), "Unable to load accepted entries");
  const source = await loadSeasonStandings(producer.slug, seasonId);
  const standings = calculateSeasonStandings(source.contributions, source.moves, {
    startsOn: season.data.starts_on, endsOn: season.data.ends_on,
  }, rule.data?.cutoff_on ?? season.data.ends_on).rows.filter((row) => row.classId === classKey);
  const finals = await loadFinalsQualifications(producer.slug, seasonId, rule.data?.cutoff_on ?? season.data.ends_on);
  const assigned = await loadAssignedFinalsTotals(producer.id, seasonId, ropingId, finals.awards);
  const rows = includeFinalsPositions(standings, assigned, finals.profiles, classKey);
  const currentKey = ["handicap", "four_d"].includes(roping.data.competition_format)
    ? `${roping.data.division_id}:${roping.data.competition_format}` : roping.data.classification_id;
  const available = Boolean(rule.data && currentKey === classKey);
  const current = available && (!ruleSet || check.data.rule_set_id === ruleSet.id) && qualificationCheckIsCurrent(check.data, revision.data.standings_revision, rule.data?.updated_at);
  const requirements = available ? { topPlaces: rule.data!.top_places, minimumRopings: rule.data!.minimum_ropings,
    earnedPositionPolicy: rule.data!.earned_position_policy as EarnedPositionPolicy, requirementMatch: ruleSet?.requirement_match } : null;
  const profiles = new Map(source.ropers.map((roper) => [`${roper.roperId}:${roper.classId}`, roper]));
  const names = new Map([...source.ropers.map((roper) => [roper.roperId, roper.name] as const), ...finals.profiles.map((profile) => [profile.roperId, profile.name] as const)]);
  const roperIds = new Set([...rows.map((row) => row.roperId), ...entries.map((entry) => entry.roper_id)]);
  const review = [...roperIds].map((id) => {
    const row = rows.find((item) => item.roperId === id);
    const accepted = entries.filter((entry) => entry.roper_id === id);
    const exceptions = accepted.filter((entry) => entry.eligibility_overridden);
    const person = accepted[0]?.ropers as unknown as { first_name: string; last_name: string } | null;
    const profile = profiles.get(`${id}:${classKey}`);
    return { id, row, accepted, exceptions, profile,
      ...reviewFinalsEntry(row, requirements, roping.data!.max_entries_per_roper, check.data!.bonus_entries_enabled, accepted.length),
      name: profile?.name ?? names.get(id) ?? (person ? `${person.first_name} ${person.last_name}` : "Roper"),
    };
  }).sort((a, b) => (a.row?.rank ?? Infinity) - (b.row?.rank ?? Infinity) || a.name.localeCompare(b.name));
  const search = typeof query.search === "string" ? query.search.slice(0, 100) : "";
  const status = typeof query.status === "string" ? query.status : "all";
  const visible = review.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()) &&
    (status === "qualified" ? item.qualified : status === "unqualified" ? !item.qualified : status === "exceptions" ? item.exceptions.length > 0 : status === "entered" ? item.accepted.length > 0 : status === "review" ? item.needsReview : status === "bonus" ? (item.row?.finalsPositions ?? 0) > 0 : true));
  const qualificationStatus = (item: typeof review[number]) => <>
    <span className={`text-xs font-semibold ${item.qualified ? "text-emerald-700" : "text-[#66716b]"}`}>{!available ? "Setup needs review" : item.qualified ? "Meets requirements" : "Not qualified"}</span>
    {!item.qualified ? <p className="mt-1 text-xs text-[#66716b]">{item.reasons.join(" · ")}</p> : null}
    {item.needsReview && <p className="mt-1 text-xs font-semibold text-amber-800">{item.overAllowance ? "Accepted entries exceed current allowance" : item.exceptions.length === item.accepted.length ? "Accepted by staff exception" : "Accepted entries need review"}</p>}
    {!!item.row?.finalsPositions && <p className="mt-1 text-xs font-semibold text-emerald-700">{item.row.finalsPositions} assigned bonus positions</p>}
  </>;
  return <section className="space-y-5">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-[#66716b]"><Link href="/events">Events</Link><span>/</span><Link href={back}>Manage event</Link><span>/</span><span>Entry review</span></nav>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-bold">{title} · Entry review</h1>
      <p className="mt-2 text-sm text-[#66716b]">{qualificationNoticeText({ event_roping_id: ropingId, season_name: season.data.name,
        top_places: rule.data?.top_places ?? null, minimum_ropings: rule.data?.minimum_ropings ?? null,
        cutoff_on: rule.data?.cutoff_on ?? null, requirements_available: available, requirement_match: ruleSet?.requirement_match })}</p></div>
      <div className="flex flex-wrap items-start gap-2">
        {editable && <QualificationAssignmentDialog eventId={eventId} ropingId={ropingId} name={title} editable />}
        {canManage && available && <QualificationRefreshButton ropingId={ropingId} />}
        <Link href={`/events/${eventId}/entries`} className="inline-flex h-9 items-center rounded-md border border-[#ccd4d0] bg-white px-3 text-sm font-semibold">Manage entries</Link>
      </div></div>
    {!available ? <p role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Qualification setup needs review. Entries without an approved exception are blocked.</p> : null}
    {available && !current ? <p role="alert" className="border-l-4 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">Standings or requirements changed since the last saved check. This review shows current eligibility. {canManage ? "Refresh the check before processing entries." : "Ask an event manager to refresh the check before processing entries."}</p> : null}
    <dl className="flex flex-wrap gap-x-8 gap-y-4 border-y border-[#dfe4e1] py-4 text-sm">
      <div><dt className="text-xs text-[#66716b]">Regular allowance</dt><dd className="mt-1 font-semibold">{roping.data.max_entries_per_roper ?? "Unlimited"}{roping.data.max_entries_per_roper !== null ? roping.data.max_entries_per_roper === 1 ? " entry" : " entries" : ""}</dd></div>
      <div><dt className="text-xs text-[#66716b]">Earned bonus entries</dt><dd className="mt-1 font-semibold">{check.data.bonus_entries_enabled ? "Added to regular allowance" : "Not enabled for this roping"}</dd></div>
      <div><dt className="text-xs text-[#66716b]">Bonus requirements</dt><dd className="mt-1 font-semibold">{rule.data?.earned_position_policy === "rank_and_attendance" ? "No rank or attendance requirement" : rule.data?.earned_position_policy === "rank" ? "Attendance required; rank waived" : "Rank and attendance required"}</dd></div>
      <div><dt className="text-xs text-[#66716b]">Saved check</dt><dd className="mt-1 font-semibold">{current ? "Current" : "Needs refresh"}</dd><dd className="mt-1 text-xs text-[#66716b]">{new Date(check.data.checked_at).toLocaleString("en-US", { timeZone: producer.timezone, dateStyle: "medium", timeStyle: "short" })}</dd></div>
    </dl>
    <div className="flex flex-wrap gap-5 text-sm"><span><strong>{review.filter((item) => item.qualified).length}</strong> meet requirements</span>
      <span><strong>{review.filter((item) => item.exceptions.length).length}</strong> with approved eligibility exceptions</span>
      <span><strong>{entries.length}</strong> accepted entries</span><span><strong>{review.filter((item) => item.needsReview).length}</strong> accepted ropers need review</span>
      <Link className="font-semibold underline" href={`/public/${producer.slug}/standings?season=${seasonId}&class=${encodeURIComponent(classKey)}`}>View standings</Link></div>
    <div className="flex flex-wrap gap-4 text-sm font-semibold"><Link className="underline" href={`/settings/standings?season=${seasonId}&class=${encodeURIComponent(classKey)}`}>Class requirements</Link><Link className="underline" href={`/settings/finals?season=${seasonId}`}>Earned positions</Link></div>
    <form className="flex flex-wrap items-center gap-3">
      <input name="search" defaultValue={search} placeholder="Find a roper" aria-label="Find a roper" className="h-10 w-56 max-w-full rounded-md border border-[#ccd4d0] bg-white px-3" />
      <select name="status" defaultValue={status} aria-label="Qualification status" className="h-10 rounded-md border border-[#ccd4d0] bg-white px-3"><option value="all">All ropers</option><option value="qualified">Meets requirements</option><option value="unqualified">Not qualified</option><option value="entered">Accepted entries</option><option value="review">Accepted entries needing review</option><option value="bonus">Earned positions</option><option value="exceptions">Approved exceptions</option></select>
      <button className="h-10 rounded-md border border-[#ccd4d0] bg-white px-4 text-sm font-semibold">Filter</button>
    </form>
    <div className="overflow-x-auto rounded-md border border-[#dfe4e1] bg-white"><table className="w-full text-sm">
      <thead className="bg-[#eef1ef] text-left text-xs uppercase text-[#66716b]"><tr><th className="p-2 sm:p-3">Rank</th><th className="p-2 sm:p-3">Roper</th><th className="p-2 text-right sm:p-3">Ropings</th><th className="hidden p-3 text-right sm:table-cell">Won</th><th className="p-2 text-right sm:p-3">Entries</th><th className="hidden p-3 lg:table-cell">Status</th></tr></thead>
      <tbody>{visible.map((item) => <tr key={item.id} className="border-t border-[#e7ebe8] align-top">
        <td className="p-2 tabular-nums sm:p-3">{item.row?.rank === Number.MAX_SAFE_INTEGER ? "-" : item.row?.rank ?? "-"}</td>
        <td className="min-w-0 p-2 sm:p-3"><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-[#66716b]">{[item.profile?.city, item.profile?.state].filter(Boolean).join(", ")}</p>
          <div className="mt-2 lg:hidden">{qualificationStatus(item)}</div>
          {item.profile?.handicap ? <p className="mt-1 text-xs">{item.profile.handicap} · {Number(item.profile.handicapSeconds).toFixed(2)} sec</p> : null}
          {item.exceptions.map((entry) => <details key={entry.id} className="mt-2 text-xs"><summary className="cursor-pointer font-semibold text-amber-800">Approved eligibility exception</summary><p className="mt-1 max-w-sm leading-5">{entry.eligibility_override_reason}</p><p className="text-[#66716b]">{entry.eligibility_overridden_at ? new Date(entry.eligibility_overridden_at).toLocaleDateString("en-US") : ""}</p></details>)}</td>
        <td className="p-2 text-right tabular-nums sm:p-3">{item.row?.ropingsEntered ?? 0}</td><td className="hidden whitespace-nowrap p-3 text-right tabular-nums sm:table-cell">{formatCurrency(item.row?.winningsCents ?? 0)}</td>
        <td className="p-2 text-right tabular-nums sm:p-3"><p className="font-semibold">{item.accepted.length} / {item.allowance ?? "Unlimited"}</p><p className="mt-1 text-xs text-[#66716b]">{item.qualified ? item.remaining === null ? "No limit" : `${item.remaining} available` : "Not eligible"}</p>{item.bonus > 0 && <p className="mt-1 text-xs text-emerald-700">{item.bonus} bonus</p>}</td>
        <td className="hidden min-w-40 p-3 lg:table-cell">{qualificationStatus(item)}</td>
      </tr>)}</tbody></table>{!visible.length ? <p className="p-8 text-center text-sm text-[#66716b]">No ropers match this view.</p> : null}</div>
  </section>;
}
