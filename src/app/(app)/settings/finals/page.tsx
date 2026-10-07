import Link from "next/link";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { ManualFinalsAward, RevokeFinalsAward } from "@/components/settings/manual-finals-award";

export default async function FinalsPositionsPage({ searchParams }: PageProps<"/settings/finals">) {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer.</p>;
  const query = await searchParams; const db = await createClient();
  const seasons = await db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  if (seasons.error) throw new Error("Unable to load seasons.");
  const season = seasons.data.find((season) => season.id === query.season) ?? seasons.data[0];
  if (!season) return <p>Create a producer season before configuring finals qualifiers.</p>;
  const results = await loadFinalsQualifications(producer.slug, season.id);
  const classifications = await db.from("classifications").select("id,name,division_id").eq("producer_id", producer.id).eq("standalone_enabled", true);
  const divisions = await db.from("divisions").select("id,name").eq("producer_id", producer.id);
  const members = await db.from("memberships").select("id,member_number,ropers(first_name,last_name)").eq("producer_id", producer.id).order("member_number").limit(1000);
  const manual = await db.from("manual_finals_positions").select("id,membership_id,class_key,positions,reason,revoked,revoke_reason,awarded_on").eq("producer_id", producer.id).eq("season_id", season.id).order("awarded_on", { ascending: false });
  if (classifications.error || divisions.error || members.error || manual.error) throw new Error("Unable to load finals positions.");
  const divisionNames = new Map(divisions.data.map((division) => [division.id, division.name]));
  const classes = classifications.data.map((item) => ({ id: item.id, name: `${item.name} ${divisionNames.get(item.division_id) ?? ""}` }));
  for (const division of divisions.data) for (const [format, name] of [["handicap", "Handicap"], ["four_d", "4-D"]]) classes.push({ id: `${division.id}:${format}`, name: `${name} ${division.name}` });
  const classNames = new Map(classes.map((item) => [item.id, item.name]));
  const memberOptions = members.data.map((member) => { const roper = member.ropers as unknown as { first_name: string; last_name: string }; return { id: member.id, number: member.member_number, name: `${roper?.first_name ?? ""} ${roper?.last_name ?? ""}` }; });
  const names = new Map([...memberOptions.map((member) => [member.id, member.name] as const), ...results.profiles.map((member) => [member.memberId, member.name] as const)]);
  const rows = results.totals.sort((a, b) => (classNames.get(a.classId) ?? a.classId).localeCompare(classNames.get(b.classId) ?? b.classId) || (names.get(a.memberId) ?? "").localeCompare(names.get(b.memberId) ?? ""));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return <div className="space-y-5"><h1 className="text-2xl font-bold">Finals positions</h1><RopingSetupTabs active="finals" />
    <form className="flex flex-wrap items-end gap-3"><label className="grid gap-2 text-sm font-semibold">Season<select name="season" defaultValue={season.id} className="h-10 max-w-full rounded-md border bg-white px-3">{seasons.data.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label><button className="h-10 rounded-md border bg-white px-3 text-sm font-semibold">View</button></form>
    {producer.role !== "viewer" && <ManualFinalsAward seasonId={season.id} members={memberOptions} classes={classes} date={today < season.starts_on ? season.starts_on : today > season.ends_on ? season.ends_on : today} />}
    <section><h2 className="mb-3 font-semibold">Earned eligibility · {rows.length} members and classes</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#eef1ef]"><tr><th className="p-3">Member</th><th className="p-3">Finals class</th><th className="p-3 text-right">Positions</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.memberId}:${row.classId}`} className="border-b"><td className="p-3 font-semibold"><Link href={`/members/${row.memberId}`}>{names.get(row.memberId) ?? "Member"}</Link></td><td className="p-3">{classNames.get(row.classId) ?? "Class"}</td><td className="p-3 text-right tabular-nums">{row.positions}</td></tr>)}</tbody></table>{!rows.length && <p className="p-5 text-sm text-[#66716b]">No finals positions earned in this season yet.</p>}</div></section>
    {results.issues.length > 0 && <details className="border-t pt-4"><summary className="cursor-pointer font-semibold">Qualifier review · {results.issues.length} placements</summary><ul className="mt-3 space-y-2 text-sm">{results.issues.map((issue) => <li key={`${issue.ruleId}:${issue.place}`}>Place {issue.place}: {issue.reason === "tie_requires_decision" ? "Tied finish awaiting staff decision" : "No eligible recipient"}</li>)}</ul></details>}
    <details className="border-t pt-4"><summary className="cursor-pointer font-semibold">Manual award history · {manual.data.length}</summary><div className="mt-3 space-y-3">{manual.data.map((award) => <div key={award.id} className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 text-sm"><div><p className="font-semibold">{names.get(award.membership_id) ?? "Member"} · {classNames.get(award.class_key)} · {award.positions} positions</p><p className="mt-1 text-[#66716b]">{award.awarded_on} · {award.reason}</p>{award.revoked && <p className="mt-1 text-red-700">Revoked: {award.revoke_reason}</p>}</div>{!award.revoked && producer.role !== "viewer" && <RevokeFinalsAward awardId={award.id} />}</div>)}</div></details>
  </div>;
}
