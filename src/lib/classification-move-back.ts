export type MoveBackProgress = {
  assignmentId: string;
  moveAssignmentId: string;
  divisionId: string;
  divisionName: string;
  classificationId: string;
  classificationName: string;
  previousClassificationId: string | null;
  previousClassificationName: string | null;
  effectiveOn: string;
  enabled: boolean;
  hasMove: boolean;
  completedRopings: number;
  requiredRopings: number;
  eligible: boolean;
  exceptionReason: string | null;
  exceptionStaff: string | null;
  participation?: MoveBackParticipation[];
  moveBackTargetIds?: string[];
};

export type MoveBackParticipation = {
  ropingId: string; eventId: string; name: string; eventTitle: string; date: string;
  qualifiedRuns: number; noTimeRuns: number; disqualifiedRuns: number;
};

export type MoveBackException = {
  id: string; divisionName: string; classificationName: string; effectiveOn: string;
  reason: string; staffLabel: string; approvedAt: string; requiredRopings: number; completedRopings: number;
};

export type MoveBackDetails = { progress: MoveBackProgress[]; exceptions: MoveBackException[] };

export function blocksMoveBack(progress: MoveBackProgress | undefined, targetId: string) {
  return Boolean(progress?.enabled && progress.hasMove && !progress.eligible && targetId
    && (progress.moveBackTargetIds?.includes(targetId) || targetId === progress.previousClassificationId));
}

export function moveBackStatus(progress: MoveBackProgress) {
  if (!progress.enabled) return "Off";
  if (!progress.hasMove) return "No prior move";
  if (progress.exceptionReason) return "Staff exception";
  return progress.eligible ? "Eligible for review" : "Waiting";
}

export function isMoveBackTarget(progress: MoveBackProgress, target: { id: string; classificationNumber?: number }, currentNumber?: number) {
  return target.id === progress.previousClassificationId
    || Boolean(currentNumber && target.classificationNumber && target.classificationNumber > currentNumber);
}
