"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Plus, UserPlus, X } from "lucide-react";
import {
  addExistingEntry,
  addGuestEntry,
  type EntryFormState,
} from "@/app/(app)/ropings/[ropingId]/entries/actions";
import { cn, formatCurrency } from "@/lib/utils";

const inputClass =
  "mt-2 h-11 w-full rounded-md border border-[#ccd4d0] bg-white px-3 outline-none focus:border-[var(--brand-accent)]";

interface EntryDivision {
  id: string;
  name: string;
  allowGuests: boolean;
  options: Array<{
    id: string;
    title: string;
    amountCents: number;
    kind: string;
    scope: string;
  }>;
}

export function EntryFormDialog({
  ropingId,
  divisions,
  people,
  enabled = true,
}: {
  ropingId: string;
  divisions: EntryDivision[];
  people: Array<{ id: string; name: string; memberNumber: string }>;
  enabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"member" | "guest">("member");
  const existingAction = addExistingEntry.bind(null, ropingId);
  const guestAction = addGuestEntry.bind(null, ropingId);
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
        onClick={() => setOpen(true)}
        className="flex h-10 items-center gap-2 rounded-md brand-primary-fill px-4 text-sm font-semibold text-white disabled:opacity-50"
      >
        <Plus size={17} /> Add entry
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/45 p-4">
          <button
            aria-label="Close dialog"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            className="relative my-8 w-full max-w-xl rounded-md bg-white shadow-2xl"
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
                  onClick={() => setMode("member")}
                  className={cn(
                    "border-b-2 pb-3 text-sm font-bold",
                    mode === "member"
                      ? "border-[var(--brand-accent)] text-[#17201c]"
                      : "border-transparent text-[#758078]",
                  )}
                >
                  Member
                </button>
                <button
                  onClick={() => setMode("guest")}
                  className={cn(
                    "border-b-2 pb-3 text-sm font-bold",
                    mode === "guest"
                      ? "border-[var(--brand-accent)] text-[#17201c]"
                      : "border-transparent text-[#758078]",
                  )}
                >
                  Guest
                </button>
              </div>
            </div>
            {mode === "member" ? (
              <form action={existingFormAction} className="space-y-4 p-5">
                <label className="block text-sm font-semibold">
                  Contestant
                  <select name="personId" className={inputClass} required>
                    <option value="">Choose a member</option>
                    {people.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.memberNumber}
                      </option>
                    ))}
                  </select>
                </label>
                <CommonEntryFields divisions={divisions} />
                <FormMessage state={state} />
                <FormFooter pending={pending} close={() => setOpen(false)} />
              </form>
            ) : (
              <form action={guestFormAction} className="space-y-4 p-5">
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
                    Email
                    <input name="email" type="email" className={inputClass} />
                  </label>
                  <label className="block text-sm font-semibold">
                    Phone
                    <input name="phone" type="tel" className={inputClass} />
                  </label>
                </div>
                <CommonEntryFields
                  divisions={divisions.filter(
                    (division) => division.allowGuests,
                  )}
                />
                <FormMessage state={state} />
                {!divisions.some((division) => division.allowGuests) ? (
                  <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    None of this event’s classes allow guest entries.
                  </p>
                ) : null}
                <FormFooter
                  pending={
                    pending ||
                    !divisions.some((division) => division.allowGuests)
                  }
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

function CommonEntryFields({ divisions }: { divisions: EntryDivision[] }) {
  const [divisionId, setDivisionId] = useState("");
  const options =
    divisions.find((division) => division.id === divisionId)?.options ?? [];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Class
          <select
            name="divisionId"
            value={divisionId}
            onChange={(event) => setDivisionId(event.target.value)}
            className={inputClass}
            required
          >
            <option value="">Choose an class</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold">
          Payment
          <select
            name="paymentStatus"
            defaultValue="unpaid"
            className={inputClass}
          >
            <option value="unpaid">Unpaid</option>
            <option value="paid_cash">Paid cash</option>
            <option value="comped">Comped</option>
          </select>
        </label>
      </div>
      {options.length ? (
        <fieldset>
          <legend className="text-sm font-bold">Optional entry choices</legend>
          <div className="mt-2 space-y-2">
            {options.map((option) => (
              <label
                key={option.id}
                className="flex items-center gap-3 rounded-md border border-[#e1e6e3] p-3"
              >
                <input
                  name="optionIds"
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
          </div>
        </fieldset>
      ) : null}
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
  close,
}: {
  pending: boolean;
  close: () => void;
}) {
  return (
    <div className="flex justify-end gap-2 border-t border-[#e7ebe8] pt-4">
      <button
        type="button"
        onClick={close}
        className="h-10 rounded-md border border-[#ccd4d0] px-4 text-sm font-semibold"
      >
        Cancel
      </button>
      <button
        disabled={pending}
        className="flex h-10 items-center gap-2 rounded-md brand-accent-fill px-4 text-sm font-bold text-white disabled:opacity-50"
      >
        {pending ? <LoaderCircle size={16} className="animate-spin" /> : null}
        Add entry
      </button>
    </div>
  );
}
