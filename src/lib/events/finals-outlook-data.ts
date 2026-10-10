import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadSeasonStandings } from "@/lib/events/season-standings-data";
import { calculateQualificationStandings } from "@/lib/season-standings";
import { roperBonusPositions, type RoperBonusSource } from "@/lib/roper-bonus-positions";
import type { RoperStandingsContext } from "@/lib/roper-standings";
import { projectFinalsOutlook, type OutlookRule } from "@/lib/finals-outlook";
import { ropingDisplayName } from "@/lib/events/roping-display-name";

export interface OutlookTarget {
  id: string; eventId: string; eventTitle: string; eventSlug: string; name: string; divisionName: string; date: string; classKey: string;
  normalEntries: number | null; bonusEnabled: boolean; requirementsAvailable: boolean;
  rule: OutlookRule; restrictions: string[]; classificationAllowed: boolean;
}
export interface RoperOutlookContext extends RoperStandingsContext { today: string; targets: OutlookTarget[] }
export type PersonalOutlook = { target: OutlookTarget; progress: ReturnType<typeof projectFinalsOutlook> };

export async function loadRoperFinalsOutlook(membershipId: string, seasonId?: string) {
  const db = await createClient();
  const response = await db.rpc("my_roper_finals_outlook_context", { target_membership_id: membershipId, target_season_id: seasonId || null });
  if (response.error) throw new Error("Unable to load your qualification outlook.");
  const context = response.data as RoperOutlookContext;
  const rows: PersonalOutlook[] = [];
  if (!context.season || !context.targets.length) return { context, rows };
  const source = await loadSeasonStandings(context.producerSlug, context.season.id);
  const bonusResponse = await db.rpc("my_roper_bonus_positions", { target_membership_id: membershipId, target_season_id: context.season.id });
  if (bonusResponse.error) throw new Error("Unable to load your earned positions.");
  const bonus = bonusResponse.data as RoperBonusSource;
  const ownClasses = new Set([...context.currentClasses, ...source.contributions.filter(row => row.roperId === context.roperId).map(row => row.classId)]);
  const cutoffRows = new Map<string, ReturnType<typeof calculateQualificationStandings>["rows"]>();
  const cutoffSlots = new Map<string, ReturnType<typeof roperBonusPositions>>();
  for (const target of context.targets) {
    const standingsDate = target.rule.standingsCutoff < context.today ? target.rule.standingsCutoff : context.today;
    const attendanceDate = target.rule.attendanceCutoff < context.today ? target.rule.attendanceCutoff : context.today;
    const key = `${standingsDate}:${attendanceDate}`;
    if (!cutoffRows.has(key)) cutoffRows.set(key, calculateQualificationStandings(source.contributions, source.moves, context.season, standingsDate, attendanceDate).rows);
    if (!cutoffSlots.has(standingsDate)) cutoffSlots.set(standingsDate, roperBonusPositions({ ...bonus, source: bonus.source ? { ...bonus.source,
      finishes: bonus.source.finishes.filter(row => row.date <= standingsDate),
      manual: bonus.source.manual.filter(row => row.date <= standingsDate),
      moves: bonus.source.moves.filter(row => row.date <= standingsDate),
    } : null }));
    const allSlots = cutoffSlots.get(standingsDate)!;
    const slots = allSlots.filter(slot => slot.classId === target.classKey);
    const assigned = slots.filter(slot => slot.status === "assigned" && slot.targetId === target.id).length;
    const pending = slots.filter(slot => slot.status === "pending").length;
    if (!target.classificationAllowed && !ownClasses.has(target.classKey) && !allSlots.some(slot => slot.targetId === target.id)) continue;
    const standing = cutoffRows.get(key)!.find(row => row.roperId === context.roperId && row.classId === target.classKey);
    const row = standing ? { ...standing, finalsPositions: assigned } : assigned ? { rank: Number.MAX_SAFE_INTEGER, ropingsEntered: 0, finalsPositions: assigned } : undefined;
    const restrictions = [...target.restrictions];
    if (allSlots.some(slot => slot.status === "needs_review" && slot.targetId === target.id)) restrictions.push("An assigned bonus position needs producer review after a classification change.");
    rows.push({ target: { ...target, name: ropingDisplayName(target.name, target.divisionName) }, progress: projectFinalsOutlook(row, target.requirementsAvailable ? target.rule : null, context.today, target.normalEntries, target.bonusEnabled, pending, restrictions) });
  }
  return { context, rows };
}
