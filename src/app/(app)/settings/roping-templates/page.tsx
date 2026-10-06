import { Check, ChevronDown, CircleDollarSign } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { RopingSetupTabs } from "@/components/settings/roping-setup-tabs";
import {
  AddFeeDialog,
  CreateDivisionDialog,
  DuplicateDivisionButton,
  EditDivisionDialog,
  EditFeeDialog,
  type DivisionOption,
  type ClassificationOption,
} from "@/components/settings/division-dialogs";
import { divisionTemplates as demoDivisions } from "@/data/demo";
import { getActiveProducer } from "@/lib/producers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type {
  CompetitionFormat,
  DivisionTemplateSummary,
  FeeKind,
  FeeScope,
  RoundOrderMethod,
} from "@/types/domain";

const scopeLabels: Record<FeeScope, string> = {
  entry: "Each entry",
  contestant_division: "Once per template",
  contestant_event: "Once per event",
};

const roundOrderLabels: Record<RoundOrderMethod, string> = {
  reverse_first: "reverse first-round order",
  aggregate_slowest_to_fastest: "slowest aggregate to fastest",
  custom: "custom order",
};

async function getDivisionData(): Promise<{
  divisions: DivisionTemplateSummary[];
  payoutSchedules: Array<{
    id: string;
    name: string;
    competitionFormat: "standard" | "four_d";
  }>;
  divisionOptions: DivisionOption[];
  classificationOptions: ClassificationOption[];
  canEdit: boolean;
  funds: { id: string; name: string }[];
}> {
  if (!isSupabaseConfigured())
    return {
      divisions: demoDivisions.map((division) => ({
        ...division,
        numberOfRuns: division.numberOfRuns ?? 1,
        cattleDrawEnabled: division.cattleDrawEnabled ?? false,
        secondRoundOrdering: division.secondRoundOrdering ?? "reverse_first",
        laterRoundOrdering:
          division.laterRoundOrdering ?? "aggregate_slowest_to_fastest",
      })),
      payoutSchedules: [
        {
          id: "standard",
          name: "Standard 1 per 10",
          competitionFormat: "standard",
        },
      ],
      divisionOptions: [
        {
          id: "calf-roping",
          name: "Calf roping",
        },
      ],
      classificationOptions: [],
      canEdit: false,
      funds: [],
    };
  const producer = await getActiveProducer();
  if (!producer)
    return {
      divisions: [],
      payoutSchedules: [],
      divisionOptions: [],
      classificationOptions: [],
      canEdit: false,
      funds: [],
    };
  const supabase = await createClient();
  const [
    { data, error },
    { data: schedules, error: scheduleError },
    { data: divisions, error: disciplineError },
    { data: classifications, error: classificationError },
  ] = await Promise.all([
    supabase
      .from("roping_templates")
      .select(
        "id, name, description, division_id, main_round_count, cattle_draw_enabled, max_entries_per_roper, minimum_positions_between_entries, allow_non_members, timer_count, timer_resolution, competition_format, handicap_rules, second_round_ordering, later_round_ordering, payout_schedule_id, short_round_enabled, short_round_tie_policy, short_round_brackets, is_active, divisions(name), roping_template_fees(id, title, amount_cents, scope, kind, fund_tracking, destination_fund_id, payout_schedule_id, is_required, included_in_entry_price, contributes_to_payout, sort_order)",
      )
      .eq("producer_id", producer.id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("payout_schedules")
      .select("id, name, competition_format")
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("divisions")
      .select("id, name")
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("classifications")
      .select("id, name, division_id, handicap_time_credit_seconds:handicap_adjustment_seconds")
      .eq("producer_id", producer.id)
      .eq("is_active", true)
      .order("rank", { ascending: false }),
  ]);
  if (error)
    throw new Error(`Unable to load division settings: ${error.message}`);
  if (scheduleError)
    throw new Error(
      `Unable to load payout schedules: ${scheduleError.message}`,
    );
  if (disciplineError)
    throw new Error(
      `Unable to load divisions and classifications: ${disciplineError.message}`,
    );
  if (classificationError)
    throw new Error(
      `Unable to load member classifications: ${classificationError.message}`,
    );

  const { data: funds, error: fundError } = await supabase.from("producer_funds").select("id,name").eq("producer_id",producer.id).eq("is_active",true).order("name");
  if (fundError) throw new Error(`Unable to load funds: ${fundError.message}`);
  return {
    canEdit: producer.role !== "viewer",
    funds: funds ?? [],
    payoutSchedules: (schedules ?? []).map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      competitionFormat: schedule.competition_format as "standard" | "four_d",
    })),
    divisionOptions: divisions ?? [],
    classificationOptions: (classifications ?? []).map((classification) => ({
      id: classification.id,
      name: classification.name,
      disciplineId: classification.division_id,
      handicapAdjustmentSeconds:
        classification.handicap_time_credit_seconds === null
          ? null
          : -Number(classification.handicap_time_credit_seconds),
    })),
    divisions: data.map((division) => ({
      id: division.id,
      name: division.name,
      description: division.description ?? "",
      maximumEntriesPerPerson: division.max_entries_per_roper,
      minimumRunsBetweenEntries: division.minimum_positions_between_entries,
      numberOfRuns: division.main_round_count,
      cattleDrawEnabled: division.cattle_draw_enabled,
      allowGuests: division.allow_non_members,
      isActive: division.is_active,
      disciplineId: division.division_id,
      divisionName: (division.divisions as unknown as { name: string }).name,
      timerCount: division.timer_count,
      timerResolution: division.timer_resolution,
      competitionFormat: division.competition_format as CompetitionFormat,
      handicapRules: Object.fromEntries(
        (
          (division.handicap_rules ?? []) as Array<{
            classificationId: string;
            adjustmentSeconds: number;
          }>
        ).map((rule) => [
          rule.classificationId,
          Number(rule.adjustmentSeconds),
        ]),
      ),
      secondRoundOrdering: division.second_round_ordering as RoundOrderMethod,
      laterRoundOrdering: division.later_round_ordering as RoundOrderMethod,
      payoutScheduleId: division.payout_schedule_id,
      shortRoundEnabled: division.short_round_enabled,
      shortRoundTiePolicy: division.short_round_tie_policy as
        | "advance_all"
        | "fastest_last_round",
      shortRoundBrackets: division.short_round_brackets as Array<{
        minimumEntries: number;
        maximumEntries: number | null;
        comebackCount: number;
      }>,
      fees: (
        division.roping_template_fees as unknown as Array<{
          id: string;
          title: string;
          amount_cents: number;
          scope: FeeScope;
          kind: FeeKind;
          fund_tracking: "general" | "classification" | null;
          destination_fund_id: string | null;
          payout_schedule_id: string | null;
          is_required: boolean;
          included_in_entry_price: boolean;
          contributes_to_payout: boolean;
          sort_order: number;
        }>
      )
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((fee) => ({
          id: fee.id,
          title: fee.title,
          amountCents: fee.amount_cents,
          scope: fee.scope,
          kind: fee.kind,
          fundTracking: fee.fund_tracking,
          destinationFundId: fee.destination_fund_id,
          payoutScheduleId: fee.payout_schedule_id,
          isRequired: fee.is_required,
          includedInEntryPrice: fee.included_in_entry_price,
          contributesToPayout: fee.contributes_to_payout,
        })),
    })),
  };
}

