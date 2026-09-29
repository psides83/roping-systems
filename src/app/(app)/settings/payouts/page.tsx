import Link from "next/link";
import { Banknote, CircleDollarSign } from "lucide-react";
import { assignDivisionPayout } from "./actions";
import {
  PayoutScheduleDialog,
  type EditablePayoutSchedule,
} from "@/components/settings/payout-schedule-dialog";
import { PageHeader } from "@/components/ui/page-header";
import { getActiveOrganization } from "@/lib/organizations";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";

async function getPayoutData() {
  if (!isSupabaseConfigured())
    return {
      role: "owner",
      schedules: [
        {
          id: "standard",
          name: "Standard 1 per 10",
          description: "One paid place for each ten entries",
          addedMoneyCents: 0,
          paybackPercent: 65,
          goRoundsPercent: 50,
          aggregatePercent: 50,
          brackets: [
            { minimumEntries: 1, maximumEntries: 10, percentages: [100] },
            { minimumEntries: 11, maximumEntries: 20, percentages: [60, 40] },
            {
              minimumEntries: 21,
              maximumEntries: null,
              percentages: [50, 30, 20],
            },
          ],
        },
      ] satisfies EditablePayoutSchedule[],
      divisions: [{ id: "open", name: "Open", payoutScheduleId: "standard" }],
    };
  const organization = await getActiveOrganization();
  if (!organization)
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
          "id, name, description, default_added_money_cents, payback_basis_points, go_rounds_basis_points, aggregate_basis_points, payout_schedule_brackets(id, minimum_entries, maximum_entries, payout_schedule_places(place_number, percentage_basis_points))",
        )
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("created_at"),
      supabase
        .from("division_templates")
        .select("id, name, payout_schedule_id")
        .eq("organization_id", organization.id)
        .eq("is_active", true)
        .order("sort_order"),
    ]);
  if (error || divisionError)
    throw new Error(
      `Unable to load payout settings: ${error?.message ?? divisionError?.message}`,
    );
  return {
    role: organization.role,
    schedules: (data ?? []).map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      description: schedule.description ?? "",
      addedMoneyCents: schedule.default_added_money_cents,
      paybackPercent: schedule.payback_basis_points / 100,
      goRoundsPercent: schedule.go_rounds_basis_points / 100,
      aggregatePercent: schedule.aggregate_basis_points / 100,
      brackets: (
        schedule.payout_schedule_brackets as unknown as Array<{
          minimum_entries: number;
          maximum_entries: number | null;
          payout_schedule_places: Array<{
            place_number: number;
            percentage_basis_points: number;
          }>;
        }>
      )
        .sort((a, b) => a.minimum_entries - b.minimum_entries)
        .map((bracket) => ({
          minimumEntries: bracket.minimum_entries,
          maximumEntries: bracket.maximum_entries,
          percentages: bracket.payout_schedule_places
            .sort((a, b) => a.place_number - b.place_number)
            .map((place) => place.percentage_basis_points / 100),
        })),
    })),
    divisions: (divisions ?? []).map((division) => ({
      id: division.id,
      name: division.name,
      payoutScheduleId: division.payout_schedule_id,
    })),
  };
}

export default async function PayoutSettingsPage() {
  const data = await getPayoutData();
  const enabled = isSupabaseConfigured() && data.role !== "viewer";
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Organization setup"
        title="Payout structures"
        description="Define how entry counts determine paid places and how each purse is split. Schedules are copied into new ropings to preserve history."
        actions={<PayoutScheduleDialog enabled={enabled} />}
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
          className="px-4 py-3 text-sm font-semibold text-[#66716b]"
        >
          Event templates
        </Link>
        <Link
          href="/settings/payouts"
          className="border-b-2 border-[var(--brand-accent)] px-4 py-3 text-sm font-bold text-[#17201c]"
        >
          Payouts
        </Link>
      </div>
      <section className="rounded-md border border-[#dfe4e1] bg-white">
        <header className="flex items-center gap-3 border-b border-[#e7ebe8] px-5 py-4">
          <Banknote size={19} className="text-[var(--brand-accent-strong)]" />
          <div>
            <h2 className="font-bold">Event template defaults</h2>
            <p className="mt-1 text-xs text-[#758078]">
              Choose the schedule copied when a new roping uses each event
              template
            </p>
          </div>
        </header>
        <div className="divide-y divide-[#edf0ee]">
          {data.divisions.map((division) => (
            <form
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
                <option value="">No payout schedule</option>
                {data.schedules.map((schedule) => (
                  <option key={schedule.id} value={schedule.id}>
                    {schedule.name}
                  </option>
                ))}
              </select>
              <button
                disabled={!enabled}
                className="h-10 rounded-md border border-[#ccd4d0] px-4 text-xs font-semibold disabled:opacity-50"
              >
                Save
              </button>
            </form>
          ))}
          {!data.divisions.length ? (
            <p className="px-5 py-7 text-sm text-[#758078]">
              Create an event template before assigning payout defaults.
            </p>
          ) : null}
        </div>
      </section>
      <section className="space-y-4">
        {data.schedules.map((schedule) => (
          <article
            key={schedule.id}
            className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white"
          >
            <header className="flex flex-col gap-3 border-b border-[#e7ebe8] p-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CircleDollarSign size={18} className="text-[#758078]" />
                  <h2 className="font-bold">{schedule.name}</h2>
                </div>
                <p className="mt-2 text-sm text-[#66716b]">
                  {schedule.description || "No description"}
                </p>
                {schedule.addedMoneyCents ? (
                  <p className="mt-2 text-xs font-bold text-emerald-700">
                    Includes {formatCurrency(schedule.addedMoneyCents)} default
                    added money
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-semibold text-[#66716b]">
                  {schedule.paybackPercent}% payback ·{" "}
                  {schedule.goRoundsPercent}% across go-rounds ·{" "}
                  {schedule.aggregatePercent}% aggregate
                </p>
              </div>
              <PayoutScheduleDialog schedule={schedule} enabled={enabled} />
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-left">
                <thead className="bg-[#f7f8f7] text-[10px] font-bold uppercase text-[#758078]">
                  <tr>
                    <th className="px-5 py-3">Entries</th>
                    <th className="px-5 py-3">Places paid</th>
                    <th className="px-5 py-3">Purse split</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0ee]">
                  {schedule.brackets.map((bracket) => (
                    <tr
                      key={`${bracket.minimumEntries}-${bracket.maximumEntries}`}
                    >
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
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        ))}
        {!data.schedules.length ? (
          <div className="rounded-md border border-dashed border-[#cbd2ce] bg-white p-10 text-center">
            <p className="font-semibold">Create the first payout schedule</p>
            <p className="mt-2 text-sm text-[#758078]">
              Start with the organization&apos;s most common places-paid table.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
