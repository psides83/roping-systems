import Link from "next/link";
import { Check, CircleDollarSign } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import {
  AddFeeDialog,
  CreateDivisionDialog,
  EditDivisionDialog,
  EditFeeDialog,
  type DivisionOption,
} from "@/components/settings/division-dialogs";
import { divisionTemplates as demoDivisions } from "@/data/demo";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import type {
  DivisionTemplateSummary,
  FeeKind,
  FeeScope,
} from "@/types/domain";

const scopeLabels: Record<FeeScope, string> = {
  entry: "Each entry",
  contestant_division: "Once per template",
  contestant_event: "Once per event",
};

async function getDivisionData(): Promise<{
  divisions: DivisionTemplateSummary[];
  payoutSchedules: Array<{ id: string; name: string }>;
  divisionOptions: DivisionOption[];
  canEdit: boolean;
}> {
  if (!isSupabaseConfigured())
    return {
      divisions: demoDivisions,
      payoutSchedules: [{ id: "standard", name: "Standard 1 per 10" }],
      divisionOptions: [
        {
          id: "calf-roping",
          name: "Calf roping",
          classifications: [
            { id: "open", name: "Open" },
            { id: "115", name: "11.5" },
          ],
        },
      ],
      canEdit: false,
    };
  const organization = await getActiveOrganization();
  if (!organization)
    return {
      divisions: [],
      payoutSchedules: [],
      divisionOptions: [],
      canEdit: false,
    };
  const supabase = await createClient();
  const [
    { data, error },
    { data: schedules, error: scheduleError },
    { data: disciplines, error: disciplineError },
  ] = await Promise.all([
    supabase
      .from("division_templates")
      .select(
        "id, name, description, discipline_id, classification_id, maximum_entries_per_person, allow_guests, timer_count, timer_resolution, payout_schedule_id, is_active, fee_templates!fee_templates_division_template_id_fkey(id, title, amount_cents, scope, kind, payout_schedule_id, is_required, included_in_entry_price, contributes_to_payout, sort_order)",
      )
      .eq("organization_id", organization.id)
      .order("sort_order")
      .order("created_at"),
    supabase
      .from("payout_schedules")
      .select("id, name")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("disciplines")
      .select("id, name, classifications(id, name, is_active)")
      .eq("organization_id", organization.id)
      .eq("is_active", true)
      .order("sort_order"),
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

  return {
    canEdit: organization.role !== "viewer",
    payoutSchedules: schedules ?? [],
    divisionOptions: (disciplines ?? []).map((discipline) => ({
      id: discipline.id,
      name: discipline.name,
      classifications: (
        discipline.classifications as unknown as Array<{
          id: string;
          name: string;
          is_active: boolean;
        }>
      ).filter((classification) => classification.is_active),
    })),
    divisions: data.map((division) => ({
      id: division.id,
      name: division.name,
      description: division.description ?? "",
      maximumEntriesPerPerson: division.maximum_entries_per_person,
      allowGuests: division.allow_guests,
      isActive: division.is_active,
      disciplineId: division.discipline_id,
      classificationId: division.classification_id,
      timerCount: division.timer_count,
      timerResolution: division.timer_resolution,
      payoutScheduleId: division.payout_schedule_id,
      fees: (
        division.fee_templates as unknown as Array<{
          id: string;
          title: string;
          amount_cents: number;
          scope: FeeScope;
          kind: FeeKind;
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
  const { divisions, payoutSchedules, divisionOptions, canEdit } =
    await getDivisionData();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization setup"
        title="Event templates"
        description="Build reusable roping setups from a division and classification. Template rules are copied into new events, where round counts and other event-specific details remain editable."
        actions={
          <CreateDivisionDialog
            configured={configured && canEdit}
            divisions={divisionOptions}
            payoutSchedules={payoutSchedules}
          />
        }
      />
      <div className="flex gap-1 overflow-x-auto border-b border-[#d7ddda]">
        <Link
          href="/settings/classifications"
          className="px-4 py-3 text-sm font-semibold text-[#66716b]"
        >
          Divisions & classifications
        </Link>
        <Link
          href="/settings/divisions"
          className="border-b-2 border-[var(--brand-accent)] px-4 py-3 text-sm font-bold text-[#17201c]"
        >
          Event templates
        </Link>
        <Link
          href="/settings/payouts"
          className="px-4 py-3 text-sm font-semibold text-[#66716b]"
        >
          Payouts
        </Link>
      </div>
      <section className="space-y-4">
        {divisions.map((division) => (
          <article
            key={division.id}
            className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
          >
            <div className="flex items-start gap-3 border-b border-[#e7ebe8] p-5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-lg font-bold">{division.name}</h2>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${division.isActive ? "bg-emerald-50 text-emerald-700" : "bg-[#eef1ef] text-[#66716b]"}`}
                  >
                    <Check size={12} />{" "}
                    {division.isActive ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#66716b]">
                  {division.description || "No description"}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-[#758078]">
                  <span>
                    {division.maximumEntriesPerPerson
                      ? `${division.maximumEntriesPerPerson} per contestant`
                      : "Unlimited entries"}
                  </span>
                  <span>
                    {division.allowGuests ? "Guests allowed" : "Members only"}
                  </span>
                </div>
              </div>
              <EditDivisionDialog
                configured={configured && canEdit}
                divisions={divisionOptions}
                payoutSchedules={payoutSchedules}
                template={division}
              />
            </div>
            <div className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-bold uppercase text-[#66716b]">
                  <CircleDollarSign size={15} /> Fees & entry options
                </p>
                <AddFeeDialog
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
                            {fee.isRequired ? " · Required" : " · Optional"}
                          </td>
                          <td className="py-3 text-sm text-[#66716b]">
                            {fee.includedInEntryPrice
                              ? "Included in entry price"
                              : "Listed separately"}
                          </td>
                          <td className="py-3">
                            <EditFeeDialog
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
          </article>
        ))}
        {!divisions.length ? (
          <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center">
            <p className="font-semibold">Create your first event template</p>
            <p className="mt-2 text-sm text-[#758078]">
              Event templates hold reusable settings for one division and
              classification combination.
            </p>
          </div>
        ) : null}
      </section>
      <div className="rounded-md border border-dashed border-[#cbd2ce] p-5 text-center">
        <p className="text-sm font-semibold">
          Event templates are organization-specific
        </p>
        <p className="mt-1 text-xs text-[#758078]">
          Changes here become defaults for new ropings and do not alter past
          events.
        </p>
      </div>
    </div>
  );
}
