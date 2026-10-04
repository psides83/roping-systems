export type ReviewValue = null | boolean | number | string | ReviewValue[] | { [key: string]: ReviewValue };

export interface TemplateReview {
  ropingId: string;
  templateName: string;
  token: string;
  dismissed: boolean | null;
  entryCount: number;
  blockedReason: string | null;
  changes: Array<{ section: string; current: ReviewValue; template: ReviewValue }>;
}

const labels: Record<string, string> = {
  format: "Roping format", fees: "Fees", short_round: "Short round", handicap: "Handicap adjustments",
  payouts: "Payout schedules", four_d: "4-D rules", description: "Description",
  main_round_count: "Main rounds", max_entries_per_roper: "Entries per contestant",
  allow_non_members: "Non-member entries", timer_count: "Timers", timer_resolution: "Timer method",
  minimum_positions_between_entries: "Minimum draw spacing", competition_format: "Format",
  second_round_ordering: "Second-round order", later_round_ordering: "Later-round order",
  cattle_draw_enabled: "Drawn cattle", contributes_to_payout: "Main purse contribution",
  included_in_entry_price: "Included in entry price", is_required: "Required", amount_cents: "Fee",
  scope: "Charged per", kind: "Type", sort_order: "Display order", enabled: "Enabled",
  tie_policy: "Ties", brackets: "Entry brackets", minimumEntries: "Minimum entries",
  maximumEntries: "Maximum entries", comebackCount: "Qualifiers", credit_seconds: "Time adjustment",
  added_money_cents: "Added money", payback_basis_points: "Payback",
  go_rounds_basis_points: "Go-round share", aggregate_basis_points: "Aggregate share",
  short_round_basis_points: "Short-round share", percentage_basis_points: "Share",
  minimum_entries: "Minimum entries", maximum_entries: "Maximum entries", places: "Places",
};
export function reviewLabel(key: string) {
  return labels[key] ?? key.replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase());
}

function display(value: ReviewValue | undefined, key: string): string {
  if (value === undefined) return "Not included";
  if (value === null) return key.includes("maximum") ? "No limit" : "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") {
    if (key.endsWith("_cents")) return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
    if (key.endsWith("_basis_points")) return `${value / 100}%`;
    if (key === "credit_seconds") return `${-value >= 0 ? "+" : ""}${-value} sec`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  const terms: Record<string, string> = { contestant_event: "Contestant / event", contestant_division: "Contestant / roping", entry: "Entry", reverse_first: "Reverse first round", aggregate_slowest_to_fastest: "Slowest aggregate to fastest", advance_all: "Advance all tied contestants" };
  return terms[String(value)] ?? String(value).replaceAll("_", " ");
}

function flatten(value: ReviewValue, prefix = "", key = ""): Map<string, string> {
  const result = new Map<string, string>();
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const obj = item && typeof item === "object" && !Array.isArray(item) ? item : {};
      const name = obj.title ?? obj.classification ?? (obj.minimum_entries !== undefined ? `From ${obj.minimum_entries} entries · ${obj.stage ?? ""}` : obj.minimumEntries !== undefined ? `From ${obj.minimumEntries} entries` : obj.place !== undefined ? `Place ${obj.place}` : `${index + 1}`);
      for (const [path, text] of flatten(item, `${prefix}${prefix ? " · " : ""}${name}`, key)) result.set(path, text);
    });
  } else if (value !== null && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childKey.endsWith("_id") || ["title", "classification", "sort_order"].includes(childKey)) continue;
      for (const [path, text] of flatten(childValue, `${prefix}${prefix ? " · " : ""}${reviewLabel(childKey)}`, childKey)) result.set(path, text);
    }
  } else result.set(prefix || reviewLabel(key), display(value, key));
  return result;
}

export function templateReviewRows(change: TemplateReview["changes"][number]) {
  const before = flatten(change.current, "", change.section);
  const after = flatten(change.template, "", change.section);
  const rows = [...new Set([...before.keys(), ...after.keys()])]
    .filter((key) => before.get(key) !== after.get(key))
    .map((label) => ({ label, current: before.get(label) ?? "Not included", template: after.get(label) ?? "Not included" }));
  return rows.length ? rows : [{ label: "Template source", current: "Previous template settings", template: "Current template settings" }];
}
