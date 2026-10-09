import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getActiveProducer } from "@/lib/producers";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { loadFinalsQualifications } from "@/lib/events/finals-qualification-data";
import { loadFinalsAssignments } from "@/lib/events/finals-assignment-data";
import { finalsPositionSlots } from "@/lib/finals-position-assignments";
import { staffBonusNotification, roperBonusNotifications } from "@/lib/notification-bonus";
import type { RoperBonusSource } from "@/lib/roper-bonus-positions";
import type { NotificationItem, NotificationScope } from "@/lib/notifications";

export async function loadNotifications(scope: NotificationScope, producerId?: string) {
  const db = await createClient();
  const auth = await db.auth.getClaims();
  const userId = auth.data?.claims?.sub;
  if (typeof userId !== "string") return null;
  const producer = await getActiveProducer();
  if (scope === "staff" && (!producer || (producerId && producerId !== producer.id))) return null;
  let items: NotificationItem[] = [];
  if (scope === "staff" && producer) {
    items = await readAllRows<NotificationItem>((first, last) => db.rpc("staff_notification_items", { target_producer: producer.id }).order("created_at", { ascending: false }).order("id").range(first, last), "Unable to load staff notifications");
    if (producer.role !== "viewer") {
      const seasons = await readAllRows<{ id: string; name: string; starts_on: string; ends_on: string }>((first, last) => db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("id").range(first, last), "Unable to load notification seasons");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      for (const season of seasons) {
        const results = await loadFinalsQualifications(producer.slug, season.id);
        const assignments = await loadFinalsAssignments(producer.id, season.id);
        items.push(...staffBonusNotification(producer.id, season, finalsPositionSlots(results.awards, assignments, season.ends_on, today), results.issues));
      }
    }
    items = items.map(item => ({ ...item, producerName: producer.name }));
  } else {
    const notices = await readAllRows<{ id: string; producer_id: string; category: NotificationItem["category"]; title: string; body: string; href: string; created_at: string }>((first, last) => db.from("in_app_notifications").select("id,producer_id,category,title,body,href,created_at").order("created_at", { ascending: false }).order("id").range(first, last), "Unable to load your notifications");
    const memberships = await db.rpc("my_notification_memberships");
    if (memberships.error) throw new Error("Unable to load notification memberships.");
    const linked = memberships.data as { id: string; producer_id: string; producer_name: string; producer_slug: string }[];
    items = notices.map(item => ({ ...item, id: `notice:${item.id}`, revision: item.created_at, producerName: linked.find(member => member.producer_id === item.producer_id)?.producer_name }));
    for (const member of linked) {
      const result = await db.rpc("my_roper_bonus_positions", { target_membership_id: member.id });
      if (result.error) throw new Error("Unable to load qualification notifications.");
      items.push(...roperBonusNotifications(result.data as RoperBonusSource, member.producer_slug).map(item => ({ ...item, producerName: member.producer_name })));
    }
  }
  const reads = await readAllRows<{ notification_key: string; revision: string }>((first, last) => db.from("notification_read_states").select("notification_key,revision").eq("user_id", userId).order("notification_key").range(first, last), "Unable to load notification read status");
  const seen = new Map(reads.map(row => [row.notification_key, row.revision]));
  items = items.map(item => {
    const revision = createHash("sha256").update(item.revision).digest("hex");
    return { ...item, revision, read: seen.get(item.id) === revision };
  });
  return { userId, scope, producer, items };
}