export default async function DivisionSettingsPage() {
  const configured = isSupabaseConfigured();
  const {
    divisions,
    payoutSchedules,
    divisionOptions,
    classificationOptions,
    canEdit,
    funds,
  } = await getDivisionData();
  const templateGroups = new Map<string, { name: string; templates: DivisionTemplateSummary[] }>();
  for (const division of divisionOptions) {
    templateGroups.set(division.id, { name: division.name, templates: [] });
  }
  for (const template of divisions) {
    const key = template.disciplineId ?? template.divisionName ?? "unassigned";
    const group = templateGroups.get(key) ?? { name: template.divisionName || "Unassigned division", templates: [] };
    group.templates.push(template);
    templateGroups.set(key, group);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Producer setup"
        title="Roping templates"
        description="Build reusable format templates for each division. Choose the classification and schedule when adding each actual roping to an event."
        actions={
          <CreateDivisionDialog
            configured={configured && canEdit}
            divisions={divisionOptions}
            payoutSchedules={payoutSchedules}
            classifications={classificationOptions}
          />
        }
      />
      <RopingSetupTabs active="templates" />
      <section className="space-y-4">
        {Array.from(templateGroups, ([id, group]) => group.templates.length ? (
          <section key={id} className="space-y-4">
            <header className="flex flex-wrap items-baseline gap-3 border-b border-[#dfe4e1] pb-3">
              <h2 className="text-lg font-bold">{group.name}</h2>
              <span className="text-xs font-medium text-[#66716b]">
                {group.templates.length} {group.templates.length === 1 ? "template" : "templates"}
              </span>
            </header>
        {group.templates.map((division) => (
          <article
            key={division.id}
            className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
          >
            <div className="flex items-start gap-3 border-b border-[#e7ebe8] p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-base font-bold">{division.name}</h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${division.isActive ? "bg-emerald-50 text-emerald-700" : "bg-[#eef1ef] text-[#66716b]"}`}
                  >
                    <Check size={12} />{" "}
                    {division.isActive ? "Active" : "Inactive"}
                  </span>
                  <span className="rounded-full bg-[#eef1ef] px-2.5 py-1 text-xs font-semibold text-[#56615b]">
                    {division.competitionFormat === "four_d"
                      ? "4D"
                      : division.competitionFormat === "handicap"
                        ? "Handicap"
                        : "Standard"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#66716b]">
                  {division.description || "No description"}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#758078]">
                  <span>
                    {division.numberOfRuns}{" "}
                    {division.numberOfRuns === 1 ? "round" : "rounds"}
                  </span>
                  <span>
                    {division.cattleDrawEnabled
                      ? "Drawn cattle"
                      : "Cattle run in order"}
                  </span>
                  <span>
                    {division.maximumEntriesPerPerson
                      ? `${division.maximumEntriesPerPerson} per contestant`
                      : "Unlimited entries"}
                  </span>
                  <span>
                    {division.allowGuests ? "Guests allowed" : "Members only"}
                  </span>
                  <span>
                    {division.minimumRunsBetweenEntries
                      ? `${division.minimumRunsBetweenEntries} runs between repeat entries`
                      : "No repeat-entry spacing"}
                  </span>
                  <span>
                    R2: {roundOrderLabels[division.secondRoundOrdering!]}
                  </span>
                  <span>
                    R3+: {roundOrderLabels[division.laterRoundOrdering!]}
                  </span>
                  <span>
                    {division.shortRoundEnabled
                      ? `Short round · ${division.shortRoundBrackets?.length ?? 0} comeback ${division.shortRoundBrackets?.length === 1 ? "range" : "ranges"}`
                      : "No short round"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <DuplicateDivisionButton
                  configured={configured && canEdit}
                  template={division}
                />
                <EditDivisionDialog
                  configured={configured && canEdit}
                  divisions={divisionOptions}
                  payoutSchedules={payoutSchedules}
                  classifications={classificationOptions}
                  template={division}
                />
              </div>
            </div>
            <details className="group/fees">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-5 text-xs font-bold uppercase text-[#66716b] outline-none hover:bg-[#f7f8f7] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-accent)] [&::-webkit-details-marker]:hidden">
                  <CircleDollarSign size={15} /> Fees & entry options
                <span className="ml-auto text-xs font-medium normal-case">
                  {division.fees.length} {division.fees.length === 1 ? "item" : "items"}
                </span>
                <ChevronDown size={16} className="shrink-0 transition-transform group-open/fees:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="px-5 pb-5">
              <div className="mb-3 flex justify-end">
                <AddFeeDialog
                  funds={funds}
                  divisionId={division.id}
                  divisionName={division.name}
                  configured={configured && canEdit}
                  payoutSchedules={payoutSchedules}
                />
              </div>
              {division.fees.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[700px] text-left">
                    <thead className="text-[10px] font-bold uppercase text-[#8a938e]">
                      <tr>
                        <th className="pb-2">Fee or option</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Applied</th>
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Display</th>
                        <th className="w-10 pb-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf0ee]">
                      {division.fees.map((fee) => (
                        <tr key={fee.id}>
                          <td className="py-3 text-sm font-semibold">
                            {fee.title}
                          </td>
                          <td className="py-3 text-sm">
                            {formatCurrency(fee.amountCents)}
                          </td>
                          <td className="py-3 text-sm text-[#66716b]">
                            {scopeLabels[fee.scope]}
                          </td>
                          <td className="py-3 text-sm capitalize text-[#66716b]">
                            {(fee.kind ?? "standard").replace("_", " ")}
                            {fee.isRequired !== false
                              ? " · Required"
                              : " · Optional"}
                            {fee.kind === "added_money" ? <span className="mt-1 block text-xs normal-case">{fee.fundTracking === "classification" ? "Classification fund" : "General fund"}</span> : null}
                          </td>
                          <td className="py-3 text-sm text-[#66716b]">
                            {fee.includedInEntryPrice
                              ? "Included in entry price"
                              : "Listed separately"}
                          </td>
                          <td className="py-3">
                            <EditFeeDialog
                              funds={funds}
                              divisionId={division.id}
                              divisionName={division.name}
                              configured={configured && canEdit}
                              payoutSchedules={payoutSchedules}
                              fee={fee}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-md bg-[#f7f8f7] px-4 py-3 text-sm text-[#66716b]">
                  No default fees or options yet.
                </p>
              )}
              </div>
            </details>
          </article>
        ))}
          </section>
        ) : null)}
        {!divisions.length ? (
          <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center">
            <p className="font-semibold">Create your first roping template</p>
            <p className="mt-2 text-sm text-[#758078]">
              Roping templates hold reusable format settings for one division.
              Classifications are selected when scheduling an event.
            </p>
          </div>
        ) : null}
      </section>
      <div className="rounded-md border border-dashed border-[#cbd2ce] p-5 text-center">
        <p className="text-sm font-semibold">
          Roping templates are producer-specific
        </p>
        <p className="mt-1 text-xs text-[#758078]">
          Changes here become defaults for new events and do not alter past
          events.
        </p>
      </div>
    </div>
  );
}
