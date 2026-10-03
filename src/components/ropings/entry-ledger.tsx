"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronDown, LoaderCircle, Search, ShieldAlert } from "lucide-react";
import {
  updateContestantPayment,
  type PaymentFormState,
} from "@/app/(app)/ropings/[ropingId]/entries/actions";
import {
  EntryTransferDialog,
  type TransferDivision,
} from "@/components/ropings/entry-transfer-dialog";
import {
  EntryOptionsDialog,
  type EntryOptionChoice,
} from "@/components/ropings/entry-options-dialog";
import { ChargeWaiverDialog } from "@/components/ropings/charge-waiver-dialog";
import { EntryWithdrawalDialog } from "@/components/ropings/entry-withdrawal-dialog";
import { ContestantCheckInButton } from "@/components/ropings/contestant-check-in-button";
import { formatCurrency } from "@/lib/utils";
import { formatFinalTimeAdjustment } from "@/lib/scoring";

type PaymentStatus = "unpaid" | "paid_cash" | "comped" | "refunded";
type PaymentSummary = PaymentStatus | "mixed";

export interface LedgerContestant {
  personId: string;
  name: string;
  memberNumber: string | null;
  paymentStatus: PaymentSummary;
  totalCents: number;
  checkedIn: boolean;
  checkedInAt: string | null;
  entries: Array<{
    id: string;
    divisionId: string;
    division: string;
    entryNumber: number;
    source: string;
    paymentStatus: PaymentStatus;
    incentiveAdjustment: number;
    transferNote: string | null;
    eligibilityOverridden: boolean;
    eligibilityIssue: string | null;
    eligibilityOverrideReason: string | null;
    options: EntryOptionChoice[];
    competitionStatus: "active" | "withdrawn";
    withdrawalReason: string | null;
  }>;
  charges: Array<{
    id: string;
    title: string;
    amountCents: number;
    waived: boolean;
    waiverReason: string | null;
  }>;
}

const paymentLabels: Record<PaymentSummary, string> = {
  unpaid: "Unpaid",
  paid_cash: "Paid cash",
  comped: "Comped",
  refunded: "Refunded",
  mixed: "Mixed",
};

const paymentStyles: Record<PaymentSummary, string> = {
  unpaid: "bg-amber-50 text-amber-800",
  paid_cash: "bg-emerald-50 text-emerald-700",
  comped: "bg-sky-50 text-sky-700",
  refunded: "bg-rose-50 text-rose-700",
  mixed: "bg-[#eef1ef] text-[#59645e]",
};

