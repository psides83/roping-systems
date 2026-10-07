import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { EntryLabelStyle } from "@/lib/entry-labels";

export interface ActiveProducer {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  brandPrimary: string;
  brandAccent: string;
  entryLabelStyle: EntryLabelStyle;
  role: "owner" | "admin" | "operator" | "viewer";
}

export async function getProducers(): Promise<ActiveProducer[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return [];
  const { data, error } = await supabase
    .from("producer_staff")
    .select("producer_id, role, producers!inner(id, name, slug, timezone, brand_primary, brand_accent, entry_label_style)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error || !data?.length) return [];
  return data.map((membership) => {
    const producer = membership.producers as unknown as { id: string; name: string; slug: string; timezone: string; brand_primary: string; brand_accent: string; entry_label_style: EntryLabelStyle };
    return { id: producer.id, name: producer.name, slug: producer.slug, timezone: producer.timezone, brandPrimary: producer.brand_primary, brandAccent: producer.brand_accent, entryLabelStyle: producer.entry_label_style, role: membership.role as ActiveProducer["role"] };
  });
}

export async function getActiveProducer(): Promise<ActiveProducer | null> {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  const preferredId = cookieStore.get("active_producer_id")?.value;
  const producers = await getProducers();
  if (!producers.length) return null;

  return producers.find((producer) => producer.id === preferredId) ?? producers[0];
}
