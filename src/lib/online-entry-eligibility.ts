export interface OnlineEntryEligibility {
  event_roping_id: string;
  status: "eligible" | "review" | "restricted";
  messages: string[];
  remaining_entries: number | null;
}

export const eligibilityLabels = {
  eligible: "Eligibility checks passed",
  review: "Producer review needed",
  restricted: "Entry restriction",
} as const;
