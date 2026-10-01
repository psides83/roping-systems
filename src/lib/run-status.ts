export type RunStatus =
  | "pending"
  | "complete"
  | "no_time"
  | "disqualified"
  | "scratch"
  | "turned_out"
  | "rerun";

export const runStatusLabels: Record<RunStatus, string> = {
  pending: "Pending",
  complete: "Qualified time",
  no_time: "No time",
  disqualified: "Disqualified",
  scratch: "Scratched",
  turned_out: "Turned out",
  rerun: "Rerun required",
};

export const runStatusAbbreviations: Record<RunStatus, string> = {
  pending: "-",
  complete: "",
  no_time: "NT",
  disqualified: "DQ",
  scratch: "SCR",
  turned_out: "TO",
  rerun: "RERUN",
};

export function isResolvedRunStatus(status: RunStatus) {
  return status !== "pending" && status !== "rerun";
}
