import Link from "next/link";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { ManualFinalsAward, RevokeFinalsAward } from "@/components/settings/manual-finals-award";
import { FinalsDecisionForm } from "@/components/settings/finals-decision-form";
import { FinalsPositionAssignments, type FinalsTarget } from "@/components/settings/finals-position-assignments";
import { loadFinalsAssignments } from "@/lib/events/finals-assignment-data";
import { finalsPositionSlots } from "@/lib/finals-position-assignments";
import { readAllRows } from "@/lib/supabase/read-all-rows";

export default async function FinalsPositionsPage({ searchParams }: PageProps<"/settings/finals">) {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer.</p>;
  const query = await searchParams; const db = await createClient();
  const seasons = await db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  if (seasons.error) throw new Error("Unable to load seasons.");
  const season = seasons.data.find((season) => season.id === query.season) ?? seasons.data[0];
  if (!season) return <p>Create a producer season before configuring finals qualifiers.</p>;
  const results = await loadFinalsQualifications(producer.slug, season.id);
  const ropingIds = [...new Set(results.rules.map((rule) => rule.ropingId))];
  const ropings = ropingIds.length ? await db.from("event_ropings").select("id,event_id,name,scheduled_date").eq("producer_id", producer.id).in("id", ropingIds) : { data: [], error: null };
  if (ropings.error) throw new Error("Unable to load qualifier ropings.");
  const ropingNames = new Map(ropings.data.map((roping) => [roping.id, roping]));
  const classifications = await db.from("classifications").select("id,name,division_id").eq("producer_id", producer.id).eq("standalone_enabled", true);
  const divisions = await db.from("divisions").select("id,name").eq("producer_id", producer.id);
  const members = await db.from("memberships").select("id,member_number,ropers(first_name,last_name)").eq("producer_id", producer.id).order("member_number").limit(1000);
  const manual = await db.from("manual_finals_positions").select("id,membership_id,class_key,positions,reason,revoked,revoke_reason,awarded_on").eq("producer_id", producer.id).eq("season_id", season.id).order("awarded_on", { ascending: false });
  const decisions = await db.from("finals_qualification_decisions").select("id,place,kind,reason,created_at,finals_qualification_rules!inner(season_id)").eq("producer_id", producer.id).eq("finals_qualification_rules.season_id", season.id).order("created_at", { ascending: false });
  if (decisions.error) throw new Error("Unable to load qualifier decision history.");
  if (classifications.error || divisions.error || members.error || manual.error) throw new Error("Unable to load finals positions.");
  const divisionNames = new Map(divisions.data.map((division) => [division.id, division.name]));
  const classes = classifications.data.map((item) => ({ id: item.id, name: `${item.name} ${divisionNames.get(item.division_id) ?? ""}` }));
  for (const division of divisions.data) for (const [format, name] of [["handicap", "Handicap"], ["four_d", "4-D"]]) classes.push({ id: `${division.id}:${format}`, name: `${name} ${division.name}` });
  const classNames = new Map(classes.map((item) => [item.id, item.name]));
  const memberOptions = members.data.map((member) => { const roper = member.ropers as unknown as { first_name: string; last_name: string }; return { id: member.id, number: member.member_number, name: `${roper?.first_name ?? ""} ${roper?.last_name ?? ""}` }; });
  const names = new Map([...memberOptions.map((member) => [member.id, member.name] as const), ...results.profiles.map((member) => [member.memberId, member.name] as const)]);
  const rows = results.totals.sort((a, b) => (classNames.get(a.classId) ?? a.classId).localeCompare(classNames.get(b.classId) ?? b.classId) || (names.get(a.memberId) ?? "").localeCompare(names.get(b.memberId) ?? ""));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const assignments = await loadFinalsAssignments(producer.id, season.id);
  const targetRows = await readAllRows((first, last) => db.from("event_ropings")
    .select("id,event_id,name,scheduled_date,classification_id,division_id,competition_format,event_day_status,payouts_finalized_at,events!inner(title,status),divisions!roping_division_discipline_same_organization(name)")
    .eq("producer_id", producer.id).order("id").range(first, last), "Unable to load target ropings");
  const checks = await readAllRows((first, last) => db.from("roping_qualification_checks").select("event_roping_id,class_key")
    .eq("producer_id", producer.id).eq("season_id", season.id).eq("bonus_entries_enabled", true).order("event_roping_id").range(first, last), "Unable to load target qualification setup");
  const ready = new Map(checks.map((item) => [item.event_roping_id, item.class_key]));
  const targets: FinalsTarget[] = targetRows.map((item) => {
    const event = item.events as unknown as { title: string; status: string };
    const division = item.divisions as unknown as { name: string };
    const classId = ["handicap", "four_d"].includes(item.competition_format) ? `${item.division_id}:${item.competition_format}` : item.classification_id ?? "";
    return { id: item.id, classId, eventId: item.event_id, name: `${event.title} · ${item.name} ${division?.name ?? ""}`, date: item.scheduled_date,
      ready: ready.get(item.id) === classId, locked: item.scheduled_date < today || ["in_progress", "completed"].includes(item.event_day_status) || ["completed", "cancelled"].includes(event.status) || !!item.payouts_finalized_at };
  });
  const slots = finalsPositionSlots(results.awards, assignments, season.ends_on, today);
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Finals positions</h1><RopingSetupTabs active="finals" />
    <form className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-semibold">Season<select name="season" defaultValue={season.id} className="h-10 max-w-full rounded-md border bg-white px-3">{seasons.data.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><button className="h-10 rounded-md border bg-white px-3 text-sm font-semibold">View</button></form>
    {producer.role !== "viewer" && <ManualFinalsAward seasonId={season.id} members={memberOptions} classes={classes} date={today < season.starts_on ? season.starts_on : today > season.ends_on ? season.ends_on : today} />}
    <FinalsPositionAssignments slots={slots} targets={targets} members={Object.fromEntries(names)} classes={Object.fromEntries(classNames)} seasonId={season.id} endsOn={season.ends_on} canEdit={producer.role !== "viewer"} />
    <section><h2 className="mb-3 font-semibold">Earned bonus positions · {rows.length} members and classes</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#eef1ef]"><tr><th className="p-3">Member</th><th className="p-3">Finals class</th><th className="p-3 text-right">Positions</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.memberId}:${row.classId}`} className="border-b"><td className="p-3 font-semibold"><Link href={`/members/${row.memberId}`}>{names.get(row.memberId) ?? "Member"}</Link></td><td className="p-3">{classNames.get(row.classId) ?? "Class"}</td><td className="p-3 text-right tabular-nums">{row.positions}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5 text-sm text-[#66716b]">No finals positions earned in this season yet.</p>}</div></section>
    {results.issues.length > 0 && <details className="border-t pt-4"><summary className="cursor-pointer font-semibold">Qualifier review · {results.issues.length} placements</summary><ul className="mt-3 space-y-4 text-sm">{results.issues.map((issue) => {
      const rule = results.rules.find((rule) => rule.id === issue.ruleId);
      const candidates = issue.entryIds.flatMap((id) => { const finish = results.finishes.find((finish) => finish.entryId === id && finish.ropingId === rule?.ropingId && finish.stage === rule?.stage && finish.round === rule?.round); return finish?.memberId ? [{ id, name: names.get(finish.memberId) ?? "Member" }] : []; });
      const roping = ropingNames.get(rule?.ropingId ?? "");
      return <li key={`${issue.ruleId}:${issue.place}`} className="border-b pb-3"><p className="font-semibold">{classNames.get(rule?.classId ?? "")} · {rule?.stage === "go_round" ? `Round ${rule.round}` : rule?.stage === "short_round" ? "Short round" : "Aggregate"} · Place {issue.place}</p>{roping && <Link className="mt-1 inline-block text-xs underline" href={`/events/${roping.event_id}`}>{roping.name} · {roping.scheduled_date}</Link>}<p>{issue.reason === "tie_requires_decision" ? "Tied finish awaiting staff decision" : "No eligible recipient"}</p>{issue.reason === "tie_requires_decision" && producer.role !== "viewer" && <FinalsDecisionForm seasonId={season.id} ruleId={issue.ruleId} place={issue.place} kind="tie" candidates={candidates} />}</li>;
    })}</ul></details>}
    <details className="border-t pt-4"><summary className="cursor-pointer font-semibold">Automatic award history</summary><div className="mt-3 space-y-3">{results.awards.filter((award) => award.source === "finish" && !award.revoked).map((award) => <div key={award.id} className="border-b pb-3 text-sm"><p className="font-semibold">{names.get(award.memberId)} · {classNames.get(award.classId)} · {award.positions} positions</p>{producer.role !== "viewer" && <FinalsDecisionForm seasonId={season.id} ruleId={award.ruleId!} place={award.place!} kind="revoke" candidates={[{ id: award.entryId!, name: names.get(award.memberId) ?? "Member" }]} />}</div>)}</div></details>
    <details className="border-t pt-4"><summary className="cursor-pointer font-semibold">Staff decision history · {decisions.data.length}</summary><ul className="mt-3 space-y-3 text-sm">{decisions.data.map((decision) => <li key={decision.id} className="border-b pb-3"><p className="font-semibold">{decision.kind === "tie" ? "Tie resolved" : "Automatic award revoked"} · Place {decision.place}</p><p className="mt-1 text-[#66716b]">{decision.reason}</p><time className="mt-1 block text-xs text-[#66716b]">{new Date(decision.created_at).toLocaleString("en-US", { timeZone: producer.timezone })}</time></li>)}</ul></details>
    <details className="border-t pt-4"><summary className="cursor-pointer font-semibold">Manual award history · {manual.data.length}</summary><div className="mt-3 space-y-3">{manual.data.map((award) => <div key={award.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-sm"><div><p className="font-semibold">{names.get(award.membership_id) ?? "Member"} · {classNames.get(award.class_key)} · {award.positions} positions</p><p className="mt-1 text-[#66716b]">{award.awarded_on} · {award.reason}</p>{award.revoked && <p className="mt-1 text-red-700">Revoked: {award.revoke_reason}</p>}</div>{!award.revoked && producer.role !== "viewer" && <RevokeFinalsAward awardId={award.id} />}</div>)}</div></details>
  </div>;
}
