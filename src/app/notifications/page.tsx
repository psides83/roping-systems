import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getActiveProducer } from "@/lib/producers";
import { getBrandStyle } from "@/lib/branding";
import { loadNotifications } from "@/lib/notification-data";
import { notificationCategories, notificationPage } from "@/lib/notifications";
import { NotificationList } from "@/components/notifications/notification-list";
import { NotificationReadButton } from "@/components/notifications/read-button";
import { PageHeader } from "@/components/ui/page-header";

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const query = await searchParams;
  const value = (key: string) => typeof query[key] === "string" ? query[key] as string : undefined;
  const db = await createClient();
  const auth = await db.auth.getClaims();
  if (!auth.data?.claims) redirect("/auth/login");
  const active = await getActiveProducer();
  const scope = value("scope") === "roper" || !active ? "roper" : "staff";
  const data = await loadNotifications(scope, value("producer"));
  if (!data) notFound();
  const page = notificationPage(data.items, { category: value("category"), status: value("status"), page: value("page") });
  const unreadPage = page.items.filter(item => !item.read).map(item => ({ id: item.id, revision: item.revision }));
  const link = (number: number) => { const params = new URLSearchParams({ scope, page: String(number), category: value("category") ?? "all", status: value("status") ?? "all" }); if (scope === "staff" && active) params.set("producer", active.id); return `/notifications?${params}`; };
  return <main style={scope === "staff" && active ? getBrandStyle(active.brandPrimary, active.brandAccent) : undefined} className="min-h-screen bg-[#f5f6f7] text-[#17201c]">
    <header className="border-b border-[#dfe4e1] bg-white"><div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6"><Link href={scope === "staff" ? "/dashboard" : "/roper"} className="inline-flex items-center gap-2 text-sm font-semibold"><ArrowLeft size={16} />{scope === "staff" ? "Producer dashboard" : "Roper portal"}</Link><span className="text-sm text-[#66716b]">{scope === "staff" ? active?.name : "My notifications"}</span></div></header>
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader title="Notifications" eyebrow={scope === "staff" ? "Staff inbox" : "Roper inbox"} description={`${page.unread} unread ${page.unread === 1 ? "notification" : "notifications"}`} actions={<NotificationReadButton key={`${scope}:${page.page}:${page.unread}`} items={unreadPage} scope={scope} producerId={scope === "staff" ? active?.id : undefined} page />} />
      {active && <nav aria-label="Notification inbox" className="flex gap-5 text-sm font-semibold"><Link href={`/notifications?scope=staff&producer=${active.id}`} aria-current={scope === "staff" ? "page" : undefined} className={scope === "staff" ? "border-b-2 border-[var(--brand-accent,#bb3e24)] pb-2" : "pb-2 text-[#66716b]"}>Staff</Link><Link href="/notifications?scope=roper" aria-current={scope === "roper" ? "page" : undefined} className={scope === "roper" ? "border-b-2 border-[var(--brand-accent,#bb3e24)] pb-2" : "pb-2 text-[#66716b]"}>My roper notices</Link></nav>}
      <form className="flex flex-wrap items-end gap-3"><input type="hidden" name="scope" value={scope} />{scope === "staff" && active && <input type="hidden" name="producer" value={active.id} />}
        <label className="grid gap-1 text-sm font-semibold">Status<select name="status" defaultValue={value("status") ?? "all"} className="h-10 rounded-md border bg-white pl-3 pr-9"><option value="all">All notices</option><option value="unread">Unread</option></select></label>
        <label className="grid gap-1 text-sm font-semibold">Type<select name="category" defaultValue={value("category") ?? "all"} className="h-10 max-w-full rounded-md border bg-white pl-3 pr-9"><option value="all">All types</option>{Object.entries(notificationCategories).filter(([key]) => data.items.some(item => item.category === key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <button className="h-10 rounded-md border bg-white px-3 text-sm font-semibold">Filter</button>
      </form>
      <NotificationList items={page.items} scope={scope} producerId={scope === "staff" ? active?.id : undefined} timezone={active?.timezone ?? "America/Chicago"} />
      <nav aria-label="Notification pages" className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{page.total} notices · Page {page.page} of {page.pageCount}</span><div className="flex gap-4">{page.page > 1 && <Link href={link(page.page - 1)} className="font-semibold underline">Previous</Link>}{page.page < page.pageCount && <Link href={link(page.page + 1)} className="font-semibold underline">Next</Link>}</div></nav>
    </div>
  </main>;
}
