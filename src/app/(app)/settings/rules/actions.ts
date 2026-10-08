"use server";

import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { rulesDocumentSchema, rulesPublishErrors } from "@/lib/producer-rules";
import { createClient } from "@/lib/supabase/server";

export async function saveRules(input: unknown, revision: number, operation: "save" | "publish" | "unpublish") {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "Owner or administrator access is required." };
  if (!["save", "publish", "unpublish"].includes(operation) || !Number.isInteger(revision) || revision < 0) return { error: "Invalid rules action." };
  const parsed = rulesDocumentSchema.safeParse(input);
  if (!parsed.success && operation !== "unpublish") return { error: parsed.error.issues[0].message };
  if (operation === "publish") {
    const errors = rulesPublishErrors(parsed.data!);
    if (errors.length) return { error: errors.join(" ") };
  }
  const client = await createClient();
  const { data, error } = await client.rpc("save_producer_rules", { target_producer: producer.id, expected_revision: revision, document: parsed.success ? parsed.data : null, operation });
  if (error) return { error: error.message };
  revalidatePath("/settings/rules");
  revalidatePath(`/public/${producer.slug}/rules`);
  return { revision: data as number };
}
