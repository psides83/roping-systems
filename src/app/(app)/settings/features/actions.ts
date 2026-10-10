"use server";
import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { producerFeatures } from "@/lib/producer-features";
export async function saveFeatures(_state: { message?: string }, form: FormData): Promise<{message?: string}> {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { message: "Owner or administrator access is required." };
  const revision = Number(form.get("revision"));
  if (!Number.isInteger(revision) || revision < 0) return { message: "Refresh before saving." };
  const db = await createClient();
  const { error } = await db.rpc("save_producer_features", { target_producer: producer.id, expected_revision: revision,
    feature_values: Object.fromEntries(producerFeatures.map(({key}) => [key, form.get(key) === "on"])) });
  if (error) return { message: "Unable to save. Refresh the page and try again." };
  revalidatePath("/", "layout");
  return { message: "Feature preferences saved." };
}
