import Link from "next/link";
import { ContextHelp } from "@/components/help/context-help";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { QualificationRuleSetForm } from "@/components/settings/qualification-rule-set-form";
import { qualificationCutoffText, type QualificationRuleSet } from "@/lib/qualification-rule-sets";

export default async function QualificationSettings() {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer.</p>;
  const db = await createClient();
  const seasons = await db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  const rules = await db.from("qualification_rule_sets").select("*").eq("producer_id", producer.id).order("name");
  if (seasons.error || rules.error) throw new Error("Unable to load qualification rules.");
  const designated = (rules.data as QualificationRuleSet[]).find(rule => rule.is_finals);
  const finalsRule = designated ? { id: designated.id, name: designated.name, seasonName: seasons.data.find(season => season.id === designated.season_id)?.name ?? "Selected season" } : undefined;
  const editable = ["owner", "admin"].includes(producer.role);
  return <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Qualification rules</h1><div className="flex flex-wrap gap-2"><Link href="/settings/standings/carryovers" className="inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-semibold">Carryover review</Link><QualificationRuleSetForm finalsRule={finalsRule} seasons={seasons.data} editable={editable} /></div></header><RopingSetupTabs active="qualifications" />
    <p className="text-sm leading-6 text-[#526059]">Create named eligibility rules for finals and other ropings that require ropers to qualify. Saving a rule set does not apply it automatically: select it on the event, then review any individual roping overrides.</p>
    <ContextHelp title="How do qualification rules work?" guide="qualification-rules"><p>A rule set combines a season, attendance and/or standings requirements, cutoff dates, and how the enabled requirements are combined.</p><p>Example: require at least 5 ropings and a top-15 placing. AND requires both; OR allows either enabled requirement. A minimum of 0 and a blank top-places field mean no regular qualification restriction.</p><p>Ropings can inherit the event’s rule set, use a different rule set, or have qualification turned off. Other entry checks, such as membership and age, still apply.</p><p>Mark a rule set as Finals qualification rules to publish it on public standings. The same rule set can then be assigned to a finals event or roping.</p></ContextHelp>
    {!editable && <p className="text-sm text-[#66716b]">Only producer owners and administrators can create or change qualification rules.</p>}
    {!seasons.data.length && <p className="text-sm text-[#66716b]">Create a producer season first. <Link href="/settings?tab=seasons" className="font-semibold underline">Manage seasons</Link></p>}
    {!rules.data.length && <section className="rounded-md border border-dashed border-[#ccd4d0] p-5"><h2 className="font-bold">No qualification rule sets yet</h2><p className="mt-2 text-sm leading-6 text-[#66716b]">Create one for a finals or other qualified roping with attendance or rank requirements. Open ropings without qualification requirements do not need a rule set.</p></section>}
    <div className="divide-y divide-[#dfe4e1]">{(rules.data as QualificationRuleSet[]).map((rule) => <section key={rule.id} className="flex flex-wrap items-start justify-between gap-4 py-5"><div><h2 className="font-bold">{rule.name}</h2>{rule.is_finals && <p className="mt-1 text-sm font-semibold text-emerald-800">Finals qualification · Published on public standings</p>}<p className="mt-1 text-sm text-[#66716b]">{seasons.data.find((s) => s.id === rule.season_id)?.name} · {rule.minimum_ropings} ropings{rule.top_places ? ` · Top ${rule.top_places}` : ""} · {rule.requirement_match === "all" ? "All regular requirements" : "Either regular requirement"}</p><p className="mt-1 text-xs text-[#66716b]">{qualificationCutoffText(rule)}</p></div><QualificationRuleSetForm finalsRule={finalsRule} rule={rule} seasons={seasons.data} editable={editable} /></section>)}</div>
  </div>;
}
