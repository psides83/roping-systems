"use client";

import { PersistentForm } from "@/components/ui/persistent-form";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Mail, LoaderCircle } from "lucide-react";
import { setNotificationReadState } from "@/app/notifications/actions";
import type { NotificationScope } from "@/lib/notifications";

export function NotificationReadButton({ items, scope, producerId, read = false, page = false }: {
  items: { id: string; revision: string }[]; scope: NotificationScope; producerId?: string; read?: boolean; page?: boolean;
}) {
  const [state, action, pending] = useActionState(setNotificationReadState, { error: "", done: "" });
  const router = useRouter();
  useEffect(() => {
    if (state.done) { window.dispatchEvent(new Event("notifications-changed")); router.refresh(); }
  }, [state.done, router]);
  return <PersistentForm action={action} className="shrink-0">
    <input type="hidden" name="scope" value={scope} /><input type="hidden" name="producer" value={producerId ?? ""} />
    <input type="hidden" name="items" value={JSON.stringify(items)} /><input type="hidden" name="mode" value={read ? "unread" : "read"} />
    <button disabled={pending || !items.length} title={read ? "Mark unread" : "Mark read"} className="inline-flex h-10 items-center gap-2 rounded-md border border-[#d7ddda] bg-white px-3 text-sm font-semibold disabled:opacity-50">
      {pending ? <LoaderCircle size={16} className="animate-spin" /> : read ? <Mail size={16} /> : <CheckCheck size={16} />}
      {pending ? "Saving..." : page ? "Mark page read" : read ? "Mark unread" : "Mark read"}
    </button>
    {state.error && <p role="alert" className="mt-2 max-w-64 text-sm text-red-700">{state.error}</p>}
  </PersistentForm>;
}
