"use client";
import { PersistentForm } from "@/components/ui/persistent-form";
import { EntryLabel } from "./entry-label";
import { ContestantContactDialog } from "./contestant-contact-dialog";

import { useActionState, useMemo, useState } from "react";
import { ChevronDown, LoaderCircle, Search, ShieldAlert } from "lucide-react";
import {
  updateContestantPayment,
  type PaymentFormState,
} from "@/app/(app)/events/[eventId]/entries/actions";
import {
  EntryTransferDialog,
  type TransferDivision,
} from "@/components/events/entry-transfer-dialog";
import {
  EntryOptionsDialog,
  type EntryOptionChoice,
} from "@/components/events/entry-options-dialog";
import { ChargeWaiverDialog } from "@/components/events/charge-waiver-dialog";
import { EntryWithdrawalDialog } from "@/components/events/entry-withdrawal-dialog";
import { ContestantCheckInButton } from "@/components/events/contestant-check-in-button";
import {
  CashPaymentDialog,
  type CashPaymentRecord,
} from "@/components/events/cash-payment-dialog";
import { formatCurrency } from "@/lib/utils";
import { formatFinalTimeAdjustment } from "@/lib/scoring";

type PaymentStatus = "unpaid" | "paid_cash" | "comped" | "refunded";
type PaymentSummary = PaymentStatus | "mixed";

export interface LedgerContestant {
  personId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  memberNumber: string | null;
  paymentStatus: PaymentSummary;
  totalCents: number;
  amountPaidCents: number;
  balanceDueCents: number;
  payments: CashPaymentRecord[];
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
    competitionHold?: string | null;
    membershipId?: string | null;
    options: EntryOptionChoice[];
    competitionStatus: "active" | "withdrawn";
    withdrawalReason: string | null;
  }>;
  charges: Array<{
    id: string;
    entryId: string | null;
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
  mixed: "Mixed statuses",
};

const paymentStyles: Record<PaymentSummary, string> = {
  unpaid: "bg-amber-50 text-amber-800",
  paid_cash: "bg-emerald-50 text-emerald-700",
  comped: "bg-sky-50 text-sky-700",
  refunded: "bg-rose-50 text-rose-700",
  mixed: "bg-[#eef1ef] text-[#59645e]",
};

