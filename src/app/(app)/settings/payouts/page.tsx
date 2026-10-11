import { PersistentForm } from "@/components/ui/persistent-form";
import { Banknote, CircleDollarSign } from "lucide-react";
import { assignDivisionPayout } from "./actions";
import {
  PayoutScheduleDialog,
  type EditablePayoutSchedule,
} from "@/components/settings/payout-schedule-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { payoutScheduleIssues } from "@/lib/payout-schedule-validation";
import { PayoutCsvExport, PayoutSpreadsheetImport } from "@/components/settings/payout-spreadsheet-controls";

function demoBrackets(finalSplit: number[]) {
  return [
    { minimumEntries: 1, maximumEntries: 10, percentages: [100] },
    { minimumEntries: 11, maximumEntries: 20, percentages: [60, 40] },
    { minimumEntries: 21, maximumEntries: null, percentages: finalSplit },
  ];
}

async function getPayoutData() {
  if (!isSupabaseConfigured())
    return {
      role: "owner",
      schedules: [
        {
          id: "standard",
          name: "Standard 1 per 10",
          description: "One paid place for each ten entries",
          paybackPercent: 65,
          goRoundsPercent: 50,
          aggregatePercent: 50,
          shortRoundPercent: 0,
          shortRoundEnabled: false,
          competitionFormat: "standard",
          fourDSettings: null,
          bracketsByStage: {
            go_round: demoBrackets([50, 30, 20]),
            aggregate: demoBrackets([45, 30, 15, 10]),
            short_round: [],
          },
        },
      ] satisfies EditablePayoutSchedule[],
      divisions: [
        {
          id: "open",
          name: "Open",
          payoutScheduleId: "standard",
          competitionFormat: "standard",
        },
      ],
    };
  const producer = await getActiveProducer();
  if (!producer)
    return {
      role: "viewer",
      schedules: [] as EditablePayoutSchedule[],
      divisions: [],
    };
  const supabase = await createClient();
  const [{ data, error }, { data: divisions, error: divisionError }] =
    await Promise.all([
      supabase
        .from("payout_schedules")
        .select(
          "id, name, description, payback_basis_points, go_rounds_basis_points, aggregate_basis_points, short_round_basis_points, short_round_enabled, competition_format, four_d_settings, payout_schedule_brackets(id, stage_type, minimum_entries, maximum_entries, payout_schedule_places(place_number, percentage_basis_points))",
        )
        .eq("producer_id", producer.id)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("roping_templates")
        .select("id, name, payout_schedule_id, competition_format")
        .eq("producer_id", producer.id)
        .eq("is_active", true)
        .order("sort_order"),
    ]);
  if (error || divisionError)
    throw new Error(
      `Unable to load payout settings: ${error?.message ?? divisionError?.message}`,
    );
  return {
    role: producer.role,
    schedules: (data ?? []).map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      description: schedule.description ?? "",
      paybackPercent: schedule.payback_basis_points / 100,
      goRoundsPercent: schedule.go_rounds_basis_points / 100,
      aggregatePercent: schedule.aggregate_basis_points / 100,
      shortRoundPercent: schedule.short_round_basis_points / 100,
      shortRoundEnabled: schedule.short_round_enabled,
      competitionFormat: schedule.competition_format as "standard" | "four_d",
      fourDSettings: schedule.four_d_settings,
      bracketsByStage: Object.fromEntries(
        (["go_round", "aggregate", "short_round"] as const).map((stage) => [
          stage,
          (
            schedule.payout_schedule_brackets as unknown as Array<{
              stage_type: string;
              minimum_entries: number;
              maximum_entries: number | null;
              payout_schedule_places: Array<{
                place_number: number;
                percentage_basis_points: number;
              }>;
            }>
          )
            .filter((bracket) => bracket.stage_type === stage)
            .sort((a, b) => a.minimum_entries - b.minimum_entries)
            .map((bracket) => ({
              minimumEntries: bracket.minimum_entries,
              maximumEntries: bracket.maximum_entries,
              percentages: bracket.payout_schedule_places
                .sort((a, b) => a.place_number - b.place_number)
                .map((place) => place.percentage_basis_points / 100),
            })),
        ]),
      ) as EditablePayoutSchedule["bracketsByStage"],
    })),
    divisions: (divisions ?? []).map((division) => ({
      id: division.id,
      name: division.name,
      payoutScheduleId: division.payout_schedule_id,
      competitionFormat: division.competition_format as
        | "standard"
        | "handicap"
        | "four_d",
    })),
  };
}

