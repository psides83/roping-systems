"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getActiveProducer } from "@/lib/producers";
import { createClient } from "@/lib/supabase/server";
import { refreshEventQualificationChecks } from "@/lib/events/qualification-checks";
import type { QualificationRuleSet } from "@/lib/qualification-rule-sets";

export async function loadAvailableQualificationRuleSets() {
  const producer = await getActiveProducer();
  if (!producer) throw new Error("Select a producer.");
  const db = await createClient();
  const result = await db.from("qualification_rule_sets").select("id,name").eq("producer_id", producer.id).order("name");
  if (result.error) throw new Error("Unable to load qualification rules.");
  return result.data as { id: string; name: string }[];
}

export async function loadQualificationAssignment(eventId: string, ropingId?: string) {
  const producer = await getActiveProducer();
  if (!producer || !z.uuid().safeParse(eventId).success || (ropingId && !z.uuid().safeParse(ropingId).success)) throw new Error("Event management access is required.");
  const db = await createClient();
  const scope = await db.rpc("can_manage_event", { target_event: eventId });
  if (scope.error || !scope.data) throw new Error("Management access for this event is required.");
  const event = await db.from("events").select("qualification_rule_set_id").eq("id", eventId).eq("producer_id", producer.id).single();
  if (event.error) throw new Error("Event not found.");
  const roping = ropingId ? await db.from("event_ropings").select("qualification_override,qualification_rule_set_id").eq("id", ropingId).eq("event_id", eventId).eq("producer_id", producer.id).single() : null;
  const rules = await db.from("qualification_rule_sets").select("*").eq("producer_id", producer.id).order("name");
  const previous = ropingId ? await db.from("roping_qualification_checks").select("rule_set_id").eq("event_roping_id", ropingId).eq("producer_id", producer.id).maybeSingle() : null;
  if (rules.error || roping?.error || previous?.error) throw new Error("Unable to load qualification settings.");
  return {
    eventRuleId: event.data.qualification_rule_set_id as string | null,
    mode: roping?.data?.qualification_override ?? (event.data.qualification_rule_set_id ? "custom" : "none"),
    ruleId: (roping ? roping.data?.qualification_rule_set_id : event.data.qualification_rule_set_id) as string | null,
    rules: rules.data as QualificationRuleSet[],
    existingClassRules: !!previous?.data && !previous.data.rule_set_id,
  };
}

export async function saveQualificationAssignment(eventId: string, ropingId: string | null, mode: string, ruleId: string | null) {
  const producer = await getActiveProducer();
  if (!producer || !z.uuid().safeParse(eventId).success
    || (ropingId && !z.uuid().safeParse(ropingId).success) || (ruleId && !z.uuid().safeParse(ruleId).success)
    || !["inherit", "none", "custom"].includes(mode)) return { error: "Choose valid qualification settings." };
  const db = await createClient();
  const result = await db.rpc("save_qualification_assignment", {
    target_event_id: eventId, target_roping_id: ropingId, target_mode: mode, target_rule_set_id: ruleId,
  });
  if (result.error) return { error: result.error.message };
  const refreshError = await refreshEventQualificationChecks(eventId, ropingId ?? undefined);
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/events/${eventId}/entries`);
  revalidatePath("/public", "layout");
  if (refreshError) return { error: `Settings saved. Entry acceptance is blocked until qualification is refreshed: ${refreshError}` };
  return { success: true };
}
