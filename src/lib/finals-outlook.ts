import { meetsFinalsEntryRequirements } from "./finals-entry-eligibility";
import type { FinalsReviewRequirements } from "./finals-entry-review";

export interface OutlookRule extends FinalsReviewRequirements {
  standingsCutoff: string;
  attendanceCutoff: string;
}
export interface OutlookStanding { rank: number; ropingsEntered: number; finalsPositions?: number }
export type OutlookStatus = "qualifies" | "attendance" | "standings" | "both" | "review";

export function outlookDeadline(date: string, today: string) {
  const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
  return { date, days, label: days < 0 ? "Cutoff passed" : days === 0 ? "Closes today" : days <= 14 ? `${days} days left` : "Open", closed: days < 0 };
}

export function projectFinalsOutlook(row: OutlookStanding | undefined, rule: OutlookRule | null, today: string,
  normalEntries: number | null, bonusEnabled: boolean, pendingPositions = 0, restrictions: string[] = []) {
  const qualified = !!rule && meetsFinalsEntryRequirements(row, rule);
  const rank = row && row.rank < 2147483647 ? row.rank : null;
  const attendance = row?.ropingsEntered ?? 0;
  const assigned = row?.finalsPositions ?? 0;
  const remainingRopings = rule ? Math.max(0, rule.minimumRopings - attendance) : 0;
  const outsidePlaces = !!rule && rule.topPlaces !== null && (rank === null || rank > rule.topPlaces);
  const bonusWaivesRank = assigned > 0 && rule?.earnedPositionPolicy !== "none";
  const bonusWaivesAttendance = assigned > 0 && rule?.earnedPositionPolicy === "rank_and_attendance";
  const needsAttendance = !qualified && remainingRopings > 0 && !bonusWaivesAttendance;
  const needsRank = !qualified && outsidePlaces && !bonusWaivesRank;
  const status: OutlookStatus = !rule || restrictions.length ? "review" : qualified ? "qualifies" : needsAttendance && needsRank ? "both" : needsAttendance ? "attendance" : needsRank ? "standings" : "review";
  const standingsDeadline = rule ? outlookDeadline(rule.standingsCutoff, today) : null;
  const attendanceDeadline = rule ? outlookDeadline(rule.attendanceCutoff, today) : null;
  const bonusEntries = bonusEnabled && normalEntries !== null ? assigned : 0;
  const reasons = [...restrictions];
  if (!rule) reasons.push("The producer needs to review qualification setup.");
  if (needsAttendance) reasons.push(`${remainingRopings} more ${remainingRopings === 1 ? "roping" : "ropings"} needed${attendanceDeadline?.closed ? "; attendance cutoff has passed" : ""}.`);
  if (needsRank) reasons.push(`Outside the top ${rule!.topPlaces}${standingsDeadline?.closed ? "; standings cutoff has passed" : ""}.`);
  return { qualified, status, rank, attendance, remainingRopings, outsidePlaces, assigned, pendingPositions, bonusEntries,
    allowance: normalEntries === null ? null : normalEntries + bonusEntries,
    standingsDeadline, attendanceDeadline, reasons, requirementsClosed: !!standingsDeadline?.closed && !!attendanceDeadline?.closed };
}

export const outlookStatusLabels: Record<OutlookStatus, string> = {
  qualifies: "Currently meets requirements", attendance: "Attendance needed", standings: "Outside qualifying places",
  both: "Attendance and standings needed", review: "Producer review needed",
};
