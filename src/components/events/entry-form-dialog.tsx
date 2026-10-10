"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Plus, UserPlus, X } from "lucide-react";
import {
  addWalkUpEntries,
  walkUpEligibility,
  type EntryFormState,
} from "@/app/(app)/events/[eventId]/entries/actions";
import { cn, formatCurrency, formatPhoneNumber } from "@/lib/utils";
import { PhoneInput } from "@/components/ui/phone-input";

const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

interface EntryDivision {
  id: string;
  name: string;
  allowGuests: boolean;
  requiresBirthDate?: boolean;
  requiresMaleBirthDate?: boolean;
  options: Array<{
    id: string;
    title: string;
    amountCents: number;
    kind: string;
    scope: string;
  }>;
}

export function EntryFormDialog({
  eventId,
  divisions,
  ropers,
  enabled = true,
  manager = true,
  requireMemberships = true,
}: {
  eventId: string;
  divisions: EntryDivision[];
  ropers: Array<{ id: string; name: string; memberNumber: string; phone?: string | null }>;
  enabled?: boolean;
  manager?: boolean;
  requireMemberships?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"member" | "guest">("member");
  const [personId, setPersonId] = useState("");
  const [selectionCount, setSelectionCount] = useState(0);
  const [guestSelections, setGuestSelections] = useState<string[]>([]);
  const [guestGender, setGuestGender] = useState("");
  const birthDateRequired = divisions.some(division => guestSelections.includes(division.id) && (division.requiresBirthDate || (guestGender === "male" && division.requiresMaleBirthDate)));
  const existingAction = addWalkUpEntries.bind(null, eventId, false);
  const guestAction = addWalkUpEntries.bind(null, eventId, true);
  const [existingState, existingFormAction, existingPending] = useActionState<
    EntryFormState,
    FormData
  >(existingAction, {});
  const [guestState, guestFormAction, guestPending] = useActionState<
    EntryFormState,
    FormData
  >(guestAction, {});
  const state = mode === "member" ? existingState : guestState;
  const pending = mode === "member" ? existingPending : guestPending;
  useEffect(() => {
    if (!existingState.success && !guestState.success) return;
    const timeoutId = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeoutId);
  }, [existingState, guestState]);

  return (
    <>
      <button
        disabled={!enabled}
        onClick={() => { setOpen(true); setPersonId(""); setSelectionCount(0); setMode("member"); setGuestSelections([]); setGuestGender(""); }}
        className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Plus size={17} /> Add entry
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => { if (!pending) setOpen(false); }}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-md bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between border-b border-[#e1e6e3] p-5">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-bold">
                  <UserPlus
                    size={19}
                    className="text-[var(--brand-accent-strong)]"
                  />{" "}
                  Add in-person entry
                </h2>
                <p className="mt-1 text-sm text-[#66716b]">
                  Fees and runs are created automatically.
                </p>
              </div>
              <button
                disabled={pending}
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid h-9 w-9 place-items-center rounded-md hover:bg-[#f0f2f1]"
              >
                <X size={18} />
              </button>
            </header>
            <div className="border-b border-[#e7ebe8] px-5 pt-4">
              <div className="flex gap-5">
                <button
                  onClick={() => { if (mode !== "member") { setMode("member"); setSelectionCount(0); } }}
                  disabled={pending}
                  className={cn(
                    "border-b-2 pb-3 text-sm font-bold",
                    mode === "member"
                      ? "border-[var(--brand-accent)] text-[#17201c]"
                      : "border-transparent text-[#758078]",
                  )}
                >
                  Existing roper
                </button>
                {!requireMemberships && divisions.some(division => division.allowGuests) && <button
                  onClick={() => { if (mode !== "guest") { setMode("guest"); setSelectionCount(0); setGuestSelections([]); setGuestGender(""); } }}
                  disabled={pending}
                  className={cn(
                    "border-b-2 pb-3 text-sm font-bold",
                    mode === "guest"
                      ? "border-[var(--brand-accent)] text-[#17201c]"
                      : "border-transparent text-[#758078]",
                  )}
                >
                  Guest roper
                </button>}
              </div>
            </div>
            {mode === "member" ? (
              <form action={existingFormAction} aria-busy={pending} className="space-y-4 p-5">
                <RoperPicker ropers={ropers} selected={personId} onSelect={id => { setPersonId(id); setSelectionCount(0); }} />
                <CommonEntryFields key={personId} onSelectionCount={setSelectionCount} eventId={eventId} personId={personId} divisions={divisions} manager={manager} />
                <FormMessage state={state} />
                <FormFooter pending={pending} disabled={!personId || !selectionCount} close={() => setOpen(false)} />
              </form>
            ) : (
              <form action={guestFormAction} aria-busy={pending} className="space-y-4 p-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-semibold">
                    First name
                    <input name="firstName" className={inputClass} required />
                  </label>
                  <label className="block text-sm font-semibold">
                    Last name
                    <input name="lastName" className={inputClass} required />
                  </label>
                  <label className="block text-sm font-semibold">
                    Email (optional)
                    <input name="email" type="email" className={inputClass} />
                  </label>
                  <label className="block text-sm font-semibold">
                    Phone
                    <PhoneInput className={inputClass} required />
                  </label>
                  <label className="block text-sm font-semibold">
                    Birth date{birthDateRequired ? "" : " (optional)"}
                    <input
                      name="birthDate"
                      type="date"
                      required={birthDateRequired}
                      className={inputClass}
                    />
                    <span className="mt-1 block text-xs font-normal text-[#758078]">
                      {birthDateRequired ? "Required for a selected roping’s age eligibility." : "Required only when a selected roping uses age eligibility."}
                    </span>
                  </label>
                  <label className="block text-sm font-semibold">
                    Competition gender
                    <select
                      name="competitionGender"
                      value={guestGender}
                      onChange={event => setGuestGender(event.target.value)}
                      className={inputClass}
                      required
                    >
                      <option value="" disabled>
                        Select gender
                      </option>
                      <option value="female">Female</option>
                      <option value="male">Male</option>
                    </select>
                  </label>
                </div>
                <CommonEntryFields
                  onSelectionCount={setSelectionCount}
                  onSelectedIds={setGuestSelections}
                  manager={manager}
                  divisions={divisions.filter(division => division.allowGuests)}
                />
                <FormMessage state={state} />
                <p className="text-sm text-[#66716b]">The roper is saved for future entries. Any missing classification must be confirmed before competing.</p>
                <FormFooter
                  pending={pending}
                  disabled={!selectionCount}
                  close={() => setOpen(false)}
                />
              </form>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function CommonEntryFields({ divisions, manager = true, eventId, personId, onSelectionCount, onSelectedIds }: { divisions: EntryDivision[]; manager?: boolean; eventId?: string; personId?: string; onSelectionCount: (count: number) => void; onSelectedIds?: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [waitlist, setWaitlist] = useState(false);
  const [eligibilityOverride, setEligibilityOverride] = useState(false);
  const [eligibility, setEligibility] = useState<Array<{ roping_id: string; reason: string | null }> | null>(null);
  const [eligibilityError, setEligibilityError] = useState("");
  useEffect(() => {
    if (!personId || !eventId) return;
    let active = true;
    walkUpEligibility(eventId, personId).then(result => {
      if (!active) return;
      setEligibility(result.rows ?? null);
      setEligibilityError(result.error ?? "");
    }).catch(() => { if (active) setEligibilityError("Unable to check eligibility. Select the roper again to retry."); });
    return () => { active = false; };
  }, [eventId, personId]);
  const available = personId !== undefined ? (!personId || !eligibility ? [] : divisions.filter(division => eligibilityOverride || eligibility.some(row => row.roping_id === division.id && !row.reason))) : divisions;
  return (
    <>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" name="waitlist" checked={waitlist} onChange={event => setWaitlist(event.target.checked)} className="h-4 w-4" />Add to waitlist instead of entering</label>
      {waitlist && <p className="text-sm text-[#66716b]">No fees are due until a space is offered and accepted.</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Payment
          <select
            name="paymentStatus"
            defaultValue="unpaid"
            disabled={waitlist}
            className={inputClass}
          >
            <option value="unpaid">Unpaid</option>
            {manager ? <option value="paid_cash">Paid cash</option> : null}
            {manager ? <option value="comped">Comped</option> : null}
          </select>
        </label>
        {waitlist && <input type="hidden" name="paymentStatus" value="unpaid" />}
      </div>
      <fieldset className="min-w-0">
        <legend className="text-sm font-bold">Ropings · {selected.length} selected</legend>
        <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
          {available.map(division => <div key={division.id} className="rounded-md border border-[#e1e6e3] p-3">
            <label className="flex items-center gap-3 text-sm font-semibold">
              <input type="checkbox" name="divisionIds" value={division.id} checked={selected.includes(division.id)} onChange={event => { const next = event.target.checked ? [...selected, division.id] : selected.filter(id => id !== division.id); setSelected(next); onSelectionCount(next.length); onSelectedIds?.(next); }} className="h-4 w-4" />
              {division.name}
            </label>
            {eligibilityOverride && eligibility?.find(row => row.roping_id === division.id)?.reason && <p className="mt-1 text-xs text-amber-800">{eligibility.find(row => row.roping_id === division.id)?.reason}</p>}
            {selected.includes(division.id) && division.options.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3"
              >
                <input
                  name={`options:${division.id}`}
                  value={option.id}
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--brand-accent)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs capitalize text-[#758078]">
                    {option.kind.replace("_", " ")} ·{" "}
                    {option.scope.replaceAll("_", " ")}
                  </span>
                </span>
                <span className="text-sm font-bold">
                  {formatCurrency(option.amountCents)}
                </span>
              </label>
            ))}
          </div>)}
        </div>
        {personId && !eligibility && !eligibilityError && <p role="status" className="mt-2 flex items-center gap-2 text-sm"><LoaderCircle size={16} className="animate-spin" />Checking eligible ropings…</p>}
        {eligibilityError && <p role="alert" className="mt-2 text-sm text-rose-800">{eligibilityError}</p>}
        {!available.length && (!personId || eligibility) && <p className="mt-2 text-sm text-[#66716b]">{personId === "" ? "Select a roper to see eligible ropings." : "No eligible ropings available."}</p>}
      </fieldset>
      <div className="border-t border-[#e7ebe8] pt-4">
        {manager ? <label className="flex items-start gap-3 text-sm font-semibold">
          <input
            name="eligibilityOverride"
            type="checkbox"
            checked={eligibilityOverride}
            onChange={(event) => { setEligibilityOverride(event.target.checked); setSelected([]); onSelectionCount(0); onSelectedIds?.([]); }}
            className="mt-0.5 h-4 w-4 accent-[var(--brand-accent)]"
          />
          <span>
            Approve an eligibility exception
            <span className="mt-1 block text-xs font-normal leading-5 text-[#758078]">
              Use only when event staff has approved an exception to membership,
              classification, or age rules.
            </span>
          </span>
        </label> : null}
        {eligibilityOverride ? (
          <label className="mt-3 block text-sm font-semibold">
            Override reason
            <textarea
              name="eligibilityOverrideReason"
              minLength={5}
              maxLength={300}
              required
              className="mt-2 min-h-20 w-full rounded-md border border-[#ccd4d0] p-3 outline-none focus:border-[var(--brand-accent)]"
              placeholder="Who approved the exception and why?"
            />
            <span className="mt-1 block text-xs font-normal text-[#758078]">
              The failed eligibility rule, this reason, and your account are
              saved in the changelog.
            </span>
          </label>
        ) : (
          <input type="hidden" name="eligibilityOverrideReason" value="" />
        )}
      </div>
    </>
  );
}

function FormMessage({ state }: { state: EntryFormState }) {
  return state.message ? (
    <p
      className={`rounded-md border p-3 text-sm ${state.success ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}
    >
      {state.message}
    </p>
  ) : null;
}

function FormFooter({
  pending,
  disabled = false,
  close,
}: {
  pending: boolean;
  disabled?: boolean;
  close: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4">
      <button
        type="button"
        disabled={pending}
        onClick={close}
        className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
      >
        Cancel
      </button>
      <button
        disabled={pending || disabled}
        className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}
        {pending ? "Saving entries…" : "Add entries"}
      </button>
    </div>
  );
}

function RoperPicker({ ropers, selected, onSelect }: { ropers: Array<{ id: string; name: string; memberNumber: string; phone?: string | null }>; selected: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const person = ropers.find(roper => roper.id === selected);
  const matches = query.trim() ? ropers.filter(roper => `${roper.name} ${roper.memberNumber}`.toLowerCase().includes(query.trim().toLowerCase()) || (query.replace(/\D/g, "").length >= 3 && roper.phone?.replace(/\D/g, "").includes(query.replace(/\D/g, "")))).slice(0, 20) : [];
  return <fieldset className="min-w-0">
    <legend className="text-sm font-semibold">Contestant</legend>
    <input type="hidden" name="personId" value={selected} />
    {person ? <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-[#ccd4d0] p-3"><span className="text-sm font-semibold">{person.name} · {person.memberNumber}</span><button type="button" className="text-sm font-semibold text-[var(--brand-accent-strong)]" onClick={() => { onSelect(""); setQuery(""); }}>Change</button></div> : <>
      <input aria-label="Search ropers by name, number, or phone" autoFocus placeholder="Search name, roper number, or phone" value={query} onChange={event => setQuery(event.target.value)} className={inputClass} />
      {query.trim() && <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-[#e1e6e3]">{matches.map(roper => <button key={roper.id} type="button" onClick={() => onSelect(roper.id)} className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left text-sm hover:bg-[#f0f2f1]"><span className="min-w-0">{roper.name}{roper.phone && <span className="block text-xs text-[#66716b]">{formatPhoneNumber(roper.phone)}</span>}</span><span className="break-all text-xs text-[#66716b]">{roper.memberNumber}</span></button>)}{!matches.length && <p className="p-3 text-sm text-[#66716b]">No matching ropers.</p>}</div>}
    </>}
  </fieldset>;
}
