export type RequirementMatch = "all" | "any";
export type QualificationOverride = "inherit" | "none" | "custom" | "finals";

export function qualificationCutoffText(rule: { cutoff_on: string | null; attendance_cutoff_on?: string | null }) {
  return `Standings through ${rule.cutoff_on ?? "season end"} · Attendance through ${rule.attendance_cutoff_on ?? "season end"}`;
}

export interface QualificationRuleSet {
  is_finals?: boolean;
  class_key?: string | null;
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
  return mode === "none" || mode === "finals" ? null : mode === "custom" ? ropingRuleId : eventRuleId;
}

export function qualificationRequirementsText(rule: Pick<QualificationRuleSet, "minimum_ropings" | "top_places" | "requirement_match">) {
  const conditions = [rule.minimum_ropings > 0 ? `${rule.minimum_ropings} ropings attended` : null, rule.top_places !== null ? `Top ${rule.top_places} in standings` : null].filter(Boolean);
  return conditions.length ? conditions.join(rule.requirement_match === "any" ? " OR " : " AND ") : "No attendance or rank requirement";
}

export function publicQualificationBullets(rule: Pick<QualificationRuleSet, "top_places" | "minimum_ropings" | "earned_position_policy" | "bonus_entries_enabled">): string[] {
  const bullets: string[] = [];
  if (rule.top_places !== null) bullets.push(`Top ${rule.top_places} in the season standings`);
  if (rule.minimum_ropings > 0) bullets.push(`Must have attended ${rule.minimum_ropings} ${rule.minimum_ropings === 1 ? "roping" : "ropings"}`);
  if (!bullets.length) bullets.push("No standings or attendance requirement");
  if (rule.earned_position_policy === "rank_and_attendance") bullets.push("Bonus positions earned at select ropings bypass the standings and attendance requirements.");
  else if (rule.earned_position_policy === "rank") bullets.push(rule.minimum_ropings > 0
    ? "Bonus positions earned at select ropings can bypass the standings requirement when the attendance requirement is met."
    : "Bonus positions earned at select ropings bypass the standings requirement.");
  else bullets.push("Bonus positions earned at select ropings do not bypass the qualification requirements.");
  if (rule.bonus_entries_enabled) bullets.push("Bonus positions assigned to a roping are added to its normal entry allowance.");
  return bullets;
}
