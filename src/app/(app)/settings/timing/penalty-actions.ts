"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
const mode = z.enum(["all", "only", "except"]);
const age = z.preprocess((value) => value === "" ? null : value, z.coerce.number().int().min(0).max(120).nullable());
const schema = z.object({ id: z.union([z.uuid(), z.literal("")]), divisionId: z.uuid(), name: z.string().trim().min(1).max(80),
  seconds: z.coerce.number().positive().max(999).multipleOf(0.01), classificationMode: mode, ageMode: mode, minimumAge: age, maximumAge: age });
export async function savePenalty(_state: { error?: string; success?: boolean }, form: FormData): Promise<{ error?: string; success?: boolean }> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Complete the penalty name, seconds and eligibility fields." };
  const ids = form.getAll("classificationId").map(String);
  if (ids.some((id) => !z.uuid().safeParse(id).success)) return { error: "Choose valid classifications." };
  const p = parsed.data;
  if (p.classificationMode !== "all" && !ids.length) return { error: "Select at least one classification." };
  if (p.ageMode !== "all" && p.minimumAge === null && p.maximumAge === null) return { error: "Enter an age limit." };
  if (p.minimumAge !== null && p.maximumAge !== null && p.minimumAge > p.maximumAge) return { error: "The maximum age must not be below the minimum age." };
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return { error: "You cannot edit penalty rules." };
  const db = await createClient();
  const data = { producer_id: producer.id, division_id: p.divisionId, name: p.name, seconds: p.seconds,
    classification_mode: p.classificationMode, classification_ids: p.classificationMode === "all" ? [] : ids,
    age_mode: p.ageMode, minimum_age: p.ageMode === "all" ? null : p.minimumAge, maximum_age: p.ageMode === "all" ? null : p.maximumAge,
    is_active: form.get("active") === "on" };
  const { error } = p.id ? await db.from("producer_penalty_rules").update(data).eq("id", p.id).eq("producer_id", producer.id)
    : await db.from("producer_penalty_rules").insert(data);
  if (error) return { error: error.message };
  revalidatePath("/settings/timing"); revalidatePath("/events", "layout");
  return { success: true };
}
