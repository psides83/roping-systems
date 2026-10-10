import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { ProducerFeatures } from "./producer-features";

export const getProducerFeatures = cache(async (producerId: string): Promise<ProducerFeatures> => {
  if (!isSupabaseConfigured()) return {};
  const db = await createClient();
  const { data, error } = await db.from("producer_feature_preferences").select("features").eq("producer_id", producerId).maybeSingle();
  if (error) throw new Error("Unable to load producer feature preferences.");
  return data?.features ?? {};
});

export const getPublicProducerFeatures = cache(async (slug: string): Promise<ProducerFeatures> => {
  if (!isSupabaseConfigured()) return {};
  const db = await createClient();
  const { data, error } = await db.rpc("public_producer_features", { producer_slug: slug });
  if (error) throw new Error("Unable to load public page preferences.");
  return data ?? {};
});
