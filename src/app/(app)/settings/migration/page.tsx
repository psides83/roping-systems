import Link from "next/link";
import { ProducerSettingsTabs } from "@/components/settings/producer-settings-tabs";
import { HistoryImportWorkspace } from "@/components/settings/history-import-workspace";
import { HistoryImportLog } from "@/components/settings/history-import-log";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

export default async function MigrationPage() {
  const producer = await getActiveProducer();
  if (!producer) return <p>Select a producer to continue.</p>;
  const db = await createClient();
  const { data: seasons, error: seasonError } = await db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("starts_on", { ascending: false });
  const { data: divisions, error: divisionError } = await db.from("divisions").select("id,name,classifications(id,name,standalone_enabled)").eq("producer_id", producer.id);
  const { data: funds, error: fundError } = await db.from("producer_funds").select("id,name").eq("producer_id", producer.id).eq("is_active", true).order("name");
  const { data: formats, error: formatError } = await db.from("roping_templates").select("division_id,available_division_ids,competition_format").eq("producer_id", producer.id);
  const { data: batches, error: batchError } = await db.from("producer_history_batches").select("id,file_name,kind,source_note,created_at,reversed_at,reversal_reason").eq("producer_id", producer.id).order("created_at", { ascending: false }).limit(50);
  if (seasonError || divisionError || fundError || batchError || formatError) throw new Error("Unable to load producer migration details.");
  const classes = (divisions ?? []).flatMap((d) => [
    ...d.classifications.filter((c) => c.standalone_enabled).map((c) => ({ id: c.id, label: `${c.name} · ${d.name}` })),
    ...["handicap", "four_d"].filter((format) => formats?.some((f) => f.available_division_ids.includes(d.id) && f.competition_format === format))
      .map((format) => ({ id: `${d.id}:${format}`, label: `${format === "handicap" ? "Handicap" : "4-D"} · ${d.name}` })),
  ]);
  const manager = ["owner", "admin", "operator"].includes(producer.role);
  return <div className="space-y-5">
    <header><h1 className="text-2xl font-bold">Producer migration</h1><p className="mt-2 text-sm text-[#66716b]">{producer.name}</p></header>
    <ProducerSettingsTabs active="migration" />
    <div className="flex flex-wrap gap-4 text-sm font-semibold"><Link href="/members/import">Import members</Link><Link href="/funds">Manage funds</Link><Link href="/settings?tab=seasons">Manage seasons</Link></div>
    {manager || producer.treasurer ? <HistoryImportWorkspace seasons={seasons ?? []} classes={classes} funds={(funds ?? []).map((f) => ({ id: f.id, label: f.name }))} canStandings={manager} /> : <p>Migration management access is required.</p>}
    <HistoryImportLog batches={batches ?? []} canStandings={manager} canFunds={manager || Boolean(producer.treasurer)} />
  </div>;
}
