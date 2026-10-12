import { onboardingTasks, type PlatformDirectory } from "./platform-admin";

export const onboardingViews = { pending: "Awaiting approval", setup: "Setup in progress", active: "Active producers", all: "All accounts" } as const;
export function onboardingWorkspaceFilters(values: Record<string, string | string[] | undefined>) {
  const view = typeof values.view === "string" && Object.hasOwn(onboardingViews, values.view) ? values.view as keyof typeof onboardingViews : "setup";
  const q = typeof values.q === "string" ? values.q.trim().slice(0, 100) : "";
  const page = typeof values.page === "string" && /^\d+$/.test(values.page) ? Math.max(1, Math.min(100000, Number(values.page))) : 1;
  return { view, q, page };
}
export function onboardingNextAction(row: PlatformDirectory["rows"][number]) {
  if (row.status === "archived" || row.status === "suspended") return { label: "Review account status", tab: "account" };
  if (!row.contact_name) return { label: "Record primary contact", tab: "contacts" };
  if (row.status === "pending") return { label: "Review account approval", tab: "account" };
  if (row.status === "active") return { label: "View launch review", tab: "onboarding" };
  if (row.completed_tasks >= Object.keys(onboardingTasks).length) return { label: "Review activation", tab: "account" };
  return { label: "Continue setup review", tab: "onboarding" };
}
