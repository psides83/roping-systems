import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calculateFinalsQualifications, type FinalsQualificationRule, type QualifierFinish, type ManualFinalsPosition, type FinalsPositionMove } from "@/lib/finals-qualifications";

export async function loadFinalsQualifications(producerSlug: string, seasonId: string) {
  const db = await createClient();
  const { data, error } = await db.rpc("finals_qualification_source", { target_producer_slug: producerSlug, target_season_id: seasonId });
  if (error) throw new Error("Unable to load finals qualification positions.");
  const source = data as { rules: FinalsQualificationRule[]; finishes: QualifierFinish[]; manual: ManualFinalsPosition[];
    moves?: FinalsPositionMove[]; profiles: { memberId: string; roperId: string; name: string }[] };
  return { ...calculateFinalsQualifications(source.rules, source.finishes, source.manual, source.moves ?? []), profiles: source.profiles };
}