export function EntryLedger({
  ropingId,
  contestants,
  divisions,
  canEdit,
}: {
  ropingId: string;
  contestants: LedgerContestant[];
  divisions: TransferDivision[];
  canEdit: boolean;
}) {
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [checkInFilter, setCheckInFilter] = useState("all");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contestants.filter((contestant) => {
      const matchesPayment =
        paymentFilter === "all" || contestant.paymentStatus === paymentFilter;
      const matchesCheckIn =
        checkInFilter === "all" ||
        (checkInFilter === "checked_in" && contestant.checkedIn) ||
        (checkInFilter === "not_checked_in" && !contestant.checkedIn);
      const matchesSearch =
        !query ||
        contestant.name.toLowerCase().includes(query) ||
        contestant.memberNumber?.toLowerCase().includes(query) ||
        contestant.entries.some((entry) =>
          entry.division.toLowerCase().includes(query),
        );
      return matchesPayment && matchesCheckIn && matchesSearch;
    });
  }, [checkInFilter, contestants, paymentFilter, search]);

  return (
    <section className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <div className="flex flex-col gap-3 border-b border-[#e7ebe8] p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex h-10 max-w-md flex-1 items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-[#17201c] outline-none"
            placeholder="Search contestant, member number, or class"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-[#66716b]">
            Payment
            <select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
              className="ml-2 h-10 rounded-md border border-[#d7ddda] bg-white px-3 text-sm text-[#17201c]"
            >
              <option value="all">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid_cash">Paid cash</option>
              <option value="comped">Comped</option>
              <option value="refunded">Refunded</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#66716b]">
            Arrival
            <select
              value={checkInFilter}
              onChange={(event) => setCheckInFilter(event.target.value)}
              className="ml-2 h-10 rounded-md border border-[#d7ddda] bg-white px-3 text-sm text-[#17201c]"
            >
              <option value="all">Everyone</option>
              <option value="checked_in">Checked in</option>
              <option value="not_checked_in">Not checked in</option>
            </select>
          </label>
          <span className="text-xs font-semibold text-[#758078]">
            {filtered.length} of {contestants.length}
          </span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left">
          <thead className="bg-[#f7f8f7] text-[11px] font-bold uppercase text-[#758078]">
            <tr>
              <th className="px-5 py-3">Contestant</th>
              <th className="px-5 py-3">Entries</th>
              <th className="px-5 py-3">Classes</th>
              <th className="px-5 py-3">Arrival</th>
              <th className="px-5 py-3">Payment</th>
              <th className="px-5 py-3 text-right">Total</th>
              <th className="px-5 py-3 text-right">Update</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e7ebe8]">
            {filtered.map((contestant) => (
              <ContestantRow
                key={contestant.personId}
                ropingId={ropingId}
                contestant={contestant}
                divisions={divisions}
                canEdit={canEdit}
              />
            ))}
            {!filtered.length ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-5 py-12 text-center text-sm text-[#758078]"
                >
                  {contestants.length
                    ? "No contestants match these filters."
                    : "No entries have been received yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContestantRow({
  ropingId,
  contestant,
  divisions,
  canEdit,
}: {
  ropingId: string;
  contestant: LedgerContestant;
  divisions: TransferDivision[];
  canEdit: boolean;
}) {
  const hasActiveEntries = contestant.entries.some(
    (entry) => entry.competitionStatus === "active",
  );
  return (
    <tr className="align-top">
      <td className="px-5 py-4">
        <p className="text-sm font-bold">{contestant.name}</p>
        <p className="mt-1 font-mono text-[11px] text-[#758078]">
          {contestant.memberNumber ?? "Guest"}
        </p>
      </td>
      <td className="px-5 py-4 text-sm font-semibold">
        {contestant.entries.length}
      </td>
      <td className="max-w-sm px-5 py-4">
        <div className="flex flex-wrap gap-1.5">
          {contestant.entries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center rounded-md pl-2 text-xs font-semibold ${entry.competitionStatus === "withdrawn" ? "bg-rose-50 text-rose-950" : entry.eligibilityOverridden ? "bg-amber-50 text-amber-950" : "bg-[#f0f2f1]"}`}
            >
              <span className="py-1">
                {entry.division} #{entry.entryNumber}
                {entry.incentiveAdjustment
                  ? ` · ${formatFinalTimeAdjustment(entry.incentiveAdjustment)} sec`
                  : ""}
                {entry.competitionStatus === "withdrawn" ? (
                  <span className="mt-0.5 block font-bold text-rose-700">
                    Withdrawn
                  </span>
                ) : null}
                {entry.transferNote ? (
                  <span className="mt-0.5 block font-normal text-[#66716b]">
                    {entry.transferNote}
                  </span>
                ) : null}
                {entry.options.some((option) => option.selected) ? (
                  <span className="mt-1 block font-normal text-[#66716b]">
                    {entry.options
                      .filter((option) => option.selected)
                      .map((option) => option.title)
                      .join(" · ")}
                  </span>
                ) : null}
                {entry.eligibilityOverridden ? (
                  <span className="mt-1 flex max-w-72 items-start gap-1 font-normal leading-4 text-amber-800">
                    <ShieldAlert size={12} className="mt-0.5 shrink-0" />
                    <span>
                      Eligibility override: {entry.eligibilityIssue}. Reason:{" "}
                      {entry.eligibilityOverrideReason}
                    </span>
                  </span>
                ) : null}
              </span>
              <EntryOptionsDialog
                ropingId={ropingId}
                entryId={entry.id}
                contestantName={contestant.name}
                divisionName={entry.division}
                options={entry.options}
                enabled={canEdit && entry.competitionStatus === "active"}
              />
              <EntryTransferDialog
                ropingId={ropingId}
                entryId={entry.id}
                contestantName={contestant.name}
                currentDivisionId={entry.divisionId}
                currentDivisionName={entry.division}
                divisions={divisions}
                enabled={canEdit && entry.competitionStatus === "active"}
              />
              <EntryWithdrawalDialog
                ropingId={ropingId}
                entryId={entry.id}
                contestantName={contestant.name}
                divisionName={entry.division}
                withdrawn={entry.competitionStatus === "withdrawn"}
                withdrawalReason={entry.withdrawalReason}
                enabled={canEdit}
              />
            </div>
          ))}
        </div>
      </td>
      <td className="px-5 py-4">
        <ContestantCheckInButton
          ropingId={ropingId}
          personId={contestant.personId}
          contestantName={contestant.name}
          checkedIn={contestant.checkedIn}
          checkedInAt={contestant.checkedInAt}
          enabled={canEdit && (hasActiveEntries || contestant.checkedIn)}
        />
      </td>
      <td className="px-5 py-4">
        <span
          className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${paymentStyles[contestant.paymentStatus]}`}
        >
          {paymentLabels[contestant.paymentStatus]}
        </span>
      </td>
      <td className="px-5 py-4 text-right">
        <p className="text-sm font-bold">
          {formatCurrency(contestant.totalCents)}
        </p>
        <details className="group mt-2 text-left">
          <summary className="flex cursor-pointer list-none items-center justify-end gap-1 text-xs font-semibold text-[#66716b]">
            Fee breakdown
            <ChevronDown
              size={14}
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-2 min-w-56 rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-3">
            {contestant.charges.map((charge) => (
              <div
                key={charge.id}
                className="flex items-center gap-2 py-1 text-xs"
              >
                <span
                  className={`min-w-0 flex-1 ${charge.waived ? "line-through opacity-60" : ""}`}
                >
                  {charge.title}
                </span>
                <span className="font-mono font-semibold">
                  {charge.waived
                    ? "Waived"
                    : formatCurrency(charge.amountCents)}
                </span>
                <ChargeWaiverDialog
                  ropingId={ropingId}
                  chargeId={charge.id}
                  title={charge.title}
                  amountCents={charge.amountCents}
                  waived={charge.waived}
                  waiverReason={charge.waiverReason}
                  enabled={canEdit}
                />
              </div>
            ))}
            {!contestant.charges.length ? (
              <p className="text-xs text-[#758078]">No charges</p>
            ) : null}
          </div>
        </details>
      </td>
      <td className="px-5 py-4 text-right">
        <PaymentForm
          ropingId={ropingId}
          contestant={contestant}
          canEdit={canEdit}
        />
      </td>
    </tr>
  );
}

function PaymentForm({
  ropingId,
  contestant,
  canEdit,
}: {
  ropingId: string;
  contestant: LedgerContestant;
  canEdit: boolean;
}) {
  const boundAction = updateContestantPayment.bind(null, ropingId);
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(
    boundAction,
    {},
  );

  return (
    <form action={action} className="inline-flex flex-col items-end gap-1.5">
      <input type="hidden" name="personId" value={contestant.personId} />
      <div className="flex items-center gap-2">
        <select
          name="paymentStatus"
          defaultValue={
            contestant.paymentStatus === "mixed" ? "" : contestant.paymentStatus
          }
          disabled={!canEdit || pending}
          required
          aria-label={`Payment status for ${contestant.name}`}
          className="h-9 rounded-md border border-[#ccd4d0] bg-white px-2 text-xs disabled:bg-[#f1f3f2]"
        >
          {contestant.paymentStatus === "mixed" ? (
            <option value="" disabled>
              Set all entries
            </option>
          ) : null}
          <option value="unpaid">Unpaid</option>
          <option value="paid_cash">Paid cash</option>
          <option value="comped">Comped</option>
          <option value="refunded">Refunded</option>
        </select>
        <button
          disabled={!canEdit || pending}
          className="flex h-9 items-center gap-1.5 rounded-md brand-primary-fill px-3 text-xs font-semibold text-white disabled:opacity-50"
        >
          {pending ? <LoaderCircle size={14} className="animate-spin" /> : null}
          Save
        </button>
      </div>
      {state.message ? (
        <p
          className={`max-w-56 text-xs ${state.success ? "text-emerald-700" : "text-rose-700"}`}
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
