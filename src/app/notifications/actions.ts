"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadNotifications } from "@/lib/notification-data";

export async function setNotificationReadState(_previous: { error: string; done: string }, form: FormData) {
  try {
    const scope = form.get("scope") === "roper" ? "roper" : "staff";
    const producer = typeof form.get("producer") === "string" ? String(form.get("producer")) : undefined;
    const requested = JSON.parse(String(form.get("items"))) as { id: string; revision: string }[];
    if (!Array.isArray(requested) || !requested.length || requested.length > 30 || !requested.every(item => typeof item?.id === "string" && typeof item?.revision === "string")) throw new Error("Choose the notifications to update.");
    if (new Set(requested.map(item => item.id)).size !== requested.length) throw new Error("Choose each notification only once.");
    const data = await loadNotifications(scope, producer || undefined);
    if (!data) throw new Error("Sign in with access to these notifications.");
    const available = new Map(data.items.map(item => [item.id, item.revision]));
    if (requested.some(item => available.get(item.id) !== item.revision)) throw new Error("These notifications changed. Refresh before marking them read.");
    const db = await createClient();
    const mode = form.get("mode");
    if (mode !== "read" && mode !== "unread") throw new Error("Choose a valid read status.");
    const result = mode === "read"
      ? await db.from("notification_read_states").upsert(requested.map(item => ({ user_id: data.userId, notification_key: item.id, revision: item.revision, read_at: new Date().toISOString() })), { onConflict: "user_id,notification_key" })
      : await db.from("notification_read_states").delete().eq("user_id", data.userId).in("notification_key", requested.map(item => item.id));
    if (result.error) throw new Error("Unable to save notification status. Try again.");
    revalidatePath("/notifications");
    return { error: "", done: new Date().toISOString() };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update notifications.", done: "" };
  }
}
