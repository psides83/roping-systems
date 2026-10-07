import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calculateFinalsQualifications, type FinalsQualificationRule, type QualifierFinish, type ManualFinalsPosition, type FinalsPositionMove, type FinalsQualificationDecision } from "@/lib/finals-qualifications";

export async function loadFinalsQualifications(producerSlug: string, seasonId: string, cutoff?: string) {
  const db = await createClient();
  const { data, error } = await db.rpc("finals_qualification_source", { target_producer_slug: producerSlug, target_season_id: seasonId });
  if (error) throw new Error("Unable to load finals qualification positions.");
  const source = data as { rules: FinalsQualificationRule[]; finishes: QualifierFinish[]; manual: ManualFinalsPosition[];
    moves?: FinalsPositionMove[]; decisions?: FinalsQualificationDecision[]; profiles: { memberId: string; roperId: string; name: string }[] };
  const finishes = source.finishes.filter((finish) => !cutoff || finish.date <= cutoff);
  return { ...calculateFinalsQualifications(source.rules, finishes, source.manual.filter((award) => !cutoff || award.date <= cutoff), (source.moves ?? []).filter((move) => !cutoff || move.date <= cutoff), source.decisions ?? []), profiles: source.profiles, rules: source.rules, finishes };
}