export default async function PayoutSettingsPage() {
  const data = await getPayoutData();
  const enabled = isSupabaseConfigured() && data.role !== "viewer";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Producer setup"
        title="Payout structures"
        description="Define how entry counts determine paid places and how each purse is split. Schedules are copied into new events to preserve history."
        actions={<div className="flex flex-wrap gap-2"><PayoutSpreadsheetImport enabled={enabled} /><PayoutScheduleDialog enabled={enabled} /></div>}
      />
      <RopingSetupTabs active="payouts" />
      <section className="rounded-md border border-[#dfe4e1] bg-white">
        <header className="flex items-center gap-3 border-b border-[#e7ebe8] px-5 py-4">
          <Banknote size={19} className="text-[var(--brand-accent-strong)]" />
          <div>
            <h2 className="font-bold">Roping template defaults</h2>
            <p className="mt-1 text-xs text-[#758078]">
              Choose the schedule copied when a new roping uses each event
              template
            </p>
          </div>
        </header>
        <div className="divide-y divide-[#edf0ee]">
          {data.divisions.map((division) => (
            <PersistentForm
              action={assignDivisionPayout}
              key={division.id}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
            >
              <input type="hidden" name="divisionId" value={division.id} />
              <label className="min-w-0 flex-1 text-sm font-bold">
                {division.name}
              </label>
              <select
                name="scheduleId"
                defaultValue={division.payoutScheduleId ?? ""}
                disabled={!enabled}
                className="h-10 min-w-64 rounded-md border border-[#ccd4d0] bg-white px-3 text-sm"
              >
                {division.competitionFormat !== "four_d" ? (
                  <option value="">No payout schedule</option>
                ) : null}
                {data.schedules
                  .filter(
                    (schedule) =>
                      schedule.competitionFormat ===
                      (division.competitionFormat === "four_d"
                        ? "four_d"
                        : "standard"),
                  )
                  .map((schedule) => (
                    <option key={schedule.id} value={schedule.id} disabled={payoutScheduleIssues(schedule).length > 0}>
                      {schedule.name}{payoutScheduleIssues(schedule).length ? " · Incomplete" : ""}
                    </option>
                  ))}
              </select>
              <button
                disabled={!enabled}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-xs font-semibold disabled:opacity-50"
              >
                Save
              </button>
            </PersistentForm>
          ))}
          {!data.divisions.length ? (
            <p className="px-5 py-7 text-sm text-[#758078]">
              Create a roping template before assigning payout defaults.
            </p>
          ) : null}
        </div>
      </section>
      <section className="space-y-4">
        {data.schedules.map((schedule) => (
          <CollapsibleCard
            key={schedule.id}
            actions={
              <div className="flex flex-wrap gap-2"><PayoutCsvExport schedule={schedule} /><PayoutScheduleDialog schedule={schedule} enabled={enabled} /></div>
            }
            summary={
              <>
                <div className="flex items-center gap-2">
                  <CircleDollarSign size={18} className="text-[#758078]" />
                  <h2 className="font-bold">{schedule.name}</h2>
                  {payoutScheduleIssues(schedule).length ? (
                    <span title={payoutScheduleIssues(schedule).join("\n")} className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-900">Incomplete</span>
                  ) : null}
                  {schedule.competitionFormat === "four_d" ? (
                    <span className="rounded bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase text-sky-800">
                      4D breakaway
                    </span>
                  ) : null}
                </div>
                <p className="mt-2 text-sm text-[#66716b]">
                  {schedule.description || "No description"}
                </p>
                {payoutScheduleIssues(schedule).length ? <p className="mt-2 text-xs text-amber-900">{payoutScheduleIssues(schedule).join(" ")}</p> : null}
                <p className="mt-2 text-xs font-semibold text-[#66716b]">
                  {schedule.paybackPercent}% payback ·{" "}
                  {schedule.goRoundsPercent}% across go-rounds ·{" "}
                  {schedule.aggregatePercent}% aggregate
                  {schedule.shortRoundPercent
                    ? ` · ${schedule.shortRoundPercent}% short round`
                    : ""}
                </p>
              </>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-left">
                <thead className="bg-[#f7f8f7] text-[10px] font-bold uppercase text-[#758078]">
                  <tr>
                    <th className="px-5 py-3">Stage</th>
                    <th className="px-5 py-3">Entries</th>
                    <th className="px-5 py-3">Places paid</th>
                    <th className="px-5 py-3">Purse split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ee]">
                  {(schedule.shortRoundEnabled
                    ? (["go_round", "aggregate", "short_round"] as const)
                    : (["go_round", "aggregate"] as const)
                  ).flatMap((stage) =>
                    schedule.bracketsByStage[stage].map((bracket) => (
                      <tr
                        key={`${stage}-${bracket.minimumEntries}-${bracket.maximumEntries}`}
                      >
                        <td className="px-5 py-3 text-xs font-bold uppercase text-[#66716b]">
                          {stage === "go_round"
                            ? "Go-round"
                            : stage === "short_round"
                              ? "Short round"
                              : "Aggregate"}
                        </td>
                        <td className="px-5 py-3 text-sm font-semibold">
                          {bracket.minimumEntries}
                          {bracket.maximumEntries
                            ? `–${bracket.maximumEntries}`
                            : "+"}
                        </td>
                        <td className="px-5 py-3 text-sm">
                          {bracket.percentages.length}
                        </td>
                        <td className="px-5 py-3 text-sm text-[#66716b]">
                          {bracket.percentages
                            .map(
                              (percentage, index) =>
                                `${index + 1}${index === 0 ? "st" : index === 1 ? "nd" : index === 2 ? "rd" : "th"} ${percentage}%`,
                            )
                            .join(" · ")}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          </CollapsibleCard>
        ))}
        {!data.schedules.length ? (
          <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center">
            <p className="font-semibold">Create the first payout schedule</p>
            <p className="mt-2 text-sm text-[#758078]">
              Start with the producer&apos;s most common places-paid table.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
