import type { FinalsPositionAward } from "./finals-qualifications";

export interface FinalsPositionAssignment {
  id: string;
  award_key: string;
  position_number: number;
  event_roping_id: string | null;
  assigned_class_key: string;
  assigned_at: string | null;
  reason: string;
}
export interface FinalsPositionSlot {
  awardId: string;
  number: number;
  memberId: string;
  classId: string;
  source: "finish" | "manual";
  targetId: string | null;
  status: "pending" | "assigned" | "expired" | "needs_review";
  assignment?: FinalsPositionAssignment;
}

export function finalsPositionSlots(awards: FinalsPositionAward[], assignments: FinalsPositionAssignment[], seasonEndsOn: string, today: string) {
  const assigned = new Map(assignments.map((item) => [`${item.award_key}:${item.position_number}`, item]));
  return awards.filter((award) => !award.revoked).flatMap((award) => Array.from({ length: award.positions }, (_, index): FinalsPositionSlot => {
    const number = index + 1;
    const assignment = assigned.get(`${award.id}:${number}`);
    const targetId = assignment?.event_roping_id ?? null;
    return { awardId: award.id, number, memberId: award.memberId, classId: award.classId, source: award.source, targetId, assignment,
      status: targetId ? assignment!.assigned_class_key === award.classId ? "assigned" : "needs_review" : today > seasonEndsOn ? "expired" : "pending" };
  }));
}

export function assignedFinalsTotals(slots: FinalsPositionSlot[], targetId: string) {
  const totals = new Map<string, { memberId: string; classId: string; positions: number }>();
  for (const slot of slots) if (slot.status === "assigned" && slot.targetId === targetId) {
    const key = `${slot.memberId}:${slot.classId}`;
    const row = totals.get(key) ?? { memberId: slot.memberId, classId: slot.classId, positions: 0 };
    row.positions++;
    totals.set(key, row);
  }
  return [...totals.values()];
}
