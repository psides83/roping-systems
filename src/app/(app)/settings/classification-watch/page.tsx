import { PageHeader } from "@/components/ui/page-header";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { ClassificationWatchRules } from "@/components/settings/classification-watch-rules";
import { ClassificationWatchEvidence } from "@/components/members/classification-watch-evidence";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import type { WatchRule } from "@/lib/classification-watch";
import { ClassificationMoveBackSettings } from "@/components/settings/classification-move-back-settings";
import { StandingsCarryoverSettings } from "@/components/settings/standings-carryover-settings";

export default async function ClassificationWatchPage() {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer to configure classification watch.</p>;
  const db = await createClient();
  const settings = await db.from("producers").select("classification_watch_enabled,classification_move_back_enabled,classification_move_back_min_ropings,standings_cap_carryover").eq("id", producer.id).single();
  const rules = await db.from("classification_watch_rules").select("*").eq("producer_id", producer.id).order("name");
  const classes = await db.from("classifications").select("id,name,division_id,divisions!inner(name)").eq("producer_id", producer.id).order("rank", { ascending: false });
  if (settings.error || rules.error || classes.error) throw new Error("Unable to load classification watch settings.");
  return <div className="space-y-6">
    <PageHeader eyebrow="Roping setup" title="Classification watch" description="Optional fast-run evidence based on each member’s classification, including entered-down ropings. Each qualifying run counts. Classification moves always require staff approval." />
    <RopingSetupTabs active="watch" />
    <ClassificationWatchRules rules={rules.data as WatchRule[]} classifications={classes.data as unknown as Array<{ id: string; name: string; division_id: string; divisions: { name: string } }>} enabled={settings.data.classification_watch_enabled} canEdit={producer.role !== "viewer"} canConfigure={["owner", "admin"].includes(producer.role)} />
    <ClassificationMoveBackSettings enabled={settings.data.classification_move_back_enabled} minimumRopings={settings.data.classification_move_back_min_ropings} canEdit={["owner", "admin"].includes(producer.role)} />
    <ClassificationWatchEvidence />
    <StandingsCarryoverSettings capped={settings.data.standings_cap_carryover} canEdit={["owner", "admin"].includes(producer.role)} />
  </div>;
}