export function EntryLedger({
  initialPaymentFilter = "all",
  eventId,
  contestants,
  divisions,
  canEdit,
  canOffice = canEdit,
  canCollect = canOffice,
  canAdjust = canEdit,
}: {
  initialPaymentFilter?: string;
  eventId: string;
  contestants: LedgerContestant[];
  divisions: TransferDivision[];
  canEdit: boolean;
  canOffice?: boolean;
  canCollect?: boolean;
  canAdjust?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState(initialPaymentFilter);
  const [checkInFilter, setCheckInFilter] = useState("all");
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contestants.filter((contestant) => {
      const matchesPayment =
        paymentFilter === "all" || contestant.paymentStatus === paymentFilter || (paymentFilter === "unpaid" && contestant.entries.some(entry => entry.paymentStatus === "unpaid"));
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
    <section id="entry-ledger" className="overflow-hidden rounded-md border border-[#dfe4e1] bg-white">
      <header className="space-y-1 border-b border-[#e7ebe8] p-4">
        <h2 className="font-bold">Entries & payments</h2>
        <p className="text-sm leading-6 text-[#526059]">Accepted online requests and office entries appear here. Check-in records arrival; recording cash creates a payment receipt.</p>
      </header>
      <div className="flex flex-wrap items-center gap-3 border-b border-[#e7ebe8] p-4">
        <label className="flex min-h-11 w-80 max-w-full items-center gap-2 rounded-md border border-[#d7ddda] px-3 text-[#758078]">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-[#17201c] outline-none"
            aria-label="Search entries"
            placeholder="Name, member number, or roping"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#66716b]">
            Payment
            <select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
              className="h-11 max-w-full rounded-md border border-[#d7ddda] bg-white px-3 text-sm text-[#17201c]"
            >
              <option value="all">All statuses</option>
              <option value="unpaid">Unpaid</option>
              <option value="paid_cash">Paid cash</option>
              <option value="comped">Comped</option>
              <option value="refunded">Refunded</option>
              <option value="mixed">Mixed statuses</option>
            </select>
          </label>
          <label className="flex flex-wrap items-center gap-2 text-sm font-semibold text-[#66716b]">
            Arrival
            <select
              value={checkInFilter}
              onChange={(event) => setCheckInFilter(event.target.value)}
              className="h-11 max-w-full rounded-md border border-[#d7ddda] bg-white px-3 text-sm text-[#17201c]"
            >
              <option value="all">Everyone</option>
              <option value="checked_in">Checked in</option>
              <option value="not_checked_in">Not checked in</option>
            </select>
          </label>
          <span role="status" className="text-sm font-semibold text-[#66716b]">{filtered.length} of {contestants.length} contestants</span>
          {search || paymentFilter !== "all" || checkInFilter !== "all" ? <button type="button" onClick={() => { setSearch(""); setPaymentFilter("all"); setCheckInFilter("all"); }} className="min-h-11 rounded-md border border-[#d7ddda] px-3 text-sm font-semibold">Clear filters</button> : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="block w-full text-left lg:table lg:min-w-[1120px]">
          <caption className="sr-only">Contestant entries, arrival, charges, and payments</caption>
          <thead className="hidden bg-[#f7f8f7] text-xs font-bold uppercase text-[#66716b] lg:table-header-group">
            <tr>
              <th scope="col" className="px-5 py-3">Contestant</th>
              <th scope="col" className="px-5 py-3">Entries</th>
              <th scope="col" className="px-5 py-3">Ropings</th>
              <th scope="col" className="px-5 py-3">Arrival</th>
              <th scope="col" className="px-5 py-3">Payment</th>
              <th scope="col" className="px-5 py-3 text-right">Charges</th>
              <th scope="col" className="px-5 py-3 text-right">Adjustments</th>
            </tr>
          </thead>
          <tbody className="block lg:table-row-group divide-y divide-[#e7ebe8]">
            {filtered.map((contestant) => (
              <ContestantRow
                key={contestant.personId}
                eventId={eventId}
                contestant={contestant}
                divisions={divisions}
                canEdit={canEdit}
                canOffice={canOffice}
                canCollect={canCollect}
                canAdjust={canAdjust}
              />
            ))}
            {!filtered.length ? (
              <tr className="block lg:table-row">
                <td
                  colSpan={7}
                  className="block px-5 py-12 text-center text-sm text-[#66716b] lg:table-cell"
                >
                  {contestants.length
                    ? "No contestants match these filters."
                    : "No accepted or office entries yet. Accept an online request above or add an office entry to begin."}
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
  eventId,
  contestant,
  divisions,
  canEdit,
  canOffice,
  canCollect,
  canAdjust,
}: {
  eventId: string;
  contestant: LedgerContestant;
  divisions: TransferDivision[];
  canEdit: boolean;
  canOffice: boolean;
  canCollect: boolean;
  canAdjust: boolean;
}) {
  const hasActiveEntries = contestant.entries.some(
    (entry) => entry.competitionStatus === "active",
  );
  return (
    <tr className="grid grid-cols-2 gap-x-3 gap-y-4 p-4 align-top lg:table-row lg:p-0">
      <td className="col-span-2 min-w-0 lg:table-cell lg:px-5 lg:py-4">
        <p className="text-sm font-bold">{contestant.name}</p>
        <p className="mt-1 font-mono text-xs text-[#66716b]">
          {contestant.memberNumber ?? "Guest"}
        </p>
        {canOffice ? <ContestantContactDialog eventId={eventId} roperId={contestant.personId} email={contestant.email ?? null} phone={contestant.phone ?? null} /> : null}
      </td>
      <td className="hidden px-5 py-4 text-sm font-semibold lg:table-cell">
        {contestant.entries.length}
      </td>
      <td className="col-span-2 min-w-0 lg:table-cell lg:max-w-sm lg:px-5 lg:py-4">
        <p className="mb-2 text-xs font-bold text-[#66716b] lg:hidden">Ropings · {contestant.entries.length} {contestant.entries.length === 1 ? "entry" : "entries"}</p>
        <div className="flex flex-wrap gap-1.5">
          {contestant.entries.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center rounded-md pl-2 text-xs font-semibold ${entry.competitionStatus === "withdrawn" ? "bg-rose-50 text-rose-950" : entry.eligibilityOverridden ? "bg-amber-50 text-amber-950" : "bg-[#f0f2f1]"}`}
            >
              <span className="py-1">
                {entry.division} <EntryLabel number={entry.entryNumber} />
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
                {entry.competitionHold && entry.competitionStatus === "active" ? <span className="mt-1 block max-w-72 whitespace-normal font-semibold text-amber-900">{entry.competitionHold}{entry.membershipId && <a href={`/members/${entry.membershipId}`} className="ml-1 underline">Review record</a>}</span> : null}
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
                eventId={eventId}
                entryId={entry.id}
                contestantName={contestant.name}
                divisionName={entry.division}
                options={entry.options}
                enabled={canOffice && entry.competitionStatus === "active"}
              />
              <EntryTransferDialog
                eventId={eventId}
                entryId={entry.id}
                contestantName={contestant.name}
                currentDivisionId={entry.divisionId}
                currentDivisionName={entry.division}
                divisions={divisions}
                enabled={canEdit && entry.competitionStatus === "active"}
              />
              <EntryWithdrawalDialog
                eventId={eventId}
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
      <td className="min-w-0 lg:table-cell lg:px-5 lg:py-4">
        <p className="mb-2 text-xs font-bold text-[#66716b] lg:hidden">Arrival</p>
        <ContestantCheckInButton
          eventId={eventId}
          personId={contestant.personId}
          contestantName={contestant.name}
          checkedIn={contestant.checkedIn}
          checkedInAt={contestant.checkedInAt}
          enabled={canOffice && (hasActiveEntries || contestant.checkedIn)}
        />
      </td>
      <td className="min-w-0 lg:table-cell lg:px-5 lg:py-4">
        <p className="mb-2 text-xs font-bold text-[#66716b] lg:hidden">Payment</p>
        <span
          className={`inline-flex rounded-md px-2.5 py-1 text-xs font-bold ${paymentStyles[contestant.paymentStatus]}`}
        >
          {paymentLabels[contestant.paymentStatus]}
        </span>
        <p className="mt-2 text-sm leading-5 text-[#526059]">
          {contestant.amountPaidCents > 0 && !contestant.payments.some(payment => !payment.voided)
            ? "Marked paid · No cash receipt recorded"
            : `${formatCurrency(contestant.amountPaidCents)} cash recorded`}
        </p>
        <p className="mt-1 text-sm font-semibold tabular-nums">{contestant.balanceDueCents ? `${formatCurrency(contestant.balanceDueCents)} due` : "No balance due"}</p>
        <CashPaymentDialog
          eventId={eventId}
          personId={contestant.personId}
          contestantName={contestant.name}
          balanceDueCents={contestant.balanceDueCents}
          payments={contestant.payments}
          enabled={canCollect && hasActiveEntries}
          canVoid={canAdjust}
        />
      </td>
      <td className="col-span-2 min-w-0 border-t border-[#e7ebe8] pt-3 lg:table-cell lg:border-0 lg:px-5 lg:py-4 lg:text-right">
        <p className="text-sm font-bold tabular-nums">
          <span className="font-normal text-[#66716b] lg:hidden">Charges: </span>{formatCurrency(contestant.totalCents)}
        </p>
        <details className="group mt-2 text-left">
          <summary className="flex cursor-pointer list-none items-center lg:justify-end gap-1 text-sm font-semibold text-[#66716b]">
            Fee breakdown
            <ChevronDown
              size={14}
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="mt-2 w-full lg:min-w-56 rounded-md border border-[#e1e6e3] bg-[#fafbfa] p-3">
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
                  eventId={eventId}
                  chargeId={charge.id}
                  title={charge.title}
                  amountCents={charge.amountCents}
                  waived={charge.waived}
                  waiverReason={charge.waiverReason}
                  enabled={canAdjust}
                />
              </div>
            ))}
            {!contestant.charges.length ? (
              <p className="text-xs text-[#758078]">No charges</p>
            ) : null}
          </div>
        </details>
      </td>
      <td className={canAdjust ? "col-span-2 min-w-0 border-t border-[#e7ebe8] pt-3 lg:table-cell lg:border-0 lg:px-5 lg:py-4 lg:text-right" : "hidden px-5 py-4 text-right lg:table-cell"}>
        {canAdjust ? <details className="group">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs font-semibold text-[#66716b]">Adjust payment status<ChevronDown size={15} className="transition-transform group-open:rotate-180" /></summary>
          <p className="mb-2 max-w-xs text-sm leading-6 text-[#66716b]">Status adjustments do not create or void cash receipts. Use Record cash to record money received.</p>
          <PaymentForm eventId={eventId} contestant={contestant} canEdit={canAdjust} />
        </details> : <span className="text-xs text-[#758078]">-</span>}
      </td>
    </tr>
  );
}

function PaymentForm({
  eventId,
  contestant,
  canEdit,
}: {
  eventId: string;
  contestant: LedgerContestant;
  canEdit: boolean;
}) {
  const boundAction = updateContestantPayment.bind(null, eventId);
  const [state, action, pending] = useActionState<PaymentFormState, FormData>(
    boundAction,
    {},
  );

  return (
    <PersistentForm action={action} onSubmit={(event) => {
      const form = new FormData(event.currentTarget);
      const status = paymentLabels[String(form.get("paymentStatus")) as PaymentStatus];
      if (!window.confirm(`Set all entries for ${contestant.name} to ${status}? This changes payment status, not a cash receipt.`)) event.preventDefault();
    }} className="inline-flex flex-col items-end gap-1.5">
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
          {contestant.paymentStatus === "paid_cash" ? (
            <option value="paid_cash">Paid cash</option>
          ) : null}
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
    </PersistentForm>
  );
}
