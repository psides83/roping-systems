"use server";

import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { rolloverSchema } from "@/lib/season-rollover";
import { nonnegativeMoney } from "@/lib/membership-dues";

export async function startNextSeason(_state: { error?: string; seasonId?: string }, form: FormData): Promise<{ error?: string; seasonId?: string }> {
  const value = (key: string) => String(form.get(key) ?? "");
  const enabled = form.get("duesEnabled") === "on";
  const parsed = rolloverSchema.safeParse({ reference: value("reference"), sourceSeason: value("sourceSeason"), name: value("name"), startsOn: value("startsOn"), endsOn: value("endsOn"),
    duesEnabled: enabled, assessMembers: enabled && form.get("assessMembers") === "on", copyQualifications: form.get("copyQualifications") === "on",
    amountCents: enabled ? nonnegativeMoney(value("amount")) : 0, installments: form.get("installments") === "on",
    allocationMode: value("mode"), allocationValue: enabled ? nonnegativeMoney(value("allocation")) : 0, fundId: enabled && value("fund") ? value("fund") : null });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const producer = await getActiveProducer();
  if (!producer || !["owner", "admin"].includes(producer.role)) return { error: "Owner or administrator access is required." };
  const db = await createClient();
  const input = parsed.data;
  const { data, error } = await db.rpc("rollover_producer_season", { target_producer: producer.id, reference: input.reference, source_season: input.sourceSeason,
    season_name: input.name, starts_on: input.startsOn, ends_on: input.endsOn, dues_enabled: input.duesEnabled, dues_amount: input.amountCents,
    allow_installments: input.installments, allocation_mode: input.allocationMode, allocation_value: input.allocationValue, target_fund: input.fundId,
    assess_members: input.assessMembers, copy_qualifications: input.copyQualifications });
  if (error) return { error: error.message };
  for (const path of ["/settings", "/settings/dues", "/members/dues", "/settings/qualifications", "/reports"]) revalidatePath(path);
  revalidatePath("/public", "layout");
  return { seasonId: data as string };
}
