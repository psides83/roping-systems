"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import type { ProducerSettingsState } from "./actions";

const schema = z.object({
  id: z.union([z.literal(""), z.uuid()]),
  name: z.string().trim().min(1, "Enter a season name.").max(80),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
}).refine((season) => season.endsOn >= season.startsOn, { message: "The end date must be on or after the start date.", path: ["endsOn"] });

async function context() {
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return null;
  return { producer, supabase: await createClient() };
}

export async function saveProducerSeason(_state: ProducerSettingsState, form: FormData): Promise<ProducerSettingsState> {
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const manager = await context();
  if (!manager) return { message: "Owner or administrator access is required." };
  const values = { name: parsed.data.name, starts_on: parsed.data.startsOn, ends_on: parsed.data.endsOn };
  const query = parsed.data.id
    ? manager.supabase.from("producer_seasons").update(values).eq("producer_id", manager.producer.id).eq("id", parsed.data.id)
    : manager.supabase.from("producer_seasons").insert({ ...values, producer_id: manager.producer.id });
  const { data, error } = await query.select("id").maybeSingle();
  if (error) return { message: error.message };
  if (!data) return { message: "That season is no longer available." };
  revalidatePath("/settings");
  revalidatePath(`/public/${manager.producer.slug}`);
  return { success: true, message: "Season saved." };
}

export async function deleteProducerSeason(id: string): Promise<ProducerSettingsState> {
  if (!z.uuid().safeParse(id).success) return { message: "Choose a valid season." };
  const manager = await context();
  if (!manager) return { message: "Owner or administrator access is required." };
  const { error } = await manager.supabase.from("producer_seasons").delete().eq("id", id).eq("producer_id", manager.producer.id);
  if (error) return { message: error.message };
  revalidatePath("/settings");
  revalidatePath(`/public/${manager.producer.slug}`);
  return { success: true };
}
