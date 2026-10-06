export type WatchRule = {
  id: string;
  name: string;
  division_id: string;
  classification_id: string;
  threshold_seconds: number;
  inclusive: boolean;
  time_basis: "raw" | "final";
  review_count: number;
  proposed_classification_id: string | null;
  is_active: boolean;
};

export type RunFlag = {
  id: string;
  membership_id: string;
  division_id: string;
  assignment_id: string | null;
  rule_id: string | null;
  event_id: string;
  event_roping_id: string;
  round_number: number;
  occurred_on: string;
  measured_seconds: number;
  is_active: boolean;
  reviewed_at: string | null;
  review_reason: string | null;
  cleared_reason: string | null;
  review?: {
    id: string;
    current_classification_id: string | null;
    proposed_classification_id: string | null;
    review_on: string;
    decision_staff_label: string | null;
  } | null;
  rule_snapshot: Pick<WatchRule, "name" | "threshold_seconds" | "inclusive" | "time_basis" | "review_count" | "proposed_classification_id">;
  memberships: { ropers: { first_name: string; last_name: string } };
  event_ropings: { name: string };
};

export type WatchClassificationChoice = { id: string; name: string; division_id: string; is_active: boolean };
export type WatchCurrentAssignment = { id: string; membership_id: string; division_id: string; classification_id: string; effective_on: string };

export function watchMoveOptions(flag: RunFlag, classes: WatchClassificationChoice[], assignments: WatchCurrentAssignment[]) {
  const current = assignments.find((a) => a.membership_id === flag.membership_id && a.division_id === flag.division_id);
  const choices = classes.filter((c) => c.division_id === flag.division_id && c.is_active && c.id !== current?.classification_id);
  return { current, choices, canApprove: Boolean(current && current.id === flag.assignment_id && choices.length) };
}

export function groupWatchFlags(flags: RunFlag[]) {
  const groups = new Map<string, RunFlag[]>();
  for (const flag of flags) {
    if (!flag.is_active || flag.reviewed_at) continue;
    const key = `${flag.membership_id}:${flag.division_id}:${flag.assignment_id ?? "unclassified"}:${flag.rule_id}`;
    const group = groups.get(key) ?? [];
    group.push(flag);
    groups.set(key, group);
  }
  return [...groups.values()].map((runs) => ({
    runs,
    reviewDue: runs.length >= Number(runs[0].rule_snapshot.review_count),
  }));
}
