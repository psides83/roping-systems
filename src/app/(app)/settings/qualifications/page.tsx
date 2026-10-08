import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { QualificationRuleSetForm } from "@/components/settings/qualification-rule-set-form";
import type { QualificationRuleSet } from "@/lib/qualification-rule-sets";

export default async function QualificationSettings() {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer.</p>;
  const db = await createClient();
  const seasons = await db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  const rules = await db.from("qualification_rule_sets").select("*").eq("producer_id", producer.id).order("name");
  if (seasons.error || rules.error) throw new Error("Unable to load qualification rules.");
  const editable = ["owner", "admin"].includes(producer.role);
  return <div className="space-y-5"><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold">Qualification rules</h1><QualificationRuleSetForm seasons={seasons.data} editable={editable} /></header><RopingSetupTabs active="qualifications" />
    {!seasons.data.length && <p className="text-sm text-[#66716b]">Create a producer season first.</p>}
    <div className="divide-y divide-[#dfe4e1]">{(rules.data as QualificationRuleSet[]).map((rule) => <section key={rule.id} className="flex flex-wrap items-start justify-between gap-4 py-5"><div><h2 className="font-bold">{rule.name}</h2><p className="mt-1 text-sm text-[#66716b]">{seasons.data.find((s) => s.id === rule.season_id)?.name} · {rule.minimum_ropings} ropings{rule.top_places ? ` · Top ${rule.top_places}` : ""} · {rule.requirement_match === "all" ? "All regular requirements" : "Either regular requirement"}</p>{rule.cutoff_on && <p className="mt-1 text-xs text-[#66716b]">Through {rule.cutoff_on}</p>}</div><QualificationRuleSetForm rule={rule} seasons={seasons.data} editable={editable} /></section>)}</div>
  </div>;
}
