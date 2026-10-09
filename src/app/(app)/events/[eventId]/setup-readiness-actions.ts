"use server";

import { z } from "zod";
import { getActiveProducer } from "@/lib/producers";
import { eventStaffAccess } from "@/lib/staff-access";
import { createClient } from "@/lib/supabase/server";
import { payoutScheduleIssues } from "@/lib/payout-schedule-validation";
import { setupReadiness, type SetupIssue } from "@/lib/events/setup-readiness";
import type { FourDSettings } from "@/types/domain";
import { ropingDisplayName } from "@/lib/events/roping-display-name";

export async function getSetupReadiness(eventId: string, mode: "publish" | "start"): Promise<{ issues?: SetupIssue[]; message?: string }> {
  if (!z.uuid().safeParse(eventId).success || !["publish", "start"].includes(mode)) return { message: "Choose a valid event." };
  try {
    const producer = await getActiveProducer();
    if (!producer || !await eventStaffAccess(eventId, "can_manage_event")) return { message: "Event management access is required." };
    const db = await createClient();
    const event = await db.from("events").select("starts_at, ends_at").eq("id", eventId).eq("producer_id", producer.id).single();
    const ropings = await db.from("event_ropings").select("id,name,divisions!roping_division_discipline_same_organization(name),scheduled_date,arena_name,sort_order,schedule_type,starts_at,short_round_enabled,competition_format,four_d_settings").eq("event_id", eventId).eq("producer_id", producer.id).order("sort_order");
    const plans = await db.from("event_roping_payout_plans").select("id,event_roping_id,name,pool_type,go_rounds_basis_points,aggregate_basis_points,short_round_basis_points,event_roping_payout_brackets(stage_type,minimum_entries,maximum_entries,event_roping_payout_places(place_number,percentage_basis_points))").eq("event_id", eventId).eq("producer_id", producer.id);
    const reviews = await db.rpc("get_event_template_reviews", { target_event_id: eventId });
    if (event.error || ropings.error || plans.error || reviews.error) throw new Error("Unable to check the event setup. Refresh and try again.");
    const day = (value: string) => new Intl.DateTimeFormat("en-CA", { timeZone: producer.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
    const rows = (ropings.data ?? []).map((roping) => {
      const ownPlans = (plans.data ?? []).filter((plan) => plan.event_roping_id === roping.id);
      return {
        id: roping.id, name: ropingDisplayName(roping.name, (roping.divisions as unknown as { name: string } | null)?.name ?? ""), date: roping.scheduled_date, arena: roping.arena_name,
        order: roping.sort_order, schedule: roping.schedule_type, startsAt: roping.starts_at,
        hasMainPayout: ownPlans.some((plan) => plan.pool_type === "main"),
        payoutIssues: ownPlans.flatMap((plan) => payoutScheduleIssues({
          goRoundsPercent: plan.go_rounds_basis_points / 100, aggregatePercent: plan.aggregate_basis_points / 100,
          shortRoundPercent: plan.short_round_basis_points / 100, shortRoundEnabled: plan.short_round_basis_points > 0 && roping.short_round_enabled,
          competitionFormat: roping.competition_format, fourDSettings: roping.four_d_settings as FourDSettings | null,
          bracketsByStage: {
            go_round: brackets(plan, "go_round"), aggregate: brackets(plan, "aggregate"), short_round: brackets(plan, "short_round"),
          },
        }).map((issue) => `${plan.name}: ${issue}`)),
      };
      function brackets(plan: (typeof ownPlans)[number], stage: string) {
        return plan.event_roping_payout_brackets.filter((bracket) => bracket.stage_type === stage).map((bracket) => ({
          minimumEntries: bracket.minimum_entries, maximumEntries: bracket.maximum_entries,
          percentages: [...bracket.event_roping_payout_places].sort((a, b) => a.place_number - b.place_number).map((place) => place.percentage_basis_points / 100),
        }));
      }
    });
    return { issues: setupReadiness(eventId, mode, { first: day(event.data!.starts_at), last: day(event.data!.ends_at ?? event.data!.starts_at) }, rows, reviews.data ?? []) };
  } catch (error) { return { message: error instanceof Error ? error.message : "Unable to check setup. Please retry." }; }
}
