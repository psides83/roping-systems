import "server-only";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { payoutScheduleIssues } from "@/lib/payout-schedule-validation";
import { producerSetupChecklist, type ProducerSetupSnapshot } from "@/lib/producer-setup";
import { seasonCalendarDate } from "@/lib/seasons";
import type { FourDSettings } from "@/types/domain";

export async function loadProducerSetup() {
  const configured = isSupabaseConfigured();
  const producer = configured ? await getActiveProducer() : null;
  if (configured && !producer) throw new Error("Select a producer before reviewing setup.");
  const today = seasonCalendarDate(new Date().toISOString(), producer?.timezone ?? "America/Chicago")!;
  const empty: ProducerSetupSnapshot = { today, divisions: [], classifications: [], templates: [], schedules: [], seasons: [], dues: null, funds: [], qualifications: [] };
  if (!producer) return { name: "Producer setup preview", role: "viewer", timezone: "America/Chicago", configured, checkedAt: new Date().toISOString(), items: producerSetupChecklist(empty) };
  const db = await createClient();
  const [divisions, classifications, templates, schedules, seasons, funds, qualifications, dues] = await Promise.all([
    readAllRows((first, last) => db.from("divisions").select("id,name,is_active").eq("producer_id", producer.id).order("id").range(first, last), "Unable to check divisions"),
    readAllRows((first, last) => db.from("classifications").select("id,division_id,is_active,standalone_enabled,handicap_adjustment_seconds").eq("producer_id", producer.id).order("id").range(first, last), "Unable to check classifications"),
    readAllRows((first, last) => db.from("roping_templates").select("id,name,division_id,is_active,competition_format,payout_schedule_id,short_round_enabled,handicap_rules,roping_template_fees(title,kind,contributes_to_payout,payout_schedule_id,destination_fund_id)").eq("producer_id", producer.id).order("id").range(first, last), "Unable to check templates"),
    readAllRows((first, last) => db.from("payout_schedules").select("id,name,is_active,competition_format,go_rounds_basis_points,aggregate_basis_points,short_round_basis_points,short_round_enabled,four_d_settings,payout_schedule_brackets(stage_type,minimum_entries,maximum_entries,payout_schedule_places(place_number,percentage_basis_points))").eq("producer_id", producer.id).order("id").range(first, last), "Unable to check payout schedules"),
    readAllRows((first, last) => db.from("producer_seasons").select("id,name,starts_on,ends_on").eq("producer_id", producer.id).order("id").range(first, last), "Unable to check seasons"),
    readAllRows((first, last) => db.from("producer_funds").select("id,name,is_active").eq("producer_id", producer.id).order("id").range(first, last), "Unable to check destination funds"),
    readAllRows((first, last) => db.from("qualification_rule_sets").select("id,name,season_id,cutoff_on,attendance_cutoff_on").eq("producer_id", producer.id).order("id").range(first, last), "Unable to check qualifications"),
    db.from("producer_dues_settings").select("amount_cents,allocation_value,installments,fund_id").eq("producer_id", producer.id).maybeSingle(),
  ]);
  if (dues.error) throw new Error("Unable to check membership dues settings.");
  const snapshot: ProducerSetupSnapshot = {
    today,
    divisions: divisions.map((item) => ({ id: item.id, name: item.name, active: item.is_active })),
    classifications: classifications.map((item) => ({ id: item.id, divisionId: item.division_id, active: item.is_active, standalone: item.standalone_enabled, adjustment: item.handicap_adjustment_seconds === null ? null : Number(item.handicap_adjustment_seconds) })),
    templates: templates.map((item) => ({ id: item.id, name: item.name, divisionId: item.division_id, active: item.is_active, format: item.competition_format, scheduleId: item.payout_schedule_id, shortRound: item.short_round_enabled,
      handicapIds: ((item.handicap_rules ?? []) as { classificationId: string }[]).map((rule) => rule.classificationId),
      fees: item.roping_template_fees.map((fee) => ({ title: fee.title, kind: fee.kind, contributes: fee.contributes_to_payout, scheduleId: fee.payout_schedule_id, fundId: fee.destination_fund_id })),
    })),
    schedules: schedules.map((item) => {
      const brackets = (stage: string) => item.payout_schedule_brackets.filter((bracket) => bracket.stage_type === stage).map((bracket) => ({
        minimumEntries: bracket.minimum_entries, maximumEntries: bracket.maximum_entries,
        percentages: [...bracket.payout_schedule_places].sort((a, b) => a.place_number - b.place_number).map((place) => place.percentage_basis_points / 100),
      }));
      return { id: item.id, name: item.name, active: item.is_active, format: item.competition_format, shortRound: item.short_round_enabled,
        issues: payoutScheduleIssues({ goRoundsPercent: item.go_rounds_basis_points / 100, aggregatePercent: item.aggregate_basis_points / 100, shortRoundPercent: item.short_round_basis_points / 100,
          shortRoundEnabled: item.short_round_enabled, competitionFormat: item.competition_format, fourDSettings: item.four_d_settings as FourDSettings | null,
          bracketsByStage: { go_round: brackets("go_round"), aggregate: brackets("aggregate"), short_round: brackets("short_round") },
        }),
      };
    }),
    seasons: seasons.map((item) => ({ id: item.id, name: item.name, first: item.starts_on, last: item.ends_on })),
    dues: dues.data ? { amount: Number(dues.data.amount_cents), allocation: Number(dues.data.allocation_value), installments: dues.data.installments, fundId: dues.data.fund_id } : null,
    funds: funds.map((item) => ({ id: item.id, name: item.name, active: item.is_active })),
    qualifications: qualifications.map((item) => ({ id: item.id, name: item.name, seasonId: item.season_id, standingsCutoff: item.cutoff_on, attendanceCutoff: item.attendance_cutoff_on })),
  };
  return { name: producer.name, role: producer.role, timezone: producer.timezone, configured, checkedAt: new Date().toISOString(), items: producerSetupChecklist(snapshot) };
}
