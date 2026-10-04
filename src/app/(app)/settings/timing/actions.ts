"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";

const timingSchema = z.object({
  divisionId: z.uuid(),
  timerCount: z.coerce.number().int().min(1).max(10),
  timerResolution: z.enum(["average", "best", "longest"]),
});

export async function updateDivisionTiming(formData: FormData) {
  const parsed = timingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const producer = await getActiveProducer();
  if (!producer || producer.role === "viewer") return;
  const supabase = await createClient();
  await supabase
    .from("roping_templates")
    .update({
      timer_count: parsed.data.timerCount,
      timer_resolution: parsed.data.timerResolution,
    })
    .eq("id", parsed.data.divisionId)
    .eq("producer_id", producer.id);
  revalidatePath("/settings/timing");
  revalidatePath("/settings/roping-templates");
}
