import "server-only";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { finalsPositionSlots, assignedFinalsTotals, type FinalsPositionAssignment } from "@/lib/finals-position-assignments";
import type { FinalsPositionAward } from "@/lib/finals-qualifications";

export async function loadFinalsAssignments(producerId: string, seasonId: string) {
  const db = await createClient();
  return await readAllRows((first, last) => db.from("finals_position_assignments").select("id,award_key,position_number,event_roping_id,assigned_class_key,assigned_at,reason")
    .eq("producer_id", producerId).eq("season_id", seasonId).order("id").range(first, last), "Unable to load finals position assignments") as FinalsPositionAssignment[];
}

export async function loadAssignedFinalsTotals(producerId: string, seasonId: string, ropingId: string, awards: FinalsPositionAward[]) {
  const assignments = await loadFinalsAssignments(producerId, seasonId);
  // Assigned positions remain usable for their target after the season ends.
  return assignedFinalsTotals(finalsPositionSlots(awards, assignments, "9999-12-31", "0001-01-01"), ropingId);
}
