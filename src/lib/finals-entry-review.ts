import { meetsFinalsEntryRequirements, type EarnedPositionPolicy } from "./finals-entry-eligibility";

export interface FinalsReviewRequirements {
  topPlaces: number | null;
  minimumRopings: number;
  earnedPositionPolicy: EarnedPositionPolicy;
  requirementMatch?: "all" | "any";
}

export function reviewFinalsEntry(
  row: { rank: number; ropingsEntered: number; finalsPositions?: number } | undefined,
  requirements: FinalsReviewRequirements | null,
  normalEntries: number | null,
  bonusEnabled: boolean,
  acceptedEntries: number,
) {
  const qualified = !!requirements && meetsFinalsEntryRequirements(row, requirements);
  const earned = row?.finalsPositions ?? 0;
  const bonus = qualified && bonusEnabled && normalEntries !== null ? earned : 0;
  const allowance = normalEntries === null ? null : normalEntries + bonus;
  const remaining = !qualified ? 0 : allowance === null ? null : Math.max(0, allowance - acceptedEntries);
  const reasons: string[] = [];
  if (!requirements) reasons.push("Qualification setup needs review");
  else if (!row) reasons.push("No qualifying standings or earned positions");
  else {
    const policy = earned > 0 ? requirements.earnedPositionPolicy : "none";
    if (!qualified && policy === "none" && requirements.topPlaces !== null && row.rank > requirements.topPlaces) reasons.push(`Outside top ${requirements.topPlaces}`);
    if (!qualified && policy !== "rank_and_attendance" && row.ropingsEntered < requirements.minimumRopings) reasons.push(`${requirements.minimumRopings - row.ropingsEntered} more ropings needed`);
  }
  const overAllowance = allowance !== null && acceptedEntries > allowance;
  const needsReview = acceptedEntries > 0 && (!qualified || overAllowance);
  return { qualified, bonus, allowance, remaining, reasons, overAllowance, needsReview };
}

export function qualificationCheckIsCurrent(
  check: { source_revision: number | string; rule_updated_at: string },
  revision: number | string,
  ruleUpdatedAt: string | undefined,
) {
  return ruleUpdatedAt !== undefined && String(check.source_revision) === String(revision)
    && new Date(check.rule_updated_at).getTime() === new Date(ruleUpdatedAt).getTime();
}
