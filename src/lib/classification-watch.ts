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
  rule_snapshot: Pick<WatchRule, "name" | "threshold_seconds" | "inclusive" | "time_basis" | "review_count" | "proposed_classification_id">;
  memberships: { ropers: { first_name: string; last_name: string } };
  event_ropings: { name: string };
};

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
