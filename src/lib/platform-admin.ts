export const accountStatuses = {
  pending: "Pending approval",
  setup: "Setup in progress",
  active: "Active",
  suspended: "Suspended",
  archived: "Archived",
} as const;
export type AccountStatus = keyof typeof accountStatuses;
export const onboardingTasks = {
  owner: "Primary administrator has accepted access",
  divisions: "Divisions and classifications reviewed",
  templates: "Roping templates reviewed",
  payouts: "Payout schedules reviewed",
  season: "Season dates established",
  records: "Member records or imports reviewed",
  launch: "Public pages and launch reviewed",
} as const;
export function accountAvailable(status: string) {
  return status === "setup" || status === "active";
}
export function directoryFilters(values: Record<string, string | string[] | undefined>) {
  const q = typeof values.q === "string" ? values.q.trim().slice(0, 100) : "";
  const status = typeof values.status === "string" && Object.hasOwn(accountStatuses, values.status) ? values.status : "";
  const page = typeof values.page === "string" && /^\d+$/.test(values.page) ? Math.min(100000, Math.max(1, Number(values.page))) : 1;
  return { q, status, page };
}
export interface PlatformContact {
  id: string; name: string; email: string | null; phone: string | null;
  responsibility: string; is_primary: boolean; archived_at: string | null;
}
export interface PlatformDirectory {
  total: number; counts: Partial<Record<AccountStatus, number>> | null;
  rows: Array<{ id: string; name: string; slug: string; status: AccountStatus; contact_name: string | null; contact_email: string | null; contact_phone: string | null; next_action: string; follow_up_on: string | null; completed_tasks: number }>;
}
export interface PlatformDetail {
  producer: { id: string; name: string; slug: string; timezone: string; created_at: string; updated_at: string };
  account: { status: AccountStatus; next_action: string; follow_up_on: string | null; approved_at: string | null; updated_at: string };
  contacts: PlatformContact[];
  tasks: Array<{ task_key: keyof typeof onboardingTasks; completed_at: string | null }>;
  notes: Array<{ id: string; body: string; author: string | null; created_at: string }>;
  history: Array<{ id: string; action: string; reason: string | null; created_at: string; actor: string | null; details: Record<string, unknown> }>;
  staff: Array<{ name: string | null; email: string; role: string }>;
  invitations: Array<{ email: string; role: string; expires_at: string; email_status: string; expired?: boolean }>;
  setup: { divisions: number; classifications: number; templates: number; payouts: number; seasons: number; members: number };
}
