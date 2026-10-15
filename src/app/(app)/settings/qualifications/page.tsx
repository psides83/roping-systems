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
  const editable = ["owner", "admin"].includes(producer.role);
  return <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Qualification rules</h1><QualificationRuleSetForm seasons={seasons.data} editable={editable} /></header><RopingSetupTabs active="qualifications" />
    <p className="text-sm leading-6 text-[#526059]">Create named eligibility rules for events that require ropers to qualify. Saving a rule set does not apply it automatically: select it on the event, then review any individual roping overrides.</p>
    <ContextHelp title="How do qualification rules work?" guide="qualification-rules"><p>A rule set combines a season, attendance and/or standings requirements, cutoff dates, and how earned finals positions are treated.</p><p>Example: require at least 5 ropings and a top-15 placing. AND requires both; OR allows either enabled requirement. A minimum of 0 and a blank top-places field mean no regular qualification restriction.</p><p>Ropings can inherit the event’s rule set, use a different rule set, or have qualification turned off. Other entry checks, such as membership and age, still apply.</p><p>Season eligibility separately controls qualification labels on public standings. An event rule set can differ from those season requirements.</p><Link href="/settings/standings" className="font-semibold underline">Review season eligibility</Link></ContextHelp>
    {!editable && <p className="text-sm text-[#66716b]">Only producer owners and administrators can create or change qualification rules.</p>}
    {!seasons.data.length && <p className="text-sm text-[#66716b]">Create a producer season first. <Link href="/settings?tab=seasons" className="font-semibold underline">Manage seasons</Link></p>}
    {!rules.data.length && <section className="rounded-md border border-dashed border-[#ccd4d0] p-5"><h2 className="font-bold">No qualification rule sets yet</h2><p className="mt-2 text-sm leading-6 text-[#66716b]">Create one for a qualified event, such as season finals. Events without qualification requirements do not need a rule set.</p></section>}
    <div className="divide-y divide-[#dfe4e1]">{(rules.data as QualificationRuleSet[]).map((rule) => <section key={rule.id} className="flex flex-wrap items-start justify-between gap-4 py-5"><div><h2 className="font-bold">{rule.name}</h2><p className="mt-1 text-sm text-[#66716b]">{seasons.data.find((s) => s.id === rule.season_id)?.name} · {rule.minimum_ropings} ropings{rule.top_places ? ` · Top ${rule.top_places}` : ""} · {rule.requirement_match === "all" ? "All regular requirements" : "Either regular requirement"}</p><p className="mt-1 text-xs text-[#66716b]">{qualificationCutoffText(rule)}</p></div><QualificationRuleSetForm rule={rule} seasons={seasons.data} editable={editable} /></section>)}</div>
  </div>;
}
