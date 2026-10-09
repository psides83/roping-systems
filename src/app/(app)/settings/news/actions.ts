"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { rulesDocumentSchema, rulesPublishErrors } from "@/lib/producer-rules";
import { createClient } from "@/lib/supabase/server";

export async function saveBulletin(id: string, input: unknown, revision: number, operation: "save" | "publish" | "unpublish" | "delete") {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "Owner or administrator access is required." };
  if (!z.uuid().safeParse(id).success || !Number.isInteger(revision) || revision < 0 || !["save", "publish", "unpublish", "delete"].includes(operation)) return { error: "Invalid bulletin action." };
  const parsed = rulesDocumentSchema.safeParse(input);
  if (["save", "publish"].includes(operation) && !parsed.success) return { error: parsed.error!.issues[0].message };
  if (operation === "publish" && parsed.success) {
    const errors = rulesPublishErrors(parsed.data);
    if (!parsed.data.effectiveOn) errors.push("Choose a bulletin date before publishing.");
    if (errors.length) return { error: errors.join(" ") };
  }
  const client = await createClient();
  const { data, error } = await client.rpc("save_producer_bulletins", { target_producer: producer.id, bulletin_id: id, expected_revision: revision, document: parsed.success ? parsed.data : null, operation });
  if (error) return { error: error.message };
  revalidatePath("/settings/news", "layout");
  revalidatePath(`/public/${producer.slug}/news`);
  return { revision: data as number };
}
