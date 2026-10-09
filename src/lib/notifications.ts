export const notificationCategories = {
  application: "Applications & entries", watch: "Classification watch", fine: "Unpaid fines",
  bonus: "Bonus positions", entry: "Accepted entries", schedule: "Schedule changes", classification: "Classifications",
} as const;
export type NotificationScope = "staff" | "roper";
export interface NotificationItem {
  id: string; revision: string; category: keyof typeof notificationCategories;
  title: string; body: string; href: string; created_at: string; producerName?: string; read?: boolean;
}
export function notificationPage(items: NotificationItem[], query: { category?: string; status?: string; page?: string }) {
  const filtered = items.filter(item => (!query.category || query.category === "all" || item.category === query.category)
    && (query.status !== "unread" || !item.read));
  filtered.sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id));
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const requested = Number(query.page ?? 1);
  const page = Math.min(pageCount, Number.isInteger(requested) && requested > 0 ? requested : 1);
  return { items: filtered.slice((page - 1) * 30, page * 30), page, pageCount, total: filtered.length,
    unread: items.filter(item => !item.read).length };
}
