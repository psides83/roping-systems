import Link from "next/link";
import { ArrowUpRight, Bell } from "lucide-react";
import { NotificationReadButton } from "./read-button";
import { notificationCategories, type NotificationItem, type NotificationScope } from "@/lib/notifications";

export function NotificationList({ items, scope, producerId, timezone }: { items: NotificationItem[]; scope: NotificationScope; producerId?: string; timezone: string }) {
  const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone });
  if (!items.length) return <div className="flex items-start gap-3 border-y border-[#dfe4e1] py-10"><Bell size={22} className="text-[#66716b]" /><div><h2 className="font-semibold">No notifications in this view</h2><p className="mt-1 text-sm text-[#66716b]">New notices will appear here as activity occurs.</p></div></div>;
  return <ul className="divide-y divide-[#dfe4e1] border-y border-[#dfe4e1]">{items.map(item => <li key={`${item.id}:${item.revision}:${item.read}`} className={`flex flex-wrap items-start justify-between gap-4 py-5 ${!item.read ? "border-l-2 border-[var(--brand-accent,#bb3e24)] pl-3" : ""}`}>
    <div className="min-w-0 flex-1 basis-64"><p className="flex flex-wrap gap-x-2 gap-y-1 text-xs text-[#66716b]">{!item.read && <strong className="text-[var(--brand-accent-strong,#92301c)]">Unread</strong>}<span>{notificationCategories[item.category]}</span>{item.producerName && <span>· {item.producerName}</span>}</p>
      <Link href={item.href} className="mt-2 inline-flex max-w-full items-start gap-2 text-base font-semibold hover:underline"><span className="break-words">{item.title}</span><ArrowUpRight size={16} className="mt-1 shrink-0" /></Link>
      <p className="mt-1 break-words text-sm leading-6 text-[#66716b]">{item.body}</p><time dateTime={item.created_at} className="mt-2 block text-xs text-[#66716b]">{date.format(new Date(item.created_at))}</time>
    </div><NotificationReadButton items={[{ id: item.id, revision: item.revision }]} scope={scope} producerId={producerId} read={item.read} />
  </li>)}</ul>;
}
