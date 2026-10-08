import { calculateFinalsQualifications, type FinalsQualificationRule, type QualifierFinish, type ManualFinalsPosition, type FinalsPositionMove, type FinalsQualificationDecision } from "./finals-qualifications";
import { finalsPositionSlots, type FinalsPositionAssignment } from "./finals-position-assignments";

export interface RoperBonusSource {
  memberId: string; producerId: string; today: string;
  season: { id: string; name: string; startsOn: string; endsOn: string } | null;
  seasons: { id: string; name: string }[];
  source: { rules: FinalsQualificationRule[]; finishes: QualifierFinish[]; manual: ManualFinalsPosition[]; moves: FinalsPositionMove[]; decisions: FinalsQualificationDecision[] } | null;
  assignments: FinalsPositionAssignment[];
  classes: Record<string, string>;
  ropings: { id: string; name: string; eventTitle: string; date: string; eventSlug: string; public: boolean }[];
}

export function roperBonusPositions(data: RoperBonusSource) {
  if (!data.source || !data.season) return [];
  const source = data.source;
  // Calculate before filtering: other anonymous competitors affect pass-down and caps.
  const result = calculateFinalsQualifications(source.rules, source.finishes, source.manual, source.moves, source.decisions);
  const awards = result.awards.filter((award) => award.memberId === data.memberId && award.producerId === data.producerId && award.seasonId === data.season!.id);
  return finalsPositionSlots(awards, data.assignments, data.season.endsOn, data.today).map((slot) => ({
    ...slot,
    className: data.classes[slot.classId] ?? "Classification unavailable",
    sourceRoping: data.ropings.find((roping) => roping.id === awards.find((award) => award.id === slot.awardId)?.ropingId),
    targetRoping: data.ropings.find((roping) => roping.id === slot.targetId),
  }));
}
