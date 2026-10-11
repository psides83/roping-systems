export const healthFilters = {
  followup: "Follow-ups due",
  approval: "Pending approval",
  setup: "Incomplete onboarding",
  contact: "Missing primary contact",
  suspended: "Suspended accounts",
} as const;

export function healthQuery(values: Record<string, string | string[] | undefined>) {
  const filter = typeof values.filter === "string" && Object.hasOwn(healthFilters, values.filter) ? values.filter : "";
  const page = typeof values.page === "string" && /^\d+$/.test(values.page) ? Math.min(100000, Math.max(1, Number(values.page))) : 1;
  return { filter, page };
}

export interface PlatformHealth {
  today: string;
  total: number;
  counts: Record<keyof typeof healthFilters | "events", number>;
  accounts: Array<{ id: string; name: string; status: "pending" | "setup" | "active" | "suspended"; next_action: string; follow_up_on: string | null; reviewed: number; has_contact: boolean; due_followup: boolean | null; needs_approval: boolean; needs_setup: boolean; needs_contact: boolean; last_change_at: string | null }>;
  events: Array<{ id: string; title: string; slug: string; producer_id: string; producer_name: string; producer_slug: string; timezone: string; starts_at: string; ends_at: string | null; status: string; publication_state: string; is_public: boolean }>;
  recent: Array<{ id: string; name: string; last_change_at: string }>;
}
