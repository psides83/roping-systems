export type RequirementMatch = "all" | "any";
export type QualificationOverride = "inherit" | "none" | "custom";

export function qualificationCutoffText(rule: { cutoff_on: string | null; attendance_cutoff_on?: string | null }) {
  return `Standings through ${rule.cutoff_on ?? "season end"} · Attendance through ${rule.attendance_cutoff_on ?? "season end"}`;
}

export interface QualificationRuleSet {
  id: string;
  name: string;
  season_id: string;
  top_places: number | null;
  minimum_ropings: number;
  cutoff_on: string | null;
  attendance_cutoff_on: string | null;
  requirement_match: RequirementMatch;
  earned_position_policy: "none" | "rank" | "rank_and_attendance";
  bonus_entries_enabled: boolean;
  updated_at: string;
}

export function matchesQualificationRuleSet(
  row: { rank: number; ropingsEntered: number; finalsPositions?: number } | undefined,
  rule: Pick<QualificationRuleSet, "top_places" | "minimum_ropings" | "requirement_match" | "earned_position_policy">,
) {
  const attendance = (row?.ropingsEntered ?? 0) >= rule.minimum_ropings;
  const rank = rule.top_places === null || (!!row && row.rank <= rule.top_places);
  const earned = (row?.finalsPositions ?? 0) > 0;
  if (earned && rule.earned_position_policy === "rank_and_attendance") return true;
  if (earned && rule.earned_position_policy === "rank" && attendance) return true;
  const conditions = [rule.minimum_ropings > 0 ? attendance : null, rule.top_places !== null ? rank : null].filter((value): value is boolean => value !== null);
  return conditions.length === 0 || (rule.requirement_match === "any" ? conditions.some(Boolean) : conditions.every(Boolean));
}

export function effectiveQualificationRuleSet(eventRuleId: string | null, mode: QualificationOverride, ropingRuleId: string | null) {
  return mode === "none" ? null : mode === "custom" ? ropingRuleId : eventRuleId;
}
