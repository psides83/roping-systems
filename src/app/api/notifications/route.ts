import { loadNotifications } from "@/lib/notification-data";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const data = await loadNotifications(params.get("scope") === "roper" ? "roper" : "staff", params.get("producer") || undefined);
    if (!data) return Response.json({ error: "Sign-in or access required" }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    return Response.json({ unread: data.items.filter(item => !item.read).length }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return Response.json({ error: "Notifications are temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
